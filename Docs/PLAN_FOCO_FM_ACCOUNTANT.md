# FOCO / FM branches, third-party vendors, UPI QR payments, and the Accountant role

## Context

Today every branch pays the warehouse itself, in one of two ways:
- **Online**: the cashier types a UPI reference and the desk verifies it.
- **COD**: the delivery agent confirms "cash taken" (R22).

There are no vendors and no QR codes. Vatsal's business runs two kinds of branch, buys some items from third-party vendors (TPV, e.g. *Pani*), and wants payment to need no typing.

| | **FOCO** (company operated) | **FM** (franchise) |
| --- | --- | --- |
| Who pays (warehouse and vendors) | **Accountant**, centrally | **Cashier**, directly |
| When | **Only after the goods are delivered** | **Pay now** (scan QR before placing) or **on delivery** (cash, or the agent shows a QR) |
| Cashier at checkout | Orders only | Picks Pay now / Pay on delivery |
| Vendor items | Go to the warehouse desk, which forwards them to the vendor | Cashier sends them to the vendor directly |

**Decisions confirmed with Vatsal (record as *Confirmed* in REQUIREMENTS.md):**
1. **No payment gateway, and no reference typing.** The payer scans a QR (or taps "Pay with UPI app") and taps **"Payment done"**. Whoever *receives* the money confirms it with **"Received"**, which sets the status to **Paid**. The reference becomes optional. A gateway can be added later, for warehouse payments only (vendors are paid into their own accounts, which a gateway cannot see).
2. **Vendors are fully in scope now.**
3. **FOCO has no extra "cashier received" step for warehouse orders.** The agent's Delivered closes it, with no cash question.
4. **The accountant pays FOCO orders only after delivery.** They see the orders as soon as they are placed, and get a **push when one is delivered** ("ready to pay").
5. **The accountant also confirms FM payments** made to the warehouse. Today only the desk does this; afterwards both can. The accountant sees reports, net profit, expenses and supply orders, but **not** payslips, exports or staff records.

## The rules everything follows

- **A QR code is generated from a UPI ID, never uploaded as an image.** It is `upi://pay?pa=<UPI ID>&pn=<name>&am=<exact amount>&cu=INR&tn=<branch code + order nos.>`, so the amount is pre-filled and the order number appears in the receiver's UPI app. An image would need file storage, and the hosted server's disk does not keep files. A UPI ID is one text column.
- **One payee per order.** Warehouse items are paid to the business's **warehouse UPI**; vendor items to **that vendor's UPI**. A cart containing both is **split into one order per supplier** when it is placed.
- **Confirmation follows who receives the money.** If the receiver uses the app (the warehouse: desk or accountant), the payer's tap gives `PAID` ("Payment sent"), and the receiver's tap gives `VERIFIED` ("Paid"). If the receiver is a vendor, or the payer is accounts (FOCO), the payer's record is final and goes straight to `VERIFIED`, because nobody else could confirm it.
- **Payment statuses keep their enum names; only the wording changes**:
  - `PENDING`: "To pay", "Pay on delivery", or "Accounts pays after delivery"
  - `PAID`: "Payment sent — waiting for confirmation"
  - `VERIFIED`: "Paid"
  - `FAILED`: "Payment not received"
- **Only the accountant (and owner/admin) can change where money goes.** Setting a UPI ID is `paymentAccount:manage`, which the warehouse desk deliberately does not hold. Every change records who made it and when, and shows that on the screen. This is the classic way money gets redirected, so it is fenced.

## Flows

**FM — warehouse items**
- **Pay now:** the cart shows the warehouse QR with the exact amount. The cashier pays, taps "Payment done", then places the order, which is `PAID`. The desk or accountant taps **Received** (`VERIFIED`) or **Not received** (`FAILED`). After `FAILED`, the cashier can pay again from the order.
- **Pay on delivery:** the agent's Deliver panel asks how the money was taken:
  - **Cash taken**: R22 as today.
  - **Show QR**: the warehouse QR appears on the *agent's* phone, the cashier scans it with theirs, and the agent taps "Payment done".
  - **Not yet**: R22 as today; the order stays on the road.
  Cash or UPI collected gives `PAID`, which the desk or accountant then confirms.

**FM — vendor items**
- Not sent to the desk. The cashier sends the order to the vendor (a **WhatsApp** button with the order text pre-filled).
- **Pay now:** the vendor QR is shown before placing, and the cashier's tap is final (`VERIFIED`).
- When the goods arrive, the cashier taps **Received**. For a pay-on-delivery order it asks: "Did you pay the vendor? **Cash** / **UPI** (shows the vendor QR) / **Not yet**". "Not yet" leaves a **Pay** button on the order.

**FOCO — warehouse items**
- Placed with no payment question (`ACCOUNTS`, `PENDING`).
- The desk accepts, packs and dispatches as now. The agent taps Delivered with **no cash question**.
- The accountant gets a push. In **Payments**, they select the delivered orders to the same payee, see one QR for the total (or tap "Pay with UPI app"), pay, and tap "Payment done" after a confirmation prompt. The orders go to `VERIFIED`.

**FOCO — vendor items**
- The order lands on the warehouse **desk**, which taps **Send to vendor**: WhatsApp opens and the order becomes `ACCEPTED` ("Sent to vendor").
- When the goods arrive, the cashier taps **Received** (no question). The accountant gets a push and pays the vendor's QR from Payments.

**One phone cannot scan its own screen.** So every QR card also has a **"Pay with UPI app"** button, which uses `Linking.openURL`, a core React Native API. It opens GPay or PhonePe with the amount pre-filled. Scanning works when the QR is on someone else's phone: the agent's, or a second device.

---

## Backend

### 1. Schema + one migration (`backend/prisma/schema.prisma`)
- `enum BranchOperatingModel { FOCO FM }`, plus `Branch.operatingModel @default(FM)`. Existing branches keep today's flow, so nothing is backfilled.
- `MembershipRole` gains `ACCOUNTANT` (appended).
- `SupplyPaymentMode` gains `ACCOUNTS` (never client-chosen).
- New `Vendor` model: `businessId, name, phone?, upiId?, upiName?, upiUpdatedAt?, upiUpdatedByMembershipId?, isActive, createdAt, updatedAt`; `@@unique([businessId, name])`. Vendors are **withdrawn, not deleted** (orders reference them).
- `InventoryItem.vendorId String?`. Null means warehouse stock.
- `Business.supplyUpiId?`, `supplyUpiName?`, `supplyUpiUpdatedAt?`, `supplyUpiUpdatedByMembershipId?`. This is the warehouse payee; one per business.
- `SupplyOrder` gains:
  - `vendorId String?` (null means warehouse)
  - `operatingModel BranchOperatingModel @default(FM)`, a **snapshot** taken at placement, so changing a branch's model never rewrites orders already placed
  - `placementId String?`, so orders split from one cart can be shown together
- One migration directory, with a header comment like `20260923171027_operations_roles`. Nothing in it *uses* the new enum values. If the running backend holds the Prisma DLL during `generate`, stop it, say so, and leave it stopped.

### 2. Permissions (`src/permissions/catalog.js`, plus hand-mirrored `frontend/src/permissions/matrix.json`)
- **New capabilities:**
  - `supplyOrder:receive`: the branch confirms vendor goods arrived. CASHIER.
  - `supplyPayment:settle`: accounts pays FOCO orders. ACCOUNTANT.
  - `supplyPayment:verify`: confirm the warehouse received a branch's payment. **Split out of `supplyOrder:fulfil`**, following CLAUDE.md: add a narrower capability rather than grant the broader one. WAREHOUSE and ACCOUNTANT.
  - `paymentAccount:manage`: set or change the warehouse and vendor UPI IDs. ACCOUNTANT only. The desk is deliberately excluded.
- **Vendor list:** create, rename, phone and withdraw ride on the existing `supplyItem:manage` (desk); reading rides on `supplyItem:view`.
- **The ACCOUNTANT role:** `branch:allAccess`, `supplyItem:view`, `supplyOrder:view`, `supplyPayment:settle`, `supplyPayment:verify`, `paymentAccount:manage`, `expense:view`, `expense:viewAllBranches`, `analytics:viewBranch`, `analytics:viewBusiness`. No `staff:*`, `team:*`, `payroll:*`, `export:*`, counter or cart.
- ADMIN and MANAGER pick these up by derivation; OWNER is `*`.
- `supplyOrder:fulfil`'s description drops "verify its payment".
- Invite, team row, staff base and tenant scope already key off `branch:allAccess`, so the Accountant is business-wide everywhere with no special-casing.

### 3. Branches, vendors, payees
- `business.validation.js` / `business.service.js`: `operatingModel` on create and update.
- **New `vendor.routes/controller/service/validation`:**
  - `GET /vendors` (`supplyItem:view`)
  - `POST /vendors` and `PATCH /vendors/:vendorId` (`supplyItem:manage`)
  - `PATCH /vendors/:vendorId/upi` (`paymentAccount:manage`)
- **New payment-account endpoints:** `GET/PATCH /payment-account` (`paymentAccount:manage`), for the warehouse UPI.
- `isValidUpiId` goes in `validations/shared.js` (`^[\w.\-]{2,256}@[A-Za-z]{2,64}$`). Every UPI write stamps the `…UpdatedAt` / `…UpdatedBy` fields.
- **Supply items:** `supplyItem.service.js` create and update accept `vendorId` (it must belong to this business and be active). `resolveOrderable` refuses an item whose vendor is withdrawn (`SUPPLY_VENDOR_INACTIVE`).

### 4. Supply orders (`services/supplyOrder.service.js`)
- **Status machine as data, per supplier.** Keep `TRANSITIONS` for warehouse orders, and add `VENDOR_TRANSITIONS`:
  ```
  DRAFT    → PLACED, CANCELLED
  PLACED   → ACCEPTED, DELIVERED, CANCELLED
  ACCEPTED → DELIVERED, CANCELLED
  ```
  - `assertTransition(order, to)` picks the table by `order.vendorId`.
  - Pack, dispatch, assign and agent-deliver are therefore refused for vendor orders by the table itself. Assign also gets an explicit `SUPPLY_ORDER_VENDOR_ORDER` guard.
- `ORDER_INCLUDE` adds:
  - `vendor { id, name, phone, upiId, upiName }`
  - `branch.operatingModel`
  - `business { name, supplyUpiId, supplyUpiName }`
  This is so the payee travels with every order.
- **`placeOrder`** becomes split-and-place, in one transaction:
  - Lock the cart and group its lines by the item's vendor. Warehouse lines stay on the cart row; each vendor's lines move to a new `SupplyOrder`. All share one `placementId` and each gets its own number.
  - **FOCO:** every order is `ACCOUNTS`/`PENDING`, and any client mode is ignored (old app builds keep working).
  - **FM:** `paymentMode` is required (`SUPPLY_ORDER_PAYMENT_MODE_REQUIRED`).
    - `ONLINE` ("Pay now") requires `paymentConfirmed: true`. A legacy `paymentReference` also counts as confirmation. Warehouse orders become `PAID`; vendor orders become `VERIFIED`.
    - Every payee must have a UPI ID set (`SUPPLY_PAYEE_NOT_SET`, `{ payee }`).
    - `COD` stays `PENDING`.
  - Response: the first order plus `placedOrders: [{ id, orderNumber, vendorName }]`.
- **`deliverOrder`** (agent, warehouse orders only):
  - Accepts `collectedVia: 'CASH' | 'UPI'`. Legacy `cashCollected: true` means CASH.
  - The existing "required while COD is outstanding" rule is unchanged.
  - The event code is `PAYMENT_COLLECTED` or `PAYMENT_COLLECTED_UPI`.
  - An `ACCOUNTS` order still asks no question (the check is `COD && PENDING`).
- **New `receiveOrder`** (vendor orders, `supplyOrder:receive`): moves to `DELIVERED`. FM COD requires `vendorPaid: 'CASH' | 'UPI' | 'NOT_YET'`; CASH and UPI give `VERIFIED`.
- **New `recordPayment`** (cashier, `supplyOrder:create`, FM only): for an order in `PENDING` or `FAILED`, records `method: 'UPI' | 'CASH'` (cash only for vendor orders) and an optional reference. Warehouse orders become `PAID`; vendor orders `VERIFIED`. This covers pay-later, pay-again after "Not received", and paying a vendor later.
- **`verifyPayment`** is re-guarded by `supplyPayment:verify` and relabelled in the app as Received / Not received. It refuses `ACCOUNTS` and vendor orders.
- **New `settlePayments`** (`supplyPayment:settle`), body `{ supplyOrderIds (1–100, unique), paymentReference? }`:
  - Lock the rows **in id order**, so two accountants with overlapping batches cannot deadlock.
  - Every order must be `ACCOUNTS` + `PENDING` + **`DELIVERED`** (`SUPPLY_PAYMENT_NOT_DELIVERED`) and the **same payee** (`SUPPLY_PAYMENT_MIXED_PAYEES`). One bad order refuses **the whole batch**.
  - Each order becomes `VERIFIED` with one `PAYMENT_SETTLED` event.
- **Lists**, through `takeNewest` with `MAX_ORDERS`, using a slim include with no event timeline:
  - `listPaymentsDue`: FOCO `ACCOUNTS` + `PENDING`, not cancelled, including those not yet delivered. The app shows them as "On the way".
  - `listPaymentsToConfirm`: warehouse orders in `PAID`.
  - `listDeskOrders`: warehouse orders, plus vendor orders whose snapshot `operatingModel` is FOCO. FM vendor orders never reach the desk.

### 5. Routes (`routes/supply.routes.js`), validators, errors
- `POST /supply-orders/:id/receive` (`supplyOrder:receive`)
- `POST /supply-orders/:id/pay` (`supplyOrder:create`)
- `GET /supply-payments/due` and `POST /supply-payments/settle` (`supplyPayment:settle`)
- `GET /supply-payments/to-confirm` (`supplyPayment:verify`)
- `verify-payment` is re-guarded.
- FOCO vendor forwarding **reuses `/accept`**: for a vendor order, "accepted" means "sent to vendor", so no new endpoint is needed.
- New error codes go in `errors/catalog.js`, with wording in `errors.api.*` × 4 locales: `SUPPLY_ORDER_PAYMENT_MODE_REQUIRED`, `SUPPLY_PAYEE_NOT_SET`, `SUPPLY_VENDOR_INACTIVE`, `SUPPLY_ORDER_VENDOR_ORDER`, `SUPPLY_ORDER_SETTLED_BY_ACCOUNTS`, `SUPPLY_PAYMENT_NOT_DELIVERED`, `SUPPLY_PAYMENT_MIXED_PAYEES`, `SUPPLY_PAYMENT_NOT_DUE`.

### 6. Notifications (`notifications/triggers.js`, `services/notification.service.js`, `labels.js`)
- Extend `membersWith`/`notifyCapability` with `{ unless }`. It is the same `holds/unless` shape Home and the tab bar use, so "accountants, not the owner" stays an allow-list off the matrix.
- New code **`SUPPLY_ORDER_READY_TO_PAY`**: sent when a FOCO order reaches `DELIVERED` (from agent deliver or cashier receive). It goes to holders of `supplyPayment:settle` unless they hold `team:invite`, and deep-links to Payments.
- New code **`SUPPLY_PAYMENT_SENT`**: sent on every `PAID` claim, to holders of `supplyPayment:verify` unless they hold `team:invite`, so a payment gets confirmed promptly.
- Both codes use category `orders`, with labels in 4 languages, an app key, and the `NOTIFICATION_CODES` mirror in `types/notification.ts`.

### 7. Reports and export: vendor money leaves the business
- `analytics.service.js`:
  - Material spend is grouped by `branchId` and **whether `vendorId` is null**.
  - The branch row's `materialSpend` stays the total (both are that branch's cost), and gains a `vendorSpend` field.
  - In the business roll-up, `internalTransfer` = **warehouse orders only**, and `netProfit = sales − expenses − payroll − vendorSpend`.
  - The identity `Σ(branch netProfit) + internalTransfer === businessNetProfit` still holds; `analytics.test.js` proves it with a vendor order.
- `NetProfitCard.tsx` and `CrossBusinessSection.tsx` gain a "Paid to vendors" line, and the reconciliation sentence is updated.
- Export (`export.service.js`, `export.workbook.js`, `export.labels.js` × 4): supply rows gain a **Supplier** column, and the payment labels cover `ACCOUNTS` and the new wording.

---

## Frontend

### 1. Shared pieces
- **`utils/upi.ts`:**
  - `buildUpiUri({ upiId, name, amount, note })`, with URL-encoding and the amount to 2 decimals
  - `isValidUpiId`
  - `payeeOf(order)` (the vendor, or the business warehouse UPI)
  - `openUpiApp(uri)`, which calls `Linking.openURL` inside try/catch and shows "No UPI app found" on failure
- **QR rendering:** the **`qrcode`** package (pure JS; its core encoder only) plus our own `components/payments/QrCode.tsx`, drawn with the already-installed `react-native-svg`. That is one small JS dependency and **no native rebuild**. Before adding it, prove it in a scratch directory and with `npx expo export`, per CLAUDE.md's dependency discipline.
- **`components/payments/UpiPayCard.tsx`:** payee name and UPI ID; the amount (large); the QR, sized from `useWindowDimensions` (`min(width − gutters, 240)`); a **Pay with UPI app** button; a one-line hint ("Scan from another phone, or open your UPI app here"); and a **Payment done** button. If the payee has no UPI ID it shows "QR not set — ask accounts" instead. Stacked vertically, so nothing competes for a row in Gujarati.
- **Stores** (each with `loadedFor`, deduped requests, keeps its last data on failure):
  - `store/vendorStore.ts`: read by the catalog, the item form, the vendors screen and payment accounts.
  - `store/supplyPaymentStore.ts`: read by Payments, the Home cards and order detail. Every pay, settle, receive or confirm refreshes it before navigating.

### 2. Screens
- **Add branch / Branch settings:** "Who pays for raw material?" as an **`OptionRow`** pair (FOCO / FM, a sentence each), hidden for a warehouse. Add branch has **no preselection**: submit waits for a choice. Settings adds the hint "Applies to orders placed from now on". `BranchesSection` shows FOCO/FM in the meta line.
- **Settings → Payment QR codes** (new `PaymentAccountsScreen`, `paymentAccount:manage`):
  - The warehouse UPI ID and name, with a live QR preview and "Changed by X on date".
  - Below it, every vendor with a "QR set ✓ / Not set" badge; tapping one edits its UPI.
- **Vendors** (new `VendorsScreen` + `VendorFormScreen`, `supplyItem:manage`): name, phone (for WhatsApp), withdraw/restore (the withdraw direction asks first, via `utils/confirm.ts`). Reached from the raw-material catalog. The "QR not set" badge tells the desk to ask accounts.
- **`SupplyItemFormScreen`:** "Supplied by" as an `OptionRow` list (Warehouse stock + active vendors). The list grows with vendors, so a list rather than chips.
- **`SupplyCatalogScreen`:** a `SectionList` with one section per supplier.
- **`SupplyCartScreen`:**
  - Lines grouped by supplier, with a subtotal for each.
  - **FOCO:** one info row: "Accounts pays after delivery."
  - **FM:** Pay now / Pay on delivery (two options → `SegmentedOption`). With **Pay now**, each supplier section shows an `UpiPayCard`, and **Place** stays disabled until every section is marked "Payment done".
  - The tray is stacked: total, then the button.
  - After placing: one order opens its detail; several orders open the orders list.
- **`SupplyOrderDetailScreen`:** shows the supplier and the payee, plus the relabelled pills. The next actions depend on who is looking:
  - **Cashier (FM):** **Pay ₹X** (an `UpiPayCard` panel, with the optional reference field collapsed); **Send to vendor** (WhatsApp, `Linking`); **Received** on a vendor order, with the Cash / UPI / Not yet panel for a pay-on-delivery order.
  - **Cashier (FOCO):** **Received** on a vendor order, with no question.
  - **Agent:** Deliver opens the panel *Cash taken* / *Show QR* (an `UpiPayCard` on the agent's phone) / *Not yet*.
  - **Desk (FOCO vendor order):** **Send to vendor**, which opens WhatsApp and calls accept.
  - **Desk or accountant:** **Received** / **Not received** on a `PAID` warehouse payment. "Not received" asks first.
- **New `SupplyPaymentsScreen`:**
  - Two segments: **To pay** (`supplyPayment:settle`) and **To confirm** (`supplyPayment:verify`).
  - **To pay** is a `SectionList` grouped **by payee**. Each section header is stacked: payee; then "Ready ₹X · N orders"; then **Pay all ready**.
    - Delivered rows can be selected. Rows not yet delivered are dimmed and labelled "On the way — pay after delivery".
    - Selection stays within one payee.
    - The tray shows the selected total and **Pay ₹X**, which opens an `UpiPayCard` with one QR for the whole total. **Payment done** asks first, then settles.
  - **To confirm** lists `PAID` rows with a **Received** button that asks first. Tapping a row opens the order.
- **Tab bar** (`TabNavigator.tsx`): `Payments`, `capability: 'supplyPayment:settle'`, `demoteWhen: { holds: 'team:invite' }`.
  - The Accountant's tabs are Home · Payments · Staff · Reports · Settings, which is exactly the 5-tab budget.
  - Owner, admin and manager keep their 5 tabs and reach Payments from Home.
- **Home** (`SECTIONS`):
  - "Payments ready — ₹X across N orders", for `supplyPayment:settle`.
  - "Payments to confirm", for `supplyPayment:verify`, hidden when the person also holds `supplyPayment:settle`; the accountant has both lists in one tab.
- **Invite:** `ROLE_ICONS.ACCOUNTANT` (`tsc` forces it), `roles.ACCOUNTANT`, `invite.roleHint_ACCOUNTANT`. `permissions/explain.ts` gets `ACTION_KEYS` for the four new capabilities.
- Navigation (`AppNavigator`, `routeAccess.ts`) for the new screens.

### 3. Translations: all four locales
Every new string, rendered with `t()`, in en/hi/gu/mr. This includes:
- the **WhatsApp order text**, composed on the device so it goes in the sender's language
- the relabelled payment statuses
- the reason codes `PAYMENT_BY_ACCOUNTS`, `PAYMENT_SETTLED`, `PAYMENT_COLLECTED_UPI`, `PAYMENT_PAID_VENDOR`

---

## Implementation order (each phase ends green on tests and lint gates)
1. **Foundations:**
   - schema + migration
   - permissions and the Accountant role
   - branch model
   - vendors and payee endpoints
   - `utils/upi.ts`, `QrCode`, `UpiPayCard`
   - the Payment QR codes and Vendors screens
2. **Ordering:**
   - supplier on items, the catalog sections
   - split-and-place, FOCO/FM placement
   - receive, the FOCO desk forward, WhatsApp
   - agent UPI collection, cashier pay/re-pay, Received/Not received
3. **Accounts:**
   - due and to-confirm lists
   - settle
   - the two pushes
   - the Payments tab and the Home cards
4. **Reports, export, docs.**

At the end of phases 2 and 3, Vatsal checks the new screens on the device.

## Docs (same change)
- **`REQUIREMENTS.md`:**
  - Roles table: add Accountant.
  - **R24** FOCO/FM branches; **R25** third-party vendors; **R26** UPI QR payments with receiver confirmation; **R27** the Accountant. Each with the *Confirmed* decisions above.
  - §5: decisions on vendor spend in net profit, and on no gateway.
  - §6: gateway auto-detection remains out of scope.
  - **Task 12**.
- **`PROJECT_FLOW.md`:** Task 12 phases and their status.
- **`database-table.md`:** `Vendor`, the new columns, `BranchOperatingModel`, `ACCOUNTANT`, `ACCOUNTS`.
- **`TESTING_GUIDE.md`:** one walkthrough each for FM pay-now, FM on-delivery (cash and agent QR), an FM vendor order, a FOCO warehouse order, a FOCO vendor order, the accountant paying a batch, and setting up the QR codes.
- **Known limitations** (in `TESTING_GUIDE.md`):
  - Payment is not detected automatically; the receiver confirms it.
  - Some UPI apps refuse "Pay with UPI app" for a *personal* UPI ID, so use a business UPI ID; scanning from another phone always works.
  - One payment choice per FM cart.
  - Refunds for paid-then-cancelled orders are out of scope.
  - One warehouse UPI per business.
  - Vendors don't use the app; "sent to vendor" is the sender's tap.
- **`CLAUDE.md`:** eight roles; the `supplyPayment:verify` split; "only `paymentAccount:manage` changes where money goes"; vendor spend is not an internal transfer.
- **Refresh `Docs/PLAN_FOCO_FM_ACCOUNTANT.md`** from this plan, and delete it once the four docs above carry it.

## Tests (`backend/tests/`)
- **`supply-order.test.js`:**
  - a mixed cart splits into one order per supplier, with numbers and a shared `placementId`
  - FOCO placement → `ACCOUNTS`, ignoring any client mode
  - FM pay-now without confirmation → 400, and with a payee missing its UPI ID → 400
  - pay-now: warehouse order → `PAID`, vendor order → `VERIFIED`
  - agent collects by UPI → `PAID`
  - FOCO deliver with no question
  - vendor orders: receive works; deliver, pack and dispatch are refused
  - the FM vendor receive question
  - pay again after `FAILED`
  - settle: refuses undelivered orders, refuses mixed payees, applies to all or none
  - desk queue includes FOCO vendor orders and excludes FM ones
- **`permissions.test.js`:**
  - the Accountant can read analytics, the due list, settle, confirm and manage UPI IDs
  - the Accountant cannot accept, dispatch, use a cart, or read staff or team
  - **the desk cannot change any UPI ID**
  - a cashier can receive and pay, but cannot settle
- **New `vendor.test.js`:** vendor CRUD, UPI validation, the audit stamp, tenant isolation.
- **`branch-settings.test.js`:** the operating model.
- **`analytics.test.js`:** vendor spend is subtracted at the business level, and the identity still holds.
- **`notification.test.js`:** both new pushes go to the accountant only.

## Verification
- `cd backend && npm test`
- `cd frontend && npm run lint && npm run lint:i18n && npm run lint:errors && npm run lint:permissions && npm run lint:backend-i18n && npm run lint:notification-prose`
- `cd frontend && npx expo export --platform android --output-dir <tmp>` proves the QR dependency bundles. This does not start a dev server.
- **Design:** the dev servers are Vatsal's. Check the geometry by arithmetic at 320dp and 393dp, against the Gujarati strings, for:
  - the `UpiPayCard` QR size
  - the cart's supplier sections and tray
  - the Payments section header and tray
  - the agent's Deliver panel
  - the OptionRow pickers
  - the Accountant's 5 tabs

  Then Vatsal checks on the device:
  1. Payment QR setup
  2. An FM pay-now cart
  3. The agent showing a QR
  4. A FOCO vendor order via the desk
  5. The accountant paying a batch

## Not in this change
- A payment gateway with automatic detection (it could be added later, for warehouse payments only).
- Vendors logging into the app.
- Refunds.
