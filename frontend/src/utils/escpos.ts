/**
 * ESC/POS — the command language every thermal receipt printer speaks.
 *
 * Pure and shared: no React Native, no imports at all, so the web's counter can
 * print through the same encoder later and its tests run under Vitest. The
 * native module only ever receives the bytes this produces.
 *
 * Only the handful of commands a token slip needs, each one documented by what
 * it does on the paper rather than by its hex.
 */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export type EscPosAlign = 'left' | 'center' | 'right';

/** Character magnification, 1 to 3 times in each direction. */
export type EscPosScale = 1 | 2 | 3;

const ALIGN_CODE: Record<EscPosAlign, number> = { left: 0, center: 1, right: 2 };

/**
 * Text the printer's built-in font can draw.
 *
 * A 58mm printer's font is code page 437 — printable ASCII and some box
 * drawing — and has no Devanagari or Gujarati glyphs at all. Characters that
 * have an obvious ASCII spelling get it (₹ is "Rs.", curly quotes are straight);
 * anything else becomes "?" rather than whatever byte the printer would guess.
 */
const ASCII_SPELLINGS: Record<string, string> = {
  '₹': 'Rs.',
  '‘': "'",
  '’': "'",
  '‚': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '–': '-',
  '—': '-',
  '−': '-',
  '…': '...',
  '•': '*',
  '×': 'x',
  ' ': ' ',
  '\t': ' ',
};

export function toReceiptAscii(text: string): string {
  let out = '';
  for (const char of text) {
    const spelled = ASCII_SPELLINGS[char];
    if (spelled !== undefined) {
      out += spelled;
      continue;
    }
    const code = char.charCodeAt(0);
    out += code >= 0x20 && code <= 0x7e ? char : '?';
  }
  return out;
}

/**
 * Whether text prints as itself. A product named in Gujarati does not, and the
 * receipt then falls back to something that does (see `receipt.ts`) rather than
 * printing a row of question marks.
 */
export function isReceiptPrintable(text: string): boolean {
  if (text.trim().length === 0) return false;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= 0x20 && code <= 0x7e) continue;
    if (ASCII_SPELLINGS[char] === undefined) return false;
  }
  return true;
}

/**
 * Builds a command stream. Each call appends and returns the builder, so a
 * receipt reads top to bottom the way it prints.
 */
export class EscPosBuilder {
  private readonly bytes: number[] = [];

  /** ESC @ — back to defaults. Always first, or settings leak from the last job. */
  init(): this {
    this.bytes.push(ESC, 0x40);
    // ESC t 0 — code page 437, the one every printer ships with.
    this.bytes.push(ESC, 0x74, 0);
    return this;
  }

  /** ESC a — where the following lines sit across the paper. */
  align(align: EscPosAlign): this {
    this.bytes.push(ESC, 0x61, ALIGN_CODE[align]);
    return this;
  }

  /** ESC E — emphasised (bold) on or off. */
  bold(on: boolean): this {
    this.bytes.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  /** GS ! — character size. Width scales the column count down with it. */
  size(width: EscPosScale, height: EscPosScale = width): this {
    this.bytes.push(GS, 0x21, ((width - 1) << 4) | (height - 1));
    return this;
  }

  /** Text without a line break, reduced to what the font can draw. */
  text(text: string): this {
    for (const char of toReceiptAscii(text)) this.bytes.push(char.charCodeAt(0));
    return this;
  }

  /** Text and a line break. */
  line(text = ''): this {
    return this.text(text).newline();
  }

  newline(): this {
    this.bytes.push(LF);
    return this;
  }

  /** ESC d n — feed n blank lines. */
  feed(lines: number): this {
    this.bytes.push(ESC, 0x64, Math.max(0, Math.min(255, Math.round(lines))));
    return this;
  }

  /**
   * GS V 66 n — feed past the cutter, then cut, leaving a hinge of paper.
   *
   * Function B is the variant that feeds first, so the last printed line clears
   * the blade without a guessed number of blank lines before it. A printer with
   * no cutter ignores the command, so it is always safe to send.
   */
  cut(): this {
    this.bytes.push(GS, 0x56, 66, 3);
    return this;
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}
