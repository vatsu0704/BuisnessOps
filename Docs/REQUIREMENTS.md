# Requirements — Branch Operations

This document captures the requirements for turning BizIQ from a reporting product
into an operations product, and breaks them into the tasks that build them. It is the
source of truth for *what* is being built and *why*; [PROJECT_FLOW.md](PROJECT_FLOW.md)
tracks *where each task has got to*, and [database-table.md](database-table.md) holds
the data model those tasks produce.

The requirements were given in Gujarati/English mix. Each one below records the intent
in English, who it is for, what it needs from the system, and how you know it is done.
Where a requirement was ambiguous, the answer given during planning is recorded inline
with the word **Confirmed** — those are decisions, not guesses, and should not be
re-litigated without going back to Vatsal.

**A note on numbering.** The original list runs 1, 2, 3, 4, 5, 7, 8 … 17 — there is no
6. The sentence trailing requirement 5 ("Material tracking, order tracking, dispatch
and payment mode") was almost certainly meant to be 6; it is recorded here as **R5.1**
rather than renumbering everything, so a reference to "requirement 14" still means the
same thing in the original list and in this document.

---

## 1. What changes about the product

BizIQ today **analyses** a business. Sales arrive as a CSV export from a POS, and the
app reports on them. Attendance and payroll were added later. Nothing in the app
creates a business transaction.

These requirements make BizIQ **run** the business:

- A branch takes counter orders and issues tokens, and the day's sales are a
  by-product of that rather than a file someone uploads later.
- A branch orders raw material from a central warehouse, pays for it, and tracks it
  until it arrives.
- A warehouse desk fulfils those orders across every branch and reports delays.
- A delivery agent carries them and marks them delivered.
- A branch logs what it spent today, by category.
- An admin sees net profit per branch per month, across several businesses held in one
  account.

Two consequences fall out of that and are worth stating up front:

1. **The role model has to change first.** Six of these requirements name a role that
   does not exist. See §2.
2. **The AI chat surface is hidden, not built.** R7 removes it from the UI until the
   query engine exists. Everything in `PROJECT_FLOW.md` Phase 2 stays planned.

---

## 2. Roles

### The role set

| Role | Scope | What it is for |
| --- | --- | --- |
| `OWNER` | Every business they created | The account that signed up. The only role that cannot be invited — there is exactly one per business, by construction. |
| `ADMIN` | One whole business | Full access, delegated by the owner. |
| `MANAGER` | One whole business | **Widened by R14** — now equivalent to `ADMIN`, granted per business by an admin. Was branch-scoped. |
| `WAREHOUSE` | Every branch's *orders*, no branch's *people* | The central order desk (R3, R9). Sees supply orders from all branches, fulfils and dispatches them, posts delays. Deliberately cannot read HR records. |
| `CASHIER` | Their granted branches | The branch operator (R1, R5, R10, R11, R14). Counter billing, supply orders, expenses, and their own branch's staff including pay. |
| `DELIVERY_AGENT` | Their granted branches | Carries supply orders, marks status, posts delays with a reason, punches their own attendance (R12). |
| `STAFF` | Themselves | Own attendance and own payslips. Unchanged. |

### Why the role code changes, not just the enum

> "Need to adjust the design according that, **add role which is standard way**."

Authorization today is a role *name* checked at the point of use: 27 repetitions of
`requireRole('OWNER', 'ADMIN')`, plus four hand-written checks written as **deny-lists**
— `if (role === 'STAFF') return false`. An allow-list fails closed when a new role
appears, which is safe. A deny-list fails **open**. With the enum as it is today, adding
`DELIVERY_AGENT` would silently grant it the right to read every colleague's HR record,
because a delivery agent is not `STAFF` and therefore falls through.

So the standard-way change is a **capability matrix**: roles are granted named
capabilities, and code asks "does this membership have `staff:setPay`?" rather than "is
this role one of these four strings?". Default-deny — a capability nobody was granted is
denied.

The matrix is defined once in `backend/src/permissions/catalog.js`, mirrored to
`frontend/src/permissions/matrix.json`, and a CI script fails the build if the two
drift. That mirrors how the error catalog and the translation files are already kept
honest (`npm run lint:errors`, `npm run lint:i18n`).

Capability names read `resource:action` — `team:invite`, `branch:allAccess`,
`staff:setPay`, `counterOrder:create`, `supplyOrder:fulfil`, `expense:log`,
`analytics:viewBusiness`, `export:dayEnd`. The frontend uses the **same strings** to
decide which tabs and screens to render, so a control that appears is a control whose
API call will succeed.

### One sentinel that now means two things

`req.branchAccess === null` currently means both "all branches, for data" and
"business-wide authority over people" — the same set while that set was
`{OWNER, ADMIN}`. `WAREHOUSE` breaks it: the order desk ships to every branch but has
no business reading a branch's HR records. The two meanings split into two
capabilities, `branch:allAccess` and `staff:viewAllBranches`, and `WAREHOUSE` gets only
the first.

---

## 3. The requirements

### R1 — Counter billing with tokens

> Manager will enter the items. They should see how many items there are. As orders
> come in they add them and issue a token, and the money keeps counting. Once an order
> is taken they can also edit it.

**Confirmed:** this is **not** a purchase flow like R5. There is no cart, no payment
step and no fulfilment — it counts items, issues a token and shows a total price. A
**cashier** does this, as well as a manager.

| | |
| --- | --- |
| **Who** | `CASHIER`, `MANAGER`, `ADMIN`, `OWNER` (`counterOrder:create`) |
| **Entities** | `CounterOrder`, `CounterOrderItem`, `BranchTokenCounter`, `DayClose` |
| **Task** | [Task 4](#task-4--counter-billing-and-tokens) |

The counter order **is** the branch's sales record. It projects into the existing
`Transaction`/`LineItem` tables rather than becoming a second source of sales, so
everything that already reads sales — the Home stat tiles, `getSalesSummary`, and every
future metric — keeps working unchanged. That also makes "editable after placing" free:
editing re-runs the projection.

**Acceptance criteria**

- A cashier opens an order, adds items, and sees the total change as they go.
- Closing the order issues a token number that is unique **per branch per day**, in the
  branch's own timezone — not UTC, or numbering restarts at 05:30 IST mid-breakfast.
- Reopening a closed order and changing it updates the day's sales total by exactly the
  difference.
- Voiding an order removes it from the day's sales.
- Once a day has been closed (see R17), editing an order from that day is refused with
  a clear message rather than silently restating a number someone has already been
  shown.

### R2 — Tell the worker they were marked present or absent

> Send text from mobile number to worker for present and absent.

**Confirmed: Firebase push notification, not SMS.** No SMS provider is used anywhere in
this project. "Send them a text" here means "notify them".

| | |
| --- | --- |
| **Who** | `CASHIER` marks; the worker is notified |
| **Entities** | `Notification`, `DeviceToken` |
| **Task** | [Task 7](#task-7--firebase-notifications) |

**Acceptance criteria**

- A worker whose attendance is marked receives a push on their device.
- The push is in the language **that device** is set to, not the account's stored
  preference — a shared or re-set device must not show the wrong language.
- Opening it lands on their own attendance screen.
- A worker with no app account and no device is simply not notified; marking still
  succeeds.

### R3 — One desk sees every branch's orders

> There is one person who takes the orders of all branches. When a cashier places an
> order, it shows up in that person's login.

| | |
| --- | --- |
| **Who** | `WAREHOUSE` (`supplyOrder:fulfil`) |
| **Entities** | `SupplyOrder` |
| **Task** | [Task 5](#task-5--supply-orders-end-to-end) |

**Acceptance criteria**

- A warehouse user sees orders from every branch of the business in one queue, newest
  first, without being granted branch access row by row.
- Each row shows the branch, the items, the amount and the payment status (R9).
- A warehouse user cannot read any branch's staff records or attendance.

### R4 — Products on the home page, and per-branch products

> After login, show the products on the home page by default. And every branch can add
> their own separate products too.

| | |
| --- | --- |
| **Who** | Everyone sees the catalog; `CASHIER`/`MANAGER`/`ADMIN` edit it |
| **Entities** | `Product` (gains `branchId`, `isActive`), `ProductBranchDetail` |
| **Task** | [Task 3](#task-3--product-catalog-new-home-hide-ai) |

A product with no `branchId` belongs to the whole business; one with a `branchId`
exists only at that branch. Price and availability per branch already have a home in
`ProductBranchDetail`, which has been in the schema since Phase 1 with no API on it.

**Acceptance criteria**

- The first thing visible after login is that branch's product list.
- A branch can add a product that no other branch sees.
- A business-wide product can be deactivated or priced differently at one branch
  without affecting the others.

### R5 — Supply orders: cart, payment mode, place

> When the cashier orders, they have to pay (Online or COD), then the order is placed.
> There should be add-to-cart so they can order everything together. This is raw
> material.

**Confirmed: record-only payment, no gateway.** `ONLINE` stores a mode and a reference
string (UPI/bank) that the warehouse verifies. No Razorpay, no KYC, no money moves
through the app.

| | |
| --- | --- |
| **Who** | `CASHIER` (`supplyOrder:create`) |
| **Entities** | `SupplyOrder`, `SupplyOrderItem`, `InventoryItem` |
| **Task** | [Task 5](#task-5--supply-orders-end-to-end) |

The cart is a `SupplyOrder` in `DRAFT` — server-side, so it survives closing the app
and follows the cashier to another device. The raw-material catalog reuses
`InventoryItem`, modelled since Phase 1 and never given an API.

**Acceptance criteria**

- A cashier adds several raw materials to one cart and places them as one order.
- Placing requires choosing `ONLINE` or `COD`; `ONLINE` requires a reference string.
- A placed order can no longer be edited by the cashier.
- The warehouse sees it immediately (R3).

### R5.1 — Material tracking, order tracking, dispatch, payment mode

> After the order: material tracking, order tracking, dispatch and payment mode.

*(This is the unnumbered line following R5 in the original list — see the note at the
top of this document.)*

All four are views over one append-only table, `SupplyOrderEvent`, which records every
status change, delay and payment event with who did it and when. One table gives order
tracking, material tracking, the dispatch record and the audit trail, rather than four
half-overlapping ones.

**Status machine:** `DRAFT → PLACED → ACCEPTED → PACKED → DISPATCHED → DELIVERED`, with
`CANCELLED` reachable before dispatch. Illegal transitions are refused.

### R7 — Hide the AI chat board

> For now don't implement the AI chat board — hide it from the current UI. We'll enable
> it in the future.

| | |
| --- | --- |
| **Who** | Everyone |
| **Task** | [Task 3](#task-3--product-catalog-new-home-hide-ai) |

There is no AI chat to remove — what exists is three pieces of static teaser UI: a
decorative "ask bar" on Home that is not even tappable, a "Next up" notice, and the
chat-bubble Home tab icon. All go behind a single `AI_CHAT_ENABLED` flag.

**Nothing is deleted.** The code and all `home.query*` / `alerts.*` translations stay on
disk, exactly as `AlertsScreen` is already kept for Phase 5. Turning the flag back on
restores the surface rather than requiring it to be rewritten.

**Acceptance criteria**

- No part of the app suggests an AI feature that does not work.
- Flipping one constant brings the surface back.

### R8 — Notification management for all users

> Notification management for all users — we can do that with Firebase.

| | |
| --- | --- |
| **Who** | Everyone |
| **Entities** | `DeviceToken`, `Notification` |
| **Task** | [Task 7](#task-7--firebase-notifications) |

**Acceptance criteria**

- Every role can receive pushes relevant to them and nothing that is not.
- An in-app notification centre lists past notifications with an unread badge.
- Tapping one opens the right screen — and if the notification belongs to a different
  business than the one currently active, the app switches business first, or every
  request behind it is refused.
- Tapping one for a screen the person is no longer allowed to open lands on Home rather
  than doing nothing.
- A user can turn categories off.

**Design constraint worth knowing.** `CLAUDE.md` forbids the backend from writing
user-facing prose, because it cannot know the reader's language. Push breaks that
premise: Android renders the notification text before app code runs. The resolution is
that a device **reports its own language when it registers its push token**, so the
backend renders from that rather than guessing — and also ships `{code, params}` in the
data payload so the in-app copy re-renders in whatever language is selected right now.
The prose lives in one dictionary file with a parity gate, not at the point it is sent.

### R9 — Payment status, and "this will take another 30 minutes"

> The person sitting there should see whether the cashier has paid or it's still
> pending. If it's paid and the material isn't in the warehouse, they ask the cashier
> for extra time — when they update the time, the cashier sees "30 min more". The
> delivery boy can update the same way, with a reason (traffic and so on).

| | |
| --- | --- |
| **Who** | `WAREHOUSE` and `DELIVERY_AGENT` post; `CASHIER` sees |
| **Entities** | `SupplyOrderEvent` (`type: DELAY`), `SupplyOrder.promisedAt` |
| **Task** | [Task 5](#task-5--supply-orders-end-to-end) + [Task 7](#task-7--firebase-notifications) |

**Acceptance criteria**

- Every order in the warehouse queue shows `PENDING` / `PAID` / `VERIFIED`.
- Either party can post a delay as a number of minutes plus a reason.
- The cashier sees the revised time and the reason, and gets a push.
- Delays accumulate honestly — two 30-minute delays read as an hour, and both are
  visible with who posted them.

### R10 — Branch expenses, daily and monthly

> Branch cashier can log the month's total amounts — gas bill, electricity bill, petty
> expenses and everything else. Also daily cost: how much did I spend today? And how
> much did I sell today? Category-wise too, e.g. today I took ₹2,000 of milk.
> The person at the back office will call the branches that haven't logged their daily
> expenses.

| | |
| --- | --- |
| **Who** | `CASHIER` logs (`expense:log`); `WAREHOUSE`/`ADMIN` see the gaps (`expense:viewAllBranches`) |
| **Entities** | `Expense`, `ExpenseCategory` |
| **Task** | [Task 6](#task-6--expenses-and-the-daily-log) |

**Acceptance criteria**

- An expense is logged with a category, an amount, a date and an optional note.
- The branch sees today's spend, today's sales, and the difference.
- Monthly totals and a category breakdown are available for any month.
- A back-office user sees which active branches have logged nothing for today, in each
  branch's own local date.

**Deliberately not a scheduled job.** "Who hasn't logged today" is computed when someone
opens the screen, so it is exact — a job that snapshots at 20:00 is wrong by 20:05. And
the requirement itself says a person makes the call; the system's job is to tell them
who to call, at the moment they ask.

### R11 — The cashier sees delivery status

> When the cashier orders, they should see the delivery status.

Covered by R5.1's event timeline. **Acceptance:** the cashier's order screen shows the
current status, the full history with timestamps, the payment state, any delays with
reasons, and the expected arrival time.

### R12 — The delivery agent marks the order done

> The delivery boy will mark that the order is done, so the cashier sees the updated
> status.

| | |
| --- | --- |
| **Who** | `DELIVERY_AGENT` (`supplyOrder:deliver`) |
| **Task** | [Task 5](#task-5--supply-orders-end-to-end) |

**Re-scoped:** the agent is **not tied to a branch**. They carry raw material to
every branch, so the role is business-wide (`branch:allAccess`) rather than
scoped by `BranchAccess` rows.

**Acceptance criteria**

- A delivery agent sees the orders assigned to them, **plus every branch's
  dispatched orders that nobody was named on** — a run to a branch they were
  never "granted" still reaches them, because there is no such grant any more.
- Marking delivered updates the cashier's view and sends them a push.
- A delivery agent cannot accept, pack or dispatch — only deliver and post delays.
- All-branch scope is **data only**. They hold none of the `staff:*`
  capabilities, exactly like the warehouse desk: an outside worker carrying
  every branch's HR records is the failure that split exists to prevent.

### R13 — Admin sees every branch, and net profit

> For admin login, he can see all branch data — amount only, like standard values — and
> show the final net profit too.

| | |
| --- | --- |
| **Who** | `ADMIN`, `OWNER`, `MANAGER` (`analytics:viewBusiness`) |
| **Task** | [Task 8](#task-8--analytics-and-net-profit) |

**Proposed formula — see [Open decisions](#5-open-decisions) before building:**

```
netProfit = counter sales (COMPLETED)
          − branch expenses
          − supply-order spend
          − payroll (net pay)
```

**Acceptance criteria**

- One screen lists every branch with its sales, costs and net profit for a period.
- Net profit is reproducible by hand from the rows behind it — this is a number someone
  will make decisions on, so it must be traceable, not just displayed.

### R14 — Cashier sets salary; admin issues the manager's account

> The cashier will decide their staff's salary.
> The manager (all branches) will have all the access the admin has — but only once the
> admin issues the manager's account. The admin has to create the manager's account and
> hand it over, and can give it for one particular business if they want.

| | |
| --- | --- |
| **Who** | `CASHIER` (`staff:setPay`, own branches); `ADMIN` invites `MANAGER` |
| **Task** | [Task 1](#task-1--roles-and-the-permission-matrix) |

Both halves are capability changes, not new features. `staff:setPay` moves from
"OWNER/ADMIN only" to a capability a cashier also holds, scoped to their own branches.
Manager-equals-admin is the matrix deriving `MANAGER` from `ADMIN` minus a short,
explicit exclusion list — so a capability added to admin reaches manager automatically
and the two cannot silently drift.

The existing invite flow already does "admin creates the account and hands it over,
scoped to one business": an invite carries a role and a business, and is claimed when
that email signs up. Nothing new is needed there beyond allowing the new roles to be
invited.

**Acceptance criteria**

- A cashier sets base salary for staff at their own branch, and is refused for another
  branch.
- A manager can do everything an admin can, in the businesses they were invited to and
  no others.
- The new roles appear in the invite screen's role picker.

**This one changes existing behaviour.** A manager is branch-scoped today, and two
committed tests plus the Phase 0 exit criterion in `PROJECT_FLOW.md` exist to assert
that. Widening the role invalidates them on purpose; they change in the same commit,
with the reason written into the migration.

### R15 — See where the effort is needed

> Manager and admin should see all of this so that they know by looking where more
> effort is needed — like all months' data, branch-wise.

| | |
| --- | --- |
| **Who** | `MANAGER`, `ADMIN`, `OWNER` |
| **Task** | [Task 8](#task-8--analytics-and-net-profit) |

**Acceptance criteria**

- A branch × month grid of sales, costs and net profit.
- Branches that are declining are visible without reading every number — this is the
  point of the requirement, so ranking or trend indication is part of it, not polish.
- The Reports tab stops being a placeholder.

### R16 — One admin account holding many businesses

> One more thing that needs fixing: the admin's account will be just one, and he can
> add multiple businesses inside it, rather than making a separate account for each
> business.

| | |
| --- | --- |
| **Who** | `OWNER` (`business:create`) — see the narrowing below |
| **Task** | [Task 2](#task-2--one-account-many-businesses) |

Most of this already exists and is unreachable: a user can hold memberships in many
businesses, and Settings already has a working switcher. What is missing is the one
endpoint to create a **second** business — today a business is only ever created by
signing up, so a second business means a second account.

**Narrowed after review:** only an **owner** is offered this. Starting a business is the
owner's act, not a delegated one — an admin runs the business they were given, and a
cashier or a warehouse desk has no use for the entry at all. It is the capability
`business:create`, excluded from `ADMIN` and therefore from `MANAGER` too, so nothing
anywhere checks a role name.

That gate is about **what Settings offers, not a permission boundary**, and the two are
deliberately different here. `POST /businesses` stays ungated: it runs before the
business exists, so there is no tenant to check a capability against, and answering
"which business's role?" would stop an invited cashier from ever starting one of their
own. The entry stays visible for someone whose every membership was revoked, since there
is no role left to hold a capability and hiding it would leave an account that can do
nothing.

**Acceptance criteria**

- An owner creates another business from Settings and becomes its owner.
- An admin, manager, cashier, warehouse or delivery agent does not see the entry.
- Someone who owns one business and cashiers in another sees it while switched to their
  own, and not while switched to the other — Settings means "this business".
- The switcher lists all of them and switching changes what every screen shows.
- A person who is admin in one business and cashier in another gets the right
  permissions and the right tabs in each, and the app updates cleanly on switch.

### R17 — Billing online, and day/month export

> Billing should be online, which we already made, but see if we can optimise.
> Whatever entries were made across the whole day, they should be able to export it in
> the evening — and for the whole month too.

**Confirmed:** "billing" is R1's counter, working against the live server. The new work
is the export.

| | |
| --- | --- |
| **Who** | `CASHIER` exports their branch; `ADMIN`/`MANAGER` export any (`export:dayEnd`, `export:monthEnd`) |
| **Task** | [Task 9](#task-9--day-end-and-month-end-export) |

**Acceptance criteria**

- One action exports everything entered for a date: counter orders, supply orders,
  expenses and attendance.
- The same for a whole month.
- Exports work for any past date, so losing the file is recoverable.
- The file opens in Excel, and a printable summary can be shared from the phone.

### R18 — One cashier per branch

> Admin should assign only one branch to one cashier. Two cashiers in one branch is not
> possible. Yes, admin can switch to another cashier for that branch.

A **1:1 rule**: a cashier holds exactly one branch, and a branch has at most one cashier.

**Confirmed:** assigning a branch that already has a cashier **replaces** the holder
after the admin confirms, naming who is being displaced. The rule applies to `CASHIER`
**only** — a delivery agent covering three branches stays possible, and managers and
staff are unchanged.

| | |
| --- | --- |
| **Who** | `ADMIN`, `OWNER`, `MANAGER` assign (`team:manageBranchAccess`); `CASHIER` is the constrained role |
| **Task** | [Task 10](#task-10--restrictions-that-explain-themselves) |

**Acceptance criteria**

- Inviting a cashier with no branch, or with two, is refused before the invite is sent.
- A branch never has two active cashiers at once.
- Giving a branch to a second cashier is refused with a message naming the one who holds
  it, and offers to swap. Confirming moves the branch in one step.
- The displaced cashier keeps their account and loses only the branch. They can be given
  another branch or removed, and until then the app tells them they have no branch rather
  than showing empty screens.
- Memberships that already break the rule (created before it existed) are **reported, not
  silently rewritten** — an admin decides who keeps which branch.

### R19 — Every restriction says what it is

> Role-wise functionality hide and show, and when the user uses it, show the message to
> the user: what is the restriction.

Hiding what a role cannot use is already how the app works — the capability matrix drives
the tabs, the routes and the buttons. What is missing is the other half: when something
*is* refused, the app says "Insufficient permissions", which tells nobody anything.

| | |
| --- | --- |
| **Who** | Everyone. The refusals differ by role; the explaining does not |
| **Task** | [Task 10](#task-10--restrictions-that-explain-themselves) |

**Acceptance criteria**

- A refusal says **what the rule is**, not that a rule exists: "only the warehouse desk
  accepts orders", not "insufficient permissions".
- Where it helps and leaks nothing, the refusal names the blocker — "Branch 1 already has
  a cashier: Hari" — because the admin's next action depends on knowing who.
- It says **who can lift it** where that is knowable, so the reader knows whom to ask.
- Restrictions that are not about permissions get the same treatment: a closed day, an
  order too far along to cancel, an item with no price.
- Every message is a code translated on the device, like all the others. The server still
  does not write prose.
- A role whose screens are not built still says so rather than showing a blank page.

### R20 — Punch in from anywhere, with the place on the record

> The delivery agent will not work for any particular branch — he will deliver the raw
> material to every branch. And he will do the punch-in and punch-out from everywhere,
> but at that time it needs to store the current location and current time, so admin and
> manager can see that.

A geofence assumes a fixed place of work. A delivery agent has none, so the radius
cannot apply to them — but the exemption is only safe if it is a **trade**: the
coordinates stop being optional and become the record of where the punch happened.

| | |
| --- | --- |
| **Who** | `DELIVERY_AGENT` punches (`attendance:punchAnywhere`); `ADMIN`, `OWNER`, `MANAGER` read it |
| **Task** | Built with [Task 5](#task-5--supply-orders-end-to-end)'s follow-up |

**Acceptance criteria**

- A delivery agent punches in and out from any distance, and the branch geofence is not
  applied to them.
- A punch with no coordinates is **refused**, with its own message: giving away the
  geofence and recording nothing in its place is the worst of both.
- Both punches store latitude, longitude and the time.
- An admin or manager sees when and where, on the person's attendance history, and can
  open the spot in a map.
- The exemption is a capability held by that role alone. It is **not** conferred by
  holding everything else — an admin is excluded on purpose, because forcing a location
  before every punch is a cost that only pays for a job with no fixed address.

### R21 — The desk gives the run to an agent who is free, and tells them where to go

> The warehouse user assigns the order to a delivery agent who is available. And show the
> full address to the delivery agent with the order, which he can see on the order detail
> page.

Two halves of one job: somebody has to be named, and the person named has to be able to
find the place.

| | |
| --- | --- |
| **Who** | `WAREHOUSE` assigns (`supplyOrder:fulfil`); `DELIVERY_AGENT` reads the address |
| **Task** | [Task 5](#task-5--supply-orders-end-to-end) |

**Acceptance criteria**

- Dispatching asks who is taking it, and the list is ordered by who is free: on duty
  first, then whoever is carrying least.
- Availability comes from **attendance** — a punch-in with no punch-out — and not from a
  second idea of "free" invented for this screen. An agent with no employment record, or
  a business that does not punch in at all, reports `UNKNOWN`, which sorts above off duty.
- Availability is **shown, never enforced.** Every agent stays selectable: the person at
  the desk knows things the app does not, and a business that does not use punch-in must
  not find every agent unavailable.
- The picker is **not the team list.** The warehouse desk holds no `team:view` and must
  not need it to do its own job, so the endpoint returns a name, a duty state and a
  count — no email, no branches, no employment record.
- Only people whose **job** is carrying appear. An admin holds every capability, so the
  list is `supplyOrder:deliver` **and not** `supplyOrder:fulfil`, read off the matrix —
  never a role name.
- "Nobody yet" stays available on dispatch. A business with no agent yet still has to
  ship, and an unnamed run reaches every agent covering that branch.
- A run can be **moved to a different agent** while it is accepted, packed or dispatched
  — the named agent goes home and it has to go to somebody else — and not after it is
  delivered, which would rewrite who delivered it.
- Every assignment is a row in the order's timeline, with the agent's name snapshotted.
  Assigning the same person twice writes nothing.
- A branch carries a **delivery address** — a free-text, multi-line street line plus a
  PIN code — set when it is created and editable in Branch settings.
- The address travels **on the order**, so the agent's order screen shows it without a
  request they hold no capability to make, with a chip that opens the spot in a map:
  coordinates when the branch has them, the written address otherwise.
- A branch with no address shows "No address saved for this branch" rather than a blank,
  and nothing fails.

### R22 — Cash on delivery is confirmed by the person who took it

> When the delivery agent receives money which is COD (given by the cashier), the
> delivery agent should confirm the money was received. Put a question there for the
> delivery agent — like, have you received money from that branch's cashier? If yes, then
> the delivery agent is able to mark as delivered.

The goods arriving and the money arriving are **two events**, and only the person
standing at the counter knows whether the second one happened. Delivering used to stamp
a COD order PAID as a side effect of arriving, which recorded the branch's cash as having
reached the warehouse on the strength of the goods reaching the branch.

| | |
| --- | --- |
| **Who** | Whoever closes the run — `DELIVERY_AGENT` (`supplyOrder:deliver`), or the desk |
| **Task** | [Task 5](#task-5--supply-orders-end-to-end) |

**Acceptance criteria**

- Marking a **cash on delivery** order delivered asks first, naming the amount and the
  branch whose cashier owes it: *"Have you taken ₹2,400 from the Ring Road cashier?"*
- **Yes** delivers it and records the money as collected. **Not yet** does nothing — the
  order stays on the road, unpaid, where it can still be chased.
- The server refuses a COD delivery that does not carry the confirmation, so the rule is
  not only in the buttons. The flag must be a real boolean: a truthy string is not an
  answer.
- Collecting the cash is **its own row** on the order's history, with who took it and
  when, beside the delivery rather than inside it.
- An order with nothing outstanding — paid online, or already settled — is delivered with
  no question asked. A question whose answer cannot matter teaches people to tap through
  it.

### R23 — A warehouse is a location, and a staff member's base follows their role

> As an owner I need to add a staff (warehouse), so the owner should not have to choose
> any specific branch. Can we check the role based on the email address when adding
> staff? We need to add a warehouse location, then the punch-in and punch-out works for
> that person.

Adding a staff member asked "which branch do they work at?" and would not go on until
somebody answered. For a warehouse employee there was no true answer: the only locations
a business had were the places it sells from.

**A warehouse is a `Branch` with `kind: WAREHOUSE`, not a new table.** Attendance,
geofencing, payroll, rosters and staff records are every one of them already keyed on
`branchId`. As a branch, a warehouse gets all five on the day it is created — which is
exactly what "then the punch-in and punch-out works for that person" asks for. A separate
table would mean teaching all five about a second kind of place first.

| | |
| --- | --- |
| **Who** | `OWNER`/`ADMIN` create locations and add staff |
| **Entities** | `Branch.kind`, `BranchKind` |
| **Task** | [Task 5](#task-5--supply-orders-end-to-end) |

**Acceptance criteria**

- Adding a location asks what it is: a **branch** (sells and orders) or a **warehouse**
  (supplies the branches). Anything that already exists is a branch, with no backfill.
- A warehouse takes coordinates and a geofence like any other location, so its staff
  punch in there against its radius.
- A warehouse is **refused a counter order and a supply cart by the server**, not merely
  left out of the pickers: it has no till, and it does not order raw material from
  itself.
- Branch pickers split by meaning: **where goods move** shows branches only; **where
  people work** shows every location. A figure labelled "branches" counts the selling
  network.
- Adding a staff member recognises an email that already belongs to a member and says
  who they are and what role they hold.
- **The email is asked before the location**, because the answer changes what the
  location question means. Asked after it — which is how it shipped first — the form
  demands "which branch do they work at?" before it has any way of knowing the answer is
  "none of them".
- When that role reaches every branch — delivery agent, warehouse desk, admin — the
  question changes from "which branch do they work at" to "where is their base", and
  says that it only decides where attendance and payslips are filed.
- The location is chosen automatically where there is nothing to choose: the business has
  one location, or the person's work spans every branch and a warehouse exists. It is
  never guessed for a branch-scoped person, because filing someone at the wrong shop
  silently is worse than a tap.
- The job title is offered from their membership role — a delivery agent gets "Delivery
  agent" — as a suggestion that any typing replaces, and that clears if the email does.
- A **delivery agent added this way punches in and out from anywhere**, with the
  coordinates recorded (R20), and their attendance and payslip are filed against their
  base. That is the whole point of the chain: no staff record means no attendance at all.

---

## 4. Tasks

Ten tasks. **Task 1 lands first** — it is the only one that changes existing behaviour,
and every other task assumes its roles exist.

### Task 1 — Roles and the permission matrix
*Requirements: R14, and the prerequisite for everything else.*

1. **Invert the four fail-open deny-lists, before the enum grows.** Replace them with
   allow-lists off the matrix, and make the branch-containment check apply to *any*
   branch-scoped role rather than one named one.
2. Write the backend permission catalog and `requirePermission()`, keeping the old
   `requireRole` working so the routers migrate one at a time.
3. Mirror the matrix to the frontend; derive the `MembershipRole` type from it so it
   can no longer drift by hand.
4. Parity script + `npm run lint:permissions` + a CI step.
5. **Make the new roles invitable** — otherwise the whole task looks built and nothing
   can be tested.
6. Two enum migrations, in separate directories: Postgres refuses a new enum value in
   the same transaction that added it.
7. Flip the all-branch sentinel to the `branch:allAccess` capability; add the guard
   that stops a warehouse user crashing the staff-scope check.
8. Migrate the seven business routers, one commit each — leaving the two deliberately
   unguarded routes the business switcher depends on alone.
9. Tests for each new role, and update the two tests plus the `PROJECT_FLOW.md` exit
   criterion that R14 deliberately invalidates.
10. Frontend permission helpers, call sites, and the new role names in all four locale
    files.

### Task 2 — One account, many businesses
*Requirement: R16.*

1. An endpoint to create an additional business, reusing the signup transaction rather
   than a second copy of it.
2. Validation and error codes.
3. An "add another business" entry in Settings beside the existing switcher.
4. Confirm the switcher's stale-choice reconciliation still holds with more than two.

### Task 3 — Product catalog, new Home, hide AI
*Requirements: R4, R7.*

1. The `AI_CHAT_ENABLED` flag and the three surfaces it hides.
2. Product CRUD with business-wide and branch-only products, and per-branch price and
   availability.
3. Rebuild Home as fixed chrome plus a capability-filtered list of sections, so adding
   a role later adds zero screens.
4. Role-aware tabs and routes driven by the same capability strings the backend uses;
   the guards for navigating somewhere a role cannot see; refresh the session on
   foreground so a demoted user does not keep their old tabs.
5. Product screens, translations in all four languages.

### Task 4 — Counter billing and tokens
*Requirements: R1, and the "billing" half of R17.*

1. **A pure refactor first, in its own commit**, extracting the shared sales-projection
   code out of the CSV ingester with the test suite green before anything is built on
   it.
2. The counter-order tables and the transaction-source discriminator.
3. Atomic per-branch-per-day token allocation — one statement, no retry loop that
   degrades exactly when the counter is busiest.
4. Endpoints for the whole order lifecycle, each re-running the projection in one
   transaction.
5. The day-close gate, so an edit can never silently restate a number already shown.
6. The counter screen: item grid, running total, token issue, edit and void.
7. Tests: token uniqueness, edit re-projects, void excludes from sales, closed-day
   refusal, branch-local dates.

### Task 5 — Supply orders end to end
*Requirements: R3, R5, R5.1, R9, R11, R12, R21, R22, R23.*

1. Give `InventoryItem` a price, an active flag and its first API.
2. The order, item and event tables.
3. Cashier: cart, place with payment mode and reference.
4. Warehouse: the all-branch queue, accept → pack → dispatch, verify payment, post a
   delay.
5. Delivery agent: assigned queue, mark delivered, post a delay with a reason.
6. Every transition writes an event. **Notifying is Task 7** — the single
   `recordEvent` choke point is where it hooks in, and it is deliberately not
   stubbed with an empty notifier in the meantime, because a function that does
   nothing reads as a function that works.
7. The cashier's tracking view.
8. Seven screens, translations ×4.
9. Tests: illegal transitions refused, each role refused the others' actions,
   cross-branch and cross-tenant denial.

**Decided while building it.**

- **A supply order is a cost, not a sale.** Unlike a counter order it is *not*
  projected into `Transaction`/`LineItem`: doing so would inflate every sales
  figure by the value of the raw material a branch bought from its own
  warehouse. Task 8 reads it as a cost input to net profit.
- **Cancel and reject are separate verbs** for the same end state. The branch
  withdrawing its order and the warehouse refusing it are different events with
  different people to tell, so they carry different capabilities, allow
  different statuses, and only the rejection requires a reason.
- **Dispatch names a delivery agent, without the desk getting the team list**
  (R21). The first pass left dispatch unassigned, on the grounds that choosing
  someone meant listing the business's members and the warehouse holds no
  `team:view`. That was the wrong conclusion from a right premise: the fix is a
  narrower endpoint, not a missing feature. `GET /supply-delivery-agents` is
  guarded by `supplyOrder:fulfil` and returns a name, a duty state and a count —
  no email, no branches, no employment record.
- **Whose job is delivering is not who is able to deliver.** An admin holds
  every capability, so a bare `supplyOrder:deliver` filter would list the owner
  and every admin as a courier. The picker is `supplyOrder:deliver` **and not**
  `supplyOrder:fulfil` — someone who can run the desk is not who the desk is
  looking for — read off the matrix, so a role added later that carries but does
  not fulfil appears with no edit.
- **Availability is reported, never enforced.** It comes from attendance, which
  has nothing to say about an agent with no employment record or a business that
  does not punch in — so `UNKNOWN` sorts above off duty and every agent stays
  selectable. Blocking on it would leave those businesses unable to assign
  anybody.
- **"Nobody yet" stays on offer.** A business with no delivery agent still has
  to ship, and an unassigned dispatch appears in the queue of every agent
  covering that branch. Requiring an agent would refuse a dispatch the server
  has no better answer for.
- **Assigning is its own verb, not only a field on dispatch.** "Who is taking
  it" and "it has left" are different facts with different timing: the agent who
  was given it goes home an hour later, and with only the dispatch field the one
  way to correct that would be to undo a dispatch that really happened.
- **A branch's delivery address is not its city and region.** Those describe
  where a branch *is*, for reporting. `addressLine` is free text and multi-line
  because an Indian address is not a fixed set of fields, and forcing one drops
  the half that finds the place. It travels on the order itself: the agent's
  order screen is the only thing they open, and branch endpoints are not theirs
  to call.

### Task 6 — Expenses and the daily log
*Requirement: R10.*

1. Expense and category tables, with categories seeded.
2. Logging, daily and monthly totals, category breakdown.
3. Today's sales vs today's spend for a branch.
4. The on-demand "which branches haven't logged today" query, in each branch's own
   local date.
5. Expense screens and a Home section for back-office users; translations ×4.

### Task 7 — Firebase notifications
*Requirements: R2, R8, plus the pushes R9/R11/R12 depend on.*

1. Push setup, the device-token and notification tables.
2. Token registration carrying the **device's** language, alongside the existing locale
   update.
3. The notification dictionary, the parity gate covering it, and translations ×4.
4. The triggers: attendance marked, order placed, accepted, dispatched, delivered,
   delayed, payment verified.
5. The in-app notification centre, unread badge, and safe tap-through.
6. Per-user preferences in Settings.

### Task 8 — Analytics and net profit
*Requirements: R13, R15.*

1. The branch × month aggregation endpoint.
2. The net-profit formula — **confirm the double-count question in §5 first**.
3. Reports becomes the real grid.
4. The admin's cross-business view.
5. Charts and Indian-format currency, reusing what exists.

### Task 9 — Day-end and month-end export
*Requirement: R17.*

1. Day-end and month-end export endpoints covering all four record types.
2. Spreadsheet output using the library already present for import; a printable summary
   using the existing document toolkit rather than a second layout system.
3. Device-side sharing, reusing the existing print path and its hard-won warning about
   downloads that do not fail on an error status.
4. Export actions on Reports and the branch day view.

### Task 10 — Restrictions that explain themselves
*Requirements: R18, R19.*

Two halves of one idea: the app already hides what a role cannot use, and it should also
**say why** when something is refused. R18 is the first restriction that is not a
capability at all — it is an invariant about who may hold a branch — which is exactly the
kind of rule a generic "insufficient permissions" cannot explain.

1. **The invariant, in the service layer.** One cashier per branch, one branch per
   cashier, enforced where memberships and branch access are written — not in a
   controller, and never only in the app. Invite, accept-invite, and the branch-access
   edit are three doors into the same room.
2. Validation: a cashier invited with no branch, or with two, is refused before the
   invite is created. `INVITABLE_ROLES` already derives from the matrix; this is the
   branch count, which nothing checks today.
3. **The swap.** Assigning an occupied branch returns a 409 naming the current cashier.
   A confirmed retry moves the branch and leaves the previous holder with no branch, in
   one transaction, so there is never a moment with two or with none.
4. Error codes and their wording in all four locales, carrying the blocker's name as a
   `param` — never baked into the sentence.
5. **Frontend:** the invite and Team screens show which branches already have a cashier
   before the admin picks one, and the swap is a confirmation naming the person being
   displaced. A cashier with no branch gets a clear notice, not empty screens.
6. **The audit.** Every `PERMISSION_DENIED` and `BRANCH_ACCESS_DENIED` throw site gets a
   message that states the rule. This is the bulk of R19 and the least glamorous part.
7. A "why is this not here?" affordance on the surfaces where hiding is more confusing
   than explaining — chiefly Home, which already has the pattern for a role whose screens
   are not built.
8. **A pre-existing conflict to resolve first.** `supply-order.test.js` puts two cashiers
   on one branch on purpose, to prove an order is credited to whoever placed it rather
   than whoever opened the cart. Under R18 that fixture becomes illegal. The test stays —
   the second person becomes the **owner**, who also holds `supplyOrder:create` — and it
   is a better test for it, since owner-plus-cashier is the pairing that survives.
9. Tests: the invariant holds under concurrent assignment; the swap moves exactly one
   branch and leaves exactly one holder; a displaced cashier is inert but intact; every
   new refusal returns its own code rather than the generic one.

**One design note that survives R18.** The supply cart is per *branch*, not per cashier.
That was argued from "two people on a shift", which R18 makes rare — but it still holds,
because an owner or manager also holds `supplyOrder:create` and can order for any branch.
The cart being the branch's means their additions and the cashier's are one list.

### Task 11 — Documents

Written **with** each task, not after: this file, `PROJECT_FLOW.md`,
`database-table.md`, `TESTING_GUIDE.md`, and the `CLAUDE.md` additions for the push
exception and the new lint scripts.

---

## 5. Open decisions

**Does supply-order spend double-count against expenses?** (R13, Task 8.) If a cashier
pays for a supply order *and* logs it as an expense, the net-profit formula subtracts it
twice. Proposed answer: supply orders are excluded from the manual expense categories,
and the export flags any overlap it finds. **Confirm before Task 8 ships**, because it
changes a number people make decisions on.

**Does a counter order record how it was paid?** R1 says no payment step, so the default
is "unspecified". But cash-vs-digital mix is a named Phase 5 metric, and it costs one
optional tap to capture. Current plan: optional, defaults to unspecified. Worth
revisiting once a real counter is in use.

---

## 6. Not in scope

Deliberate exclusions, recorded so they are not mistaken for oversights:

- **Real payment collection.** Record-only by decision (R5).
- **SMS, of any kind.** Firebase push instead (R2).
- **Scheduled jobs.** Nothing in these requirements needs a clock; see R10.
- **The AI query engine.** Hidden, not built (R7). `PROJECT_FLOW.md` Phase 2 stands.
- **Offline billing.** Billing requires the server (R17).
