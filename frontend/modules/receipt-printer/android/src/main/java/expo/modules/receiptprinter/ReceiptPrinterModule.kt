package expo.modules.receiptprinter

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.IOException
import java.util.Timer
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.schedule

/** The Serial Port Profile every Bluetooth receipt printer speaks. */
private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

/**
 * Bytes per write. A cheap printer's buffer is small; RFCOMM does the flow
 * control, but one enormous write is where the clones drop bytes.
 */
private const val CHUNK_BYTES = 512

/**
 * A failure the app can name in the reader's language. The code is the contract
 * with `src/utils/printer.ts`; the message is only for logs.
 */
class PrinterException(code: String, message: String, cause: Throwable? = null) :
  CodedException(code, message, cause)

/**
 * Prints raw ESC/POS bytes to a paired Bluetooth receipt printer.
 *
 * Deliberately four calls and no more: list the paired printers, open a socket
 * to one, write bytes, close. What the bytes say is built in TypeScript
 * (`src/utils/escpos.ts`, `src/utils/receipt.ts`), where it can be tested and
 * shared with the web, so this file never needs to change when the receipt does.
 *
 * Every call runs on the IO dispatcher, never on Expo's shared module queue: a
 * Bluetooth connect can block for seconds, and blocking that queue would stall
 * every other module — including the file writes that save a sale.
 */
class ReceiptPrinterModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  /** One job at a time: two writes interleaving on one socket print garbage. */
  private val lock = Mutex()
  private var socket: BluetoothSocket? = null
  private var socketAddress: String? = null

  override fun definition() = ModuleDefinition {
    Name("ReceiptPrinter")

    AsyncFunction("getBondedDevices") Coroutine { ->
      withContext(Dispatchers.IO) { bondedDevices() }
    }

    AsyncFunction("connect") Coroutine { address: String, timeoutMs: Int ->
      lock.withLock {
        withContext(Dispatchers.IO) { ensureConnected(address, timeoutMs.toLong()) }
      }
      true
    }

    AsyncFunction("write") Coroutine { bytes: List<Int> ->
      lock.withLock {
        withContext(Dispatchers.IO) { writeBytes(bytes) }
      }
      true
    }

    AsyncFunction("disconnect") Coroutine { ->
      lock.withLock {
        withContext(Dispatchers.IO) { closeQuietly() }
      }
      true
    }

    OnDestroy {
      closeQuietly()
    }
  }

  @SuppressLint("MissingPermission")
  private fun bondedDevices(): List<Map<String, String>> =
    readyAdapter().bondedDevices.orEmpty().map { device ->
      mapOf("name" to (device.name ?: ""), "address" to device.address)
    }

  /**
   * The adapter, once it is known to be usable. Each failure is its own code
   * because each one asks the cashier to do something different.
   */
  private fun readyAdapter(): BluetoothAdapter {
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    val adapter = manager?.adapter ?: throw PrinterException("NO_BLUETOOTH", "This device has no Bluetooth")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
      context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
    ) {
      throw PrinterException("PERMISSION_DENIED", "The Nearby devices permission has not been granted")
    }
    if (!adapter.isEnabled) throw PrinterException("BLUETOOTH_OFF", "Bluetooth is turned off")
    return adapter
  }

  /**
   * Reuses the open socket when it is to the same printer, which is what makes a
   * reprint near-instant; otherwise opens a new one.
   *
   * Three ways in, because the clones disagree about which one they answer: the
   * secure SPP socket, the insecure one, and the hidden channel-1 socket that
   * many cheap printers only accept. Each gets the whole timeout.
   */
  @SuppressLint("MissingPermission")
  private fun ensureConnected(address: String, timeoutMs: Long) {
    val current = socket
    if (current != null && socketAddress == address && current.isConnected) return
    closeQuietly()

    val adapter = readyAdapter()
    if (!BluetoothAdapter.checkBluetoothAddress(address)) {
      throw PrinterException("PRINTER_UNREACHABLE", "Not a Bluetooth address: $address")
    }
    val device = adapter.getRemoteDevice(address)
    val attempts: List<() -> BluetoothSocket> = listOf(
      { device.createRfcommSocketToServiceRecord(SPP_UUID) },
      { device.createInsecureRfcommSocketToServiceRecord(SPP_UUID) },
      {
        device.javaClass
          .getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
          .invoke(device, 1) as BluetoothSocket
      },
    )

    var lastError: Throwable? = null
    for (make in attempts) {
      val candidate = try {
        make()
      } catch (e: Exception) {
        lastError = e
        continue
      }
      if (connectWithin(candidate, timeoutMs)) {
        socket = candidate
        socketAddress = address
        return
      }
    }
    throw PrinterException("PRINTER_UNREACHABLE", "Could not reach the printer at $address", lastError)
  }

  /**
   * `BluetoothSocket.connect()` has no timeout of its own and can hang for a long
   * time on a printer that is switched off. A watchdog closes the socket when the
   * time is up, which makes the blocked connect throw. The state flag settles the
   * race between the two so a socket that connected just in time is not closed.
   */
  @SuppressLint("MissingPermission")
  private fun connectWithin(candidate: BluetoothSocket, timeoutMs: Long): Boolean {
    val state = AtomicInteger(PENDING)
    val watchdog = Timer(true)
    watchdog.schedule(timeoutMs) {
      if (state.compareAndSet(PENDING, TIMED_OUT)) closeQuietly(candidate)
    }
    return try {
      candidate.connect()
      if (state.compareAndSet(PENDING, CONNECTED)) {
        true
      } else {
        closeQuietly(candidate)
        false
      }
    } catch (e: IOException) {
      closeQuietly(candidate)
      false
    } finally {
      watchdog.cancel()
    }
  }

  private fun writeBytes(bytes: List<Int>) {
    val current = socket?.takeIf { it.isConnected }
      ?: throw PrinterException("NOT_CONNECTED", "No printer is connected")
    val data = ByteArray(bytes.size) { index -> bytes[index].toByte() }
    try {
      val out = current.outputStream
      var offset = 0
      while (offset < data.size) {
        val length = minOf(CHUNK_BYTES, data.size - offset)
        out.write(data, offset, length)
        offset += length
      }
      out.flush()
    } catch (e: IOException) {
      // A printer switched off still looks connected until a write fails, so a
      // failed write is also how a dead socket is found. Drop it; the next
      // connect opens a fresh one.
      closeQuietly()
      throw PrinterException("WRITE_FAILED", "The printer stopped responding", e)
    }
  }

  private fun closeQuietly() {
    socket?.let { closeQuietly(it) }
    socket = null
    socketAddress = null
  }

  private fun closeQuietly(target: BluetoothSocket) {
    try {
      target.close()
    } catch (_: IOException) {
      // Already closed, which is the state we wanted.
    }
  }

  private companion object {
    const val PENDING = 0
    const val CONNECTED = 1
    const val TIMED_OUT = 2
  }
}
