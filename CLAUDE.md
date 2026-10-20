# CLAUDE.md

---

## What this project is

**KitnaPay** is a multi-tenant AI business intelligence platform for restaurant,
retail and franchise owners. The core loop: an owner asks a question in plain
language ("What were October sales versus last year?") and receives an answer
computed from their own sales data, with the underlying numbers traceable.

### Project documents

Every project document lives in `Docs/`. They carry context the code alone
does not — read them before planning feature work rather than inferring scope
from code.

| Path | Contents |
| --- | --- |
| `Docs/REQUIREMENTS.md` | What the Branch Operations track is building and why — the numbered requirements, their acceptance criteria, and the task breakdown |
| `Docs/PROJECT_FLOW.md` | The phased delivery plan and the current status of each phase |
| `Docs/database-table.md` | Data model notes |
| `Docs/TESTING_GUIDE.md` | Click-by-click manual walkthrough of every user-facing flow that is built, in the order they have to be followed |
| `Docs/FIREBASE_SETUP.md` | Creating the Firebase project and the two credential files push notifications need. Neither file is in git |
| `Docs/DEPLOYMENT.md` | Running `backend/` somewhere other than a laptop: the production environment, the two shapes migrations can take, the image, health and the JSON logs — and what is still unbuilt before it can be called live. Also the web app as a static site (`render.yaml`) |
| `Docs/TEST_DATA_SEED.md` | `backend/scripts/seed-test-data.sql`: seven months of test data for the owner's two businesses, landing each month on a fixed net profit, and how to re-run or remove it |
| `Docs/PLAY_STORE_RELEASE.md` | Getting the app onto Google Play: what blocks an upload today, the code work that clears it and its status, and the owner's own steps — paperwork, hosting, signing key, Play Console forms and the Data safety answers |

A new document of this kind belongs in `Docs/` too. Only `CLAUDE.md` and
`README.md` stay at the repository root, because Claude Code loads the rule book
from the root and GitHub renders the root README as the repository's front page.

**Keep all three current as functionality is added.** A feature is not finished
until the documents describing it match the code:

- a new or re-scoped requirement, or a decision about one →
  `Docs/REQUIREMENTS.md`
- a new or re-scoped phase or task, or one whose status changes →
  `Docs/PROJECT_FLOW.md`
- a new table, column, relation or enum → `Docs/database-table.md`
- a new user-facing flow, or a change to the steps, the expected result, or the
  setup an existing flow assumes → `Docs/TESTING_GUIDE.md`. Its "Known limitations"
  list is part of this: move an item out of it when the thing gets built, and
  add one when something ships deliberately incomplete.

Update them in the same change as the code, not as a follow-up.

### Naming

The product is **KitnaPay** — one word, capital K and P. It has been renamed
three times, "BuisnessOps" then "BizIQ" then "HisabKitab" then KitnaPay
(2026-10-20), so the rule is about where a name may live, not just what it is:

- **What a person reads changes; what a machine keys on stays.** These keep an
  old name on purpose and are not typos to fix:
  - the Postgres databases `buisnessops`, `buisnessops_test` and `buisnessops_ci`
    — `jest.setup.js` and `scripts/dev-plan.sql` match on those names as a guard
    before anything destructive, so renaming the database disarms the rail that
    stops a test run wiping development data.
  - the web's IndexedDB database `hisabkitab` (`counterPersistence.ts`) — it holds
    unsent counter sales, and a migration that half-fails loses a shop's bills.
    The store, the channel and the locks inside it were renamed; the database was
    not, and the file says why.
  - the `// BizIQ:` comments inside `frontend/patches/` — editing a patch file
    changes its hash and `patch-package --error-on-fail` then breaks every install.
  - the test fixture addresses `@test.buisnessops.dev` (82 of them) — nothing
    resolves them, and churning 21 test files would bury a real diff.
  - the repository folder, the hosted `buisnessops.onrender.com`, the upload
    keystore `biziq-upload-keystore.jks` (changing the *key* makes Play refuse the
    upload; only its filename is cosmetic), and git history.
- **What was renamed, and what had to be carried over.** The storage keys could
  not simply change: they hold the session, the chosen business and the language.
  `LEGACY_KEYS` in `frontend/src/utils/secureStorage.ts` and `carryLegacyKeys()`
  in `web/src/utils/storage.ts` move each one on first read; `textStore.ts` **moves
  the whole `hisabkitab/` folder** to `kitnapay/`, because it holds unsent bills and
  pointing a constant at a new path would strand money that was taken but never
  recorded. All three are deletable once no pre-rename install is left in the field.
- **In the app the name has one source: `frontend/src/constants/brand.ts`**, and
  it is deliberately **two values**. `APP_NAME_PARTS` (`['Kitna', 'pay']`) is what
  the mark draws — the logo's lowercase p — and `APP_NAME` (`'KitnaPay'`) is what
  sentences say. Deriving one from the other would force a choice between artwork
  that does not match the logo and prose that does not match the brand.
  `Wordmark` renders the parts the way the logo sets them — "Kitna" in navy,
  "pay" in coral — and translations write `{{appName}}`, which i18next fills from
  `interpolation.defaultVariables`, so no caller passes it and no locale file
  spells it. A brand name reads the same in every language, so it is not a
  translation key; never type it into a component or a locale file.
  `lint:errors` knows the app supplies `{{appName}}`, as it knows about `{{field}}`.
- **A header too narrow for the name stacks it, never cuts it.** `Wordmark`'s two
  words are separate `Text` nodes in a wrapping row, so on a 320dp phone Home and
  the sign-up header show "Kitna" over "pay" — a stacked lockup — rather than
  clipping, shrinking or breaking mid-word. The parent only has to let it shrink.
- **Five places cannot import it** and repeat the name: `app.json`'s `name` (the
  launcher label) and its iOS location-permission sentence, `web/index.html`'s
  `<title>` and `theme-color` (both render before any script does), and the
  backend's `mail/reset.labels.js`, which does not reach into `frontend/src`. The
  first two are compiled in, so they change only after `npx expo prebuild -p android`
  and a rebuild — an APK from before then still shows the old name and icon.
- **Where a sentence puts the name matters.** The Login heading is one string
  with the name tagged inside it (`<brand>{{appName}}</brand>`, rendered with
  `Trans`), not a prefix plus the name, because Hindi, Gujarati and Marathi put
  the name first.

## Layout

| Path | Contents |
| --- | --- |
| `backend/` | Express API in **JavaScript** (not TypeScript), Prisma + PostgreSQL |
| `frontend/` | Expo / React Native app in TypeScript |
| `web/` | React + Vite web app in TypeScript, being brought to parity with `frontend/` — see *Web app* |
| `Docs/` | Project documents — see *Project documents* above |
| `postman/` | API collection covering auth and data ingestion |
| `.github/workflows/ci.yml` | Backend tests, migration check, frontend type-check, web type-check and build |

## Commands

Backend (from `backend/`, serves on port 4000):

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the API with nodemon |
| `npm test` | Jest test suite |
| `npm run prisma:migrate` | Create/apply a dev migration |
| `npm run prisma:studio` | Browse the database |
| `npm run migrate:deploy` | Apply committed migrations — the **production** one. Never generates or resets |
| `npm run start:prod` | `migrate:deploy` then serve. The container's `CMD`; see *Deploying* |

Frontend (from `frontend/`):

| Command | Purpose |
| --- | --- |
| `npm run lint` | Type-check (`tsc --noEmit`) — the type gate, despite the name |
| `npm start` | Metro for an existing dev build |
| `npm run android` | Build the native app and install it on a connected device |
| `npm run web` | The **mobile app** in a browser, through Expo — not the web app in `web/` |
| `npm run build:play -- --api-url https://…/api` | The `.aab` Google Play takes. Refuses a non-https or local API address, a missing signing key, a Firebase file for another package; then checks the bundle. See `Docs/PLAY_STORE_RELEASE.md` |

Web (from `web/`, serves on port 5173):

| Command | Purpose |
| --- | --- |
| `npm run dev` | The web app with hot reload |
| `npm run lint` | Type-check (`tsc -b`), which also compiles the files it shares with `frontend/` |
| `npm run lint:i18n` | The web's own strings in all four languages, and no `<Trans>` tag named after a void HTML element in any translation it reads |
| `npm run lint:shared` | Every file the web reaches in `frontend/src` imports only what the web can resolve — see *Web app* |
| `npm test` | Vitest: route gates against the app's route table, refusal sentences, store rules, `confirm()` |
| `npm run shots [-- <filter>]` | Build, then screenshot every scenario at 320/390/820/1440 in English and Gujarati against a pretend API, into `web/shots/`. Drives the installed Chrome; never a dev server |
| `npm run build` | Type-check, then the production bundle in `dist/` |

## Running the app

Vatsal runs the dev servers himself, in his own terminal — backend's `npm run
dev`, frontend's `npm run android` / Metro, and `web/`'s `npm run dev`. **Never
start or restart any of them.** If a task mechanically requires a currently-running one to stop first
(e.g. releasing the Windows file lock on the Prisma query engine DLL so
`prisma generate` can complete), stop it, say so plainly, and leave it
stopped for him to restart — don't start it back up yourself.

## Backend conventions

Requests flow `routes/` → `controllers/` → `services/` → Prisma, with
`validations/` and `middleware/` handling input shape and auth. Keep that
layering; do not query Prisma directly from a controller.

Every table holding business data carries a `businessId`. Resolve the tenant
from the authenticated session, never from client-supplied input, so cross-tenant
access is impossible by construction rather than by convention.

**Two things are checked on every request, and both have to be**: `requireAuth`
reads `User.status` and refuses a `DISABLED` account, and `resolveTenant` reads
the membership and refuses one that is not `ACTIVE`. Neither can be moved to
login instead — a token lasts seven days and carries nothing but `sub`, so
somebody disabled on Monday would still be working on Sunday. The cost is one
primary-key lookup per request, and it is worth it; `User.status` sat in the
schema enforced *nowhere* for several phases, which meant disabling an account
did nothing whatsoever.

**A list that can only grow needs a ceiling.** `MAX_ORDERS` in
`supplyOrder.service.js` and the `limit` on `listTransactions` are the pattern:
supply orders and transactions are never deleted, so "the desk's queue" quietly
meant *every order ever placed*, each with its items and its whole event
timeline, refetched on every screen focus. Where the screen reads oldest-first,
take the newest N and reverse — truncating an ascending sort keeps the oldest
rows and hides everything recent, which is the opposite of what anyone wants.

**Rate limiting stops at the auth routes** (`middleware/rateLimit.js`), and
widening it needs care rather than enthusiasm: every screen refetches on focus
and a whole branch shares one shop's IP, so a limit that is wrong locks a shop
out of its own till mid-service. `app.set('trust proxy', 1)` is what makes the
limiter count clients rather than the host's proxy — without it everyone shares
one bucket, and with `true` a client can spoof `X-Forwarded-For` and pick its own.

## Roles and permissions

There are eight roles — `OWNER`, `ADMIN`, `MANAGER`, `STAFF`, `WAREHOUSE`,
`CASHIER`, `DELIVERY_AGENT`, `ACCOUNTANT` — but **never check a role name.** Ask
for a capability:

```js
scoped.post('/staff', requirePermission('staff:create'), staffController.createStaffMember);
```

- The matrix is `backend/src/permissions/catalog.js` — **pure data, requiring
  nothing.** `frontend/scripts/check-permission-parity.js` loads it from the
  frontend's node process, so a single `require` added there breaks CI with an
  error that looks nothing like its cause.
- `frontend/src/permissions/matrix.json` is a generated mirror. Change the
  backend catalog, then regenerate it; `npm run lint:permissions` (in CI) fails
  if the two drift. `tsc` cannot catch this — it checks the mirror against
  itself, and a wrong mirror is internally consistent.
- The frontend uses the **same capability strings** the backend guards the
  matching endpoint with, so a control that renders is a control whose request
  will succeed. `MembershipRole` and the invitable-role list are both *derived*
  from the matrix rather than written out.
- **Never write a deny-list** (`if (role === 'STAFF') return false`). It fails
  *open* for every role added later, which is how a delivery agent would end up
  reading colleagues' HR records. Allow-lists off the matrix only.
- **`SINGLE_BRANCH_ROLE` is the one place that acts on a role name, and it is
  data, not a check.** Requirement 18 ties a cashier to exactly one branch, and
  no capability can express that — it is a fact about the shape of the business
  (a till belongs to a shop; a shop has one till), not about what a role may do.
  So it lives in `permissions/catalog.js` beside the matrix, is mirrored into
  `matrix.json`, and `lint:permissions` compares the two. It is not the
  anti-pattern above: a deny-list asks "may this role do X?" and fails *open* for
  a role added later, while this asks "which role is limited to one branch?" and a
  role added later is simply unconstrained. If another such rule ever appears, put
  it beside this one rather than writing `=== 'CASHIER'` at the point of use.
- **A refusal has to say what the rule is, not that a rule exists** (requirement
  19). `requirePermission` puts the refused capability in the error's params, and
  the app turns that into a sentence in `permissions/explain.ts` — the action, and
  the roles that hold it, both derived from the mirrored matrix. So the backend
  still writes no prose, and "Insufficient permissions" reads as "Only Warehouse
  can accept, pack and dispatch a supply order." `ACTION_KEYS` is a
  `Record<Capability, …>`, so a new capability fails `tsc` until it has a phrase,
  and `lint:permissions` resolves every phrase against `en.json` because those
  keys are cast at runtime and `tsc` cannot see them. When you add a capability,
  add its phrase in all four locales in the same change.
- `req.branchAccess === null` means "every branch, for **data**", driven by
  `branch:allAccess`. Authority over *people* is a separate capability,
  `staff:viewAllBranches`. `WAREHOUSE` holds the first and not the second —
  don't recombine them, and keep the `branchAccess !== null` guards that stop a
  null reaching `.includes` and turning a 403 into a 500.
- **When a screen needs less than a capability grants, add a narrower endpoint
  — never the broader capability, and never drop the feature.** The warehouse
  desk has to pick a delivery agent but must not read the team list, so
  `GET /supply-delivery-agents` returns a name, a duty state and a count under
  `supplyOrder:fulfil`. Granting `team:view` would have handed the desk every
  branch's people; leaving dispatch unassigned, which is what happened first,
  turned a permission boundary into a missing feature.
- **"Who is able to do X" is not "whose job is X".** `OWNER`/`ADMIN` hold every
  capability, so any list built from one capability alone includes them. Where
  that is wrong, narrow with a second capability off the matrix — the agent
  picker is `supplyOrder:deliver` **and not** `supplyOrder:fulfil` — rather than
  excluding a role by name. It stays an allow-list, and a role added later lands
  on the right side of it by itself. The same shape, `{ holds, unless }`, gates
  Home's sections and the tab bar; an owner sees neither "Order raw material"
  nor "Your deliveries" for exactly this reason.
- **When you take a surface away from a role, check what else reached it.**
  Hiding the ordering card from an admin removed the only route they had to the
  raw-material catalog — and exposed that the warehouse desk, which owns that
  catalog, had never had one at all.
- **Where money goes is its own capability, and the desk never holds it.**
  `paymentAccount:manage` sets the warehouse's UPI ID and every vendor's — the
  accountant and the owner. Whoever can change where money goes must not also be
  whoever ships the goods, so it is not folded into `supplyItem:manage` even
  though vendors are otherwise the desk's: the vendor edit route ignores a `upiId`
  in its body by picking fields, and a test proves the desk is refused. Every
  change stamps who and when beside the value.
- **A business's plan is a second allow-list, and it is asked beside the role,
  never instead of it** (requirement 28). `permissions/plans.js` — pure data,
  requiring only `./catalog`, mirrored into `matrix.json` under `plans` and compared
  by `lint:permissions` — says which capabilities each plan unlocks, two *features*
  no capability can express (`vendors`, `focoBranches`), and which roles each plan
  may invite. `tenantCan` and the app's `hasCapability` answer role AND plan, so an
  owner's `'*'` is narrowed too; `requirePermission` asks them separately so the
  refusal says which (`PERMISSION_DENIED` names the roles, `PLAN_FEATURE_LOCKED` the
  plan). Never write `plan === 'GROWTH'`: ask for the capability. Lower plans are
  explicit lists and Franchise is `'*'`, so a new capability lands on the top plan
  only until somebody places it — **decide its plan in the same change**. Moving down
  a plan never takes away what exists; it stops more being created.
- **Read-only fails closed.** A lapsed plan refuses every write in `resolveTenant`
  except the short `READ_ONLY_EXEMPT` list (taking access away, clearing one's own
  notifications). A new write route is refused while read-only without anyone
  remembering it — add it to that list only if a business that has stopped paying
  must still be able to do it. Reads and exports always work.
- **Confirming money is not running the desk.** `supplyPayment:verify` was split
  out of `supplyOrder:fulfil` so the accountant could say a payment arrived without
  being able to accept, pack or dispatch. The desk holds both. When a role needs
  half of what a capability grants, split the capability — do not grant it whole.

## Branches

- **`tradingBranches` where goods move, `branches` where people are.** A
  `Branch` may be a shop or a `WAREHOUSE` (`Branch.kind`). A warehouse has
  staff, attendance, a geofence and a roster — all of which are keyed on a
  branch, which is the whole reason it is modelled as one — but it has no till
  and does not order raw material from itself. `useBranches()` returns both
  lists; pick by what the picker is asking. The server refuses the trading
  cases anyway (`BRANCH_IS_WAREHOUSE`), but a control that 400s is a control
  that should not have been offered.
- Two routes in `business.routes.js` are deliberately unguarded — `GET /` and
  `GET /branches`. The business switcher calls them for every member, including
  STAFF. Adding a `requirePermission` there looks like tidying and silently
  breaks switching for everyone who is not an admin.
- **A `@db.Date` column already holds a branch's own calendar day; a `DateTime`
  holds an instant.** `CounterOrder.tokenDate` and `Expense.expenseDate` are
  branch-local and need no conversion, so a day or month window over them is a
  plain range. `Transaction.occurredAt` is an instant, so a branch's day is the
  window of real time it occupied — `localDayRange(key, timeZone)` in
  `utils/datetime.js`. Never reach for `occurredAt::date`: it compares **UTC**
  days, which files every sale before 05:30 IST against the day before, and a
  function over a column cannot use the index behind it. **When a report must
  bucket instants into days** (requirement 34's per-day view), filter by the plain
  `localMonthRange` and bucket with `("occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE
  <zone>` — two conversions, because the column is `TIMESTAMP(3)` *without* a zone
  holding UTC, and one conversion alone reads the UTC value as local time and
  shifts it the wrong way. Bind the range ends as naive UTC text cast to
  `::timestamp`, so the comparison never depends on the database session's zone
  (`instantMetricsByBranchDay` in `analytics.service.js`).
- **Money a branch pays its own warehouse is an internal transfer, and the two
  levels of a report treat it differently on purpose.** It is subtracted from the
  branch — real money out of that shop — and **not** from the business, because it
  never left the business. So `Σ(branch netProfit) + internalTransfer ===
  businessNetProfit`, an identity asserted in `analytics.test.js` and printed on
  the screen as a sentence. Subtracting it at both levels is the easy mistake and
  makes a business appear to lose money every time it supplies itself; hiding the
  gap is the other one, and leaves someone adding the column up and disbelieving
  both figures. A warehouse is a **cost centre** in those reports: real costs, and
  its sales and material figures omitted rather than shown as zero, since it has no
  till. `SupplyOrder` records only the branch that *ordered* — there is no column
  for the warehouse that filled it, which is precisely why the transfer cannot be
  credited as warehouse revenue.
- **Money paid to a vendor is NOT an internal transfer.** A third-party vendor is
  somebody else, so their orders stay in the ordering branch's `materialSpend` *and*
  come off the business total, as `vendorSpend`; `internalTransfer` is the warehouse
  part only. Treating vendor spend as a transfer would make every vendor purchase
  vanish from the business's costs.
- **Who pays is the branch's, and is snapshotted onto the order.**
  `Branch.operatingModel` (FOCO: accounts pays; FM: the branch pays) is read when an
  order is placed and copied to `SupplyOrder.operatingModel`. Read the order's copy,
  never the branch's, for anything about an order already placed — a branch can
  change model while its orders are in flight.
- **One payee per order, so a cart is split by supplier when it is placed.** A
  vendor order runs on `VENDOR_TRANSITIONS`, not the warehouse's table, and is
  received by the branch (`supplyOrder:receive`) because nobody of ours carried it.
  A payment is confirmed by whoever *receives* it when they use the app (the
  warehouse); a vendor cannot, and accounts paying the business's own bill has
  nobody to confirm to, so those are final at once — see `receiverConfirms`.
- **One cashier per branch, one branch per cashier — and no database constraint
  can say so.** The condition is "at most one `BranchAccess` row per branch *whose
  membership's role is `CASHIER`*", and the role lives on `Membership`, so a unique
  index cannot reach across the join. Don't go looking for one, and don't add a
  check to a controller: it is enforced in `services/cashierAssignment.service.js`,
  inside the transaction that writes the row, behind `SELECT … FOR UPDATE` on the
  membership and then the branch — always that order, so two assignments touching
  the same pair cannot deadlock. Three doors reach it (invite, claim-at-signup, the
  branch-access edit) and all three go through `addBranchAccess`, which opens a
  transaction itself when it was not given one. The validator's branch-count check
  is a convenience that catches the common mistake early; the lock is the guarantee.
  A `BranchAccess` row **survives a revoke** so re-inviting restores somebody's
  scope, so the rule counts only `ACTIVE` memberships — otherwise a revoked cashier
  would keep a branch occupied forever.
- **The swap is the same request with `confirm: true`**, never a second endpoint.
  Assigning an occupied branch returns a 409 naming the current holder as a
  **param**, the app asks, and the retry is the identical call. A confirmation that
  changed the URL would be a second code path to keep honest, and what is being
  confirmed is this exact assignment. Memberships that already break the rule are
  **reported and never rewritten** (`GET …/cashier-conflicts`): deciding who keeps a
  branch needs a person, so there is deliberately no one-tap fix.
- Adding a role means a Postgres enum change, and `ALTER TYPE … ADD VALUE`
  cannot be *used* in the transaction that added it — Prisma wraps each
  migration file in one, so data work using a new value needs its own migration
  directory after it.

## Finishing a design change

**For every task: if it changes the design, finish the design properly, with
clean code.** A task is done when the screen it touched still looks right — not
when the logic works and the gates pass.

Nothing in CI can see this. `tsc`, `lint:i18n`, `lint:errors` and
`lint:permissions` all pass happily on a screen that renders as a column of
single letters. **Looking at the screen is the only check there is**, so build it
into the task rather than waiting to be sent a screenshot.

- **Adding items to a fixed-layout control is a design change**, even when no
  style file is touched. A row of chips, a segmented control, a tab bar, a
  fixed-width grid — growing the list from three to six changes the design.
  This is not hypothetical: the invite screen's role picker used
  `SegmentedOption`, which sets `flex: 1` so a row divides the width evenly.
  At six roles each chip got about 40px and every label wrapped one character
  per line.
- **Prefer a layout that scales** with the number of items — a stacked list, a
  wrap, a grid — over one that silently degrades as items are added. A grid's
  column count belongs to the *screen*, not to the stylesheet: derive it from
  `useWindowDimensions()` and a minimum readable tile width, the way
  `CounterScreen` does, rather than writing `width: '31%'` and hoping every
  phone is wide enough.
- **A size only works on the node that is actually laid out.** `width: '33%'`
  or `flex: 1` resolves against the *parent*, so putting it on a child that a
  component wraps in an unstyled view collapses it to nothing. `PressableScale`
  used to do exactly that, and the counter's product tiles rendered one
  character per line. When a shared component takes a `style`, that style must
  land on the element the parent measures.
- **A shared component has to look right at its own natural width**, not only
  when a parent is stretching it. `PrimaryButton`'s gradient had no horizontal
  padding at all, which was invisible for months because every caller made it
  full width — the content is centred, so the space came from the button being
  wider than its label. The first caller to size one by its content got a label
  flush against both edges. When a component is only ever used one way, check
  it in the other.
- **A row of two things that both grow is a row that breaks in Gujarati.** The
  supply cart's tray put the order total and the Place-order button on one
  line; every Indic translation of the label is longer than the English, so the
  figure was squeezed first in the languages most likely to be used. Stack
  them, or give one a hard ceiling.
- **Fix the layout, not the symptom.** Shrinking the font or truncating labels
  to make six chips fit is not a fix.
- **Anything that cannot be undone asks first**, through `utils/confirm.ts` —
  never a hand-written `Alert.alert`, of which there were three slightly
  different copies. It resolves a promise, so a caller reads as
  `if (await confirm({...}))`. Only the destructive direction asks: withdrawing
  a product asks, restoring it does not, because a question in front of an undo
  is only friction.
- **Reuse `src/components` and the theme tokens** so the result stays
  consistent, and add a shared component when the pattern will recur rather
  than styling it inline. `OptionRow` (single-select list with a description)
  and `SegmentedOption` (compact chip for two or three side-by-side options)
  are the two choice controls; pick by the number of options and whether each
  needs a sentence to explain it.
- **`SegmentedOption` stops working at four.** It sets `flex: 1`, so a row
  divides the width evenly however many siblings there are: four chips get
  about 76dp each on a 393dp phone, which does not hold "Present" at 13px, let
  alone its Gujarati translation. It broke that way twice — six roles on the
  invite screen, then four statuses on "Mark a day". Past three options, use a
  wrapping row of chips sized by their own content, as
  `AttendanceStatusPicker` does; nothing then breaks however long the
  translation runs or however many options are added later.
- **A list that grows with the business becomes a dropdown at seven options.**
  `SEARCH_FROM` in `utils/optionSearch.ts`, enforced inside `Picker`,
  `MultiPicker`, `BranchField` and the web's `BranchPicker` — never at a call
  site. Six or fewer keeps the chips, tiles or rows it already had, so a
  two-branch shop loses nothing; seven becomes a field you type into, because an
  owner with two hundred branches cannot scan them. Reach for those components
  rather than mapping a list into `SegmentedOption`s or `OptionRow`s by hand: ten
  screens did that, and every one of them showed all two hundred.
  - The rule is about **choosing one of many**. A fixed, enumerated, known set
    stays as chips however long — the seven weekdays of a weekly off are read as a
    row and set by eye.
  - A page whose job is **auditing** keeps its whole list and gets a filter above
    it instead; Payment accounts exists to show which shops have a QR and which do
    not, and a chooser would hide exactly that.
  - `searchFrom` raises the threshold where a control is used at speed — the
    counter's branch grid holds to twelve, one-handed and possibly offline, where
    two taps and a soft keyboard cost more than a long wrapping row.
  - **The matching is shared, not re-implemented.** A cashier is assigned from a
    phone in the shop and from a desktop in the office; if "sg" offers a different
    branch first in each, two people pick different shops from the same keystrokes.
- **Let the type system carry the design step where it can.** `ROLE_ICONS` in
  `InviteMemberScreen` is a `Record` over every invitable role, so adding a role
  fails `tsc` until someone picks its icon — rather than rendering one row with
  a hole in it.

## Frontend conventions

**Build against the React Native documentation, with core APIs.** For new
features and for bug fixes alike, check the documented behaviour before writing
the code, and use the primitive React Native already ships — `useWindowDimensions`,
`Pressable`, `FlatList`, `Platform`, `Keyboard`, `Linking` and the rest — rather
than an invented equivalent or a package that duplicates one. Flexbox, `gap`,
percentage sizing and safe-area handling each behave in a specific documented
way; guessing at them is how both of this project's layout defects shipped. Add
a dependency only where React Native genuinely has no answer, and take anything
native through an Expo config plugin (see *Native Android builds*).

**Shared server data lives in a store, not in each screen's `useState`.** If more
than one component reads it, it belongs in a zustand store under `src/store/`
(`authStore`, `branchStore`, `todayStore`, `teamStore`, `counterStore`), and the hook over it keeps
the shape its call sites already use. **Move it to a store when the second reader
appears, not after the stale copy is noticed** — `teamStore` exists because
requirement 18 gave the member list a second reader (the invite screen needs to know
which branches already have a cashier), and a private copy there would have offered
branches that were taken minutes ago. This is not a preference — it is a bug that shipped:
`useBranches` held its own `useState`, so each of its twelve callers had a
private copy fetched once on mount, and because tab screens never unmount, Home's
branch card kept showing a stale list until the app was killed and reopened.

- **Every store records which business its data belongs to** (`loadedFor`), and
  the hook's selector checks it. Without that, switching business flashes the
  previous tenant's rows for a frame.
- **Whatever mutates the data refreshes it** — `refreshBranches()`,
  `refreshToday()` — before navigating away, because the mutating screen
  unmounts and leaves no effect to re-run.
- **In-flight requests are deduped, and the pending promise is kept out of the
  store**, or every subscriber re-renders twice for a value none of them read.
- **A failed refresh keeps the previous data** and shows the error beside it,
  rather than emptying a screen that was reading fine a moment ago.
- Data scoped to one screen, or keyed per branch (`useBranchProducts`), may stay
  local — but then it needs a `useFocusEffect` refetch, because a tab screen
  never unmounts and its `useEffect` will not run again.

- `@/` resolves to `frontend/src` (configured in both `tsconfig.json` and `babel.config.js`).
- Design tokens live in `src/theme/index.ts` (colors, spacing, radius, typography,
  shadow) and motion tokens in `src/theme/motion.ts` (durations, springs, stagger).
  Use them instead of hardcoding values, so screens stay visually consistent.
- Animations use `react-native-reanimated` and run on the UI thread. Prefer
  transform-based animation over animating layout properties.
- Haptics go through `src/utils/haptics.ts`, which no-ops on web — call that
  wrapper rather than `expo-haptics` directly.
- Shared UI lives in `src/components` (`FormInput`, `PrimaryButton`,
  `DangerButton`, `PressableScale`, `BrandMark`, `Wordmark`, `AnimatedSplash`,
  `ScreenBackground`). Reuse these before writing a new variant. The brand fill for
  buttons, hero cards and avatars is `gradient.brand` in the theme, not a pair of
  hex codes; the red one for Log out and for an irreversible final step is
  `DangerButton` (`outline` / `solid`), not a third inline copy of its style.
- **The mark is drawn once, in `src/constants/brandMark.json`** — the KP monogram,
  fitted to Béziers from the supplied logo **image**, so it is an approximation of
  that artwork rather than a copy of a vector. Its parts are `speedLine1..3`,
  `kLetter` and `pLetter`, and those names are a **closed set in four places**: the
  `PartName` union in `frontend/src/components/BrandMark.tsx` and in
  `web/src/components/brand/BrandMark.tsx`, the `LAYERS` table in the web one, and
  `PART_ORDER` in `scripts/generate-brand-assets.js` (which throws if a name goes
  missing). Adding or renaming a part means all four. Drawing order matters: the P
  paints over the tip of the K's arm, which is what makes the two letters interlock.
- **`npm run brand:assets` renders every raster from it** — and nothing in CI checks
  they are in step, so run it in the same change as a change to the drawing. It
  writes `web/public/`'s icon set too; that folder used to be a hand copy of
  `frontend/assets/`, which is how a favicon goes stale. The renderer is
  deliberately not a dependency; the script's header says how to get it.
- **Three numbers are locked together and checked before anything renders**:
  `splashMarkWidth` in the drawing, `imageWidth` in `app.json`'s
  `expo-splash-screen` block, and `ADAPTIVE_MARK_WIDTH` in the script.
  `splashMarkWidth === imageWidth × ADAPTIVE_MARK_WIDTH ÷ 1024`, on a strict float
  comparison, so a mark of different proportions means re-solving all three — the
  KP mark is wider and shorter than the one before it and did.
- **Both apps read the same drawing**, `BrandMark.tsx` in each, so the in-app logo,
  the launcher icon, the favicon and the store page cannot drift apart. Its
  **`navy` and `coral` are also
  `colors.primary` and `colors.accent`**, so the UI and the mark beside it cannot
  drift; the backend's printed documents and legal pages repeat the pair as
  `BRAND` and `ACCENT` in `documents/layout.js`, the one copy a PDF cannot import.
- **Navy leads and coral accents, and that is a measurement.** Navy is 14.0:1 on
  white; **coral is 3.37:1**, which fails AA for body text, and white on a coral
  fill fails too — a coral button with a normal-size label is unreadable to the
  standard, and coral on the light pink is 2.66:1. So coral is the mark, the
  "pay" of the wordmark and large figures, and `accentStrong` (5.7:1) carries
  coral *text* and the label on a coral fill. `error` is deeper than the stock
  red for the same reason: coral sits close enough to `#DC2626` that a loss
  figure and ordinary brand chrome would have read alike.
- **Primary is also published as channels** — `--primary-rgb` in `tokens.css` —
  so anything needing it at an opacity says `rgba(var(--primary-rgb), .28)`
  rather than re-typing the hex as decimal. Five places had done the latter and
  silently kept the previous brand colour after everything else had changed.

## Translations

The app ships in English, Hindi, Gujarati and Marathi. **Never hardcode a
user-facing string** — render it with `t('section.key')` from
`useTranslation()`.

- Strings live in `src/i18n/locales/{en,hi,gu,mr}.json`. `en.json` is the source of
  truth: `src/i18n/i18next.d.ts` types `t()` against it, so a key missing from
  `en.json` is a compile error rather than text that renders as the raw key.
- **The product's name is written `{{appName}}`**, never spelled out in a
  string — see *Naming*.
- Adding a language means adding a JSON file and one row in `LANGUAGES`
  (`src/i18n/index.ts`). Nothing else in the app changes.
- Language resolution order: an explicit choice stored on the device, then the
  account's `preferredLocale`, then the device language, then English. Changing it
  persists locally and PATCHes `/auth/me/locale` so other devices follow.
- i18next runs with `compatibilityJSON: 'v3'` because React Native has no
  dependable `Intl.PluralRules`; plurals therefore use `key` / `key_plural`.
- **Dates and clock times come from `utils/date.ts`, never from `Intl`.** The
  same missing Intl that forces the plural setting above also makes
  `toLocaleDateString` / `toLocaleTimeString` unreliable on Hermes: they fall
  back to a fixed format and quietly ignore their options, which is why
  `{ hour12: true }` would not have fixed anything. Month names, weekday names
  and the AM/PM marker are therefore ordinary translation keys, and
  `formatTime(iso, t)` assembles a time through `time.ofDay` so a locale can
  reorder the figure and the marker. Six hand-rolled copies of a clock
  formatter had accumulated before this was one function — if you are about to
  write `getHours()` in a component, the helper already exists.
- The Hindi, Gujarati and Marathi files were written without a native-speaker
  review. Treat wording fixes from a speaker as expected, not as defects.
- **The web app reads these same files** (see *Web app*), so a key renamed or
  removed here is renamed or removed there too, and `web/`'s `npm run lint`
  fails on any key it still uses.
- **Never name a `<Trans>` tag after a void HTML element** — `link`, `br`, `img`,
  `input`, `hr` and the rest. react-i18next parses the markup as HTML, so
  `<link>Privacy policy</link>` closed at `<link>` and rendered an empty link
  with the words as plain text beside it: sign-up's privacy link was untappable
  until it became `<policy>`. Neither `tsc` nor `lint:i18n` here can see it;
  `web/`'s `lint:i18n` checks every shared translation for it.
- **Every element in a `<Trans components={{…}}>` carries a `key`**, though it
  is not in a list. react-i18next 14 copies it through `React.Children.map`, and
  React 19 marks a copy of a keyless element as still owing a key warning
  whatever key the copy is given — so the Login heading logged "Each child in a
  list should have a unique key … passed a child from Trans" on every render.
  Name the key after the tag (`<Text key="brand" …/>`). Dev-only, so nothing
  but the console shows it.

**Five files are allowed to break this, and all of them are fenced.** Each one
earns it the same way — the rule's premise stops being true, rather than being
quietly violated:

- `notifications/labels.js` — Android draws a notification before app code runs,
  so there is no moment in which the device could render it. The device reports
  its own language when it registers its token (`DeviceToken.locale`), so the
  backend is told rather than guessing.
- `documents/payslip.labels.js` — a payslip PDF is built where the app cannot
  reach it, and it is fetched with an explicit `?lang=`.
- `documents/export.labels.js` — the day-end and month-end spreadsheet and its
  printable summary (R17). An `.xlsx` cell cannot hold a translation key and
  neither can a printed page, and this too is fetched with `?lang=`.
- `mail/reset.labels.js` — the password-reset email. There is no app on the
  other end of an email and nobody is signed in to ask, so what leaves here is
  what the person reads. Unlike the two documents there is no `?lang=`, but it is
  not a guess either: `User.preferredLocale` is the language that account chose,
  and it is the best thing known about a reader who cannot currently sign in.
- `frontend/src/constants/receiptLabels.ts` — the counter's printed token slip
  (R31), and the only one of the four in the app. A 58mm receipt printer's
  built-in font is ASCII with no Indic glyphs, so there is no moment at which the
  printer could draw the reader's language; a translated label would print as
  question marks. Drawing the slip as an image was offered and declined (slower
  per token). Product names the printer cannot draw fall back to the product's
  code, then to "Item 3" — never question marks.

`npm run lint:receipt-prose` fails if anything but `utils/receipt.ts` imports the
receipt labels (in `frontend/src` or `web/src`), or if a label is not printable
ASCII. `npm run lint:notification-prose` fails if anything but `notifications/push.js`
requires the notification label file, and `npm run lint:backend-i18n` compares all
four languages in **all four** dictionaries, checks no translation drops a
placeholder the English uses, and checks every code the backend can send has an
app key. **Do not widen this further**: everywhere else, send a code and let the
device render it — the export's double-count warning travels in its JSON as
`{ code, params }` for exactly that reason, and only the printed document renders
it as a sentence. `?lang=` is what makes a *document* the exception; it does not
license prose in an ordinary API response.

**The privacy policy and the account-deletion page are not another exception**,
though they are prose from the backend (`backend/src/legal/pages.js`, served at
`/privacy` and `/delete-account`). They are public web pages, not API responses:
the app store's reviewers and anyone following the store listing's link read them
in a browser, with no app on the other end to render anything, and the app itself
only opens them there (`utils/legalLinks.ts`). They are English because each is a
legal statement and nobody has reviewed a translation of one. They describe what
the code collects, so **a feature that starts collecting something new changes
`pages.js` in the same change**, and the Data safety table in
`Docs/PLAY_STORE_RELEASE.md` with it.

**This applies to the backend too, which does not translate and must not try.**
It cannot know the reader's language — the choice lives on the device and may
differ from the account's `preferredLocale`. So never write a message as prose
at the point you throw it:

- Add a code to `backend/src/errors/catalog.js` and throw `fail('CODE', status)`
  (or `fieldError('CODE', field, params)` from a validator). The English in the
  catalog is the *fallback* — what curl, the logs, and an app too old to know
  the code will show — not the translation.
- Add the wording to `errors.api.<CODE>` or `errors.validation.<CODE>` in all
  four locale files. `npm run lint:errors` (in CI) fails if you forget; `tsc`
  cannot catch it, because the key is assembled at runtime.
- Anything that varies travels in `params`, never baked into the sentence — a
  translated sentence puts its numbers in a different place.

## Web app

`web/` is the browser version, React 19 + Vite + React Router, against the same
API. It was ported screen by screen and now has a page for every screen of the
app; `Docs/PROJECT_FLOW.md` section 15 is the record, and browser push (W13) is
what remains. `web/README.md` has the layout and the commands.

- **It reads the mobile app's code, it does not copy it.** `@shared/` is
  `frontend/src`, and the web imports from there: the four locale files, the
  matrix (`permissions/index.ts`, `matrix.json`), the refusal sentences
  (`permissions/explain.ts`) and `staffBase.ts`, every file in `types/` but
  `notification.ts`, `navigation/routeCapabilities.ts`, the brand name and mark,
  and the pure helpers — `utils/format.ts`, `validation.ts`, `date.ts`,
  `upiUri.ts`, `expenseCategory.ts`, `hooks/useMonthCursor.ts`,
  `constants/salesTemplate.ts`, `constants/plans.ts` (how a plan is described, and
  when Home's plan banner shows), `constants/quickActions.ts` (Home's tiles and who
  sees each), `utils/costMetrics.ts` (a report card's kinds of cost),
  `utils/dailyReport.ts` (Reports' Per day arithmetic), `utils/teamRules.ts` (who may
  be invited and to what, requirement 18's cashier rules and 409s, who may remove
  whom), `utils/account.ts` (a deleted account), `permissions/staffBase.ts`, the
  supply rules — `utils/supplyActions.ts` (which steps an order offers whom),
  `supplyStatus.ts` (how a status and a payment read), `supplyGroups.ts` (how a cart
  splits and the catalog groups), `whatsappNumber.ts` (the pure half of
  `whatsapp.ts`) and `supplyPayments.ts` (what is owed grouped by payee, the
  one-payee selection, the history totals) — `utils/optionSearch.ts` and
  `types/picker.ts` (when a list becomes a dropdown, and how typing ranks it),
  `constants/regions.ts` (countries, currencies and timezones) — and the counter's
  pure half (see *The counter works offline*). A second copy of any of them would drift
  exactly as the mirrors are checked not to — the web's own `costMetrics.ts` had
  already lost the per-day caption before it was shared.
- **So a shared file imports only relative paths and four packages** — `i18next`,
  `react`, `react-dom`, `react-i18next` — the same fence as
  `permissions/catalog.js`. The web compiles these files with its own toolchain,
  where `@/` means `web/src` and React Native does not exist; and a bare import
  from `frontend/src` resolves to **`frontend/node_modules`**, a second copy of the
  package (a second, uninitialised i18next made every refusal sentence come back
  empty) or, in CI, none at all. `web/vite.config.ts` (`dedupe`) and
  `web/tsconfig.app.json` (`paths`) pin those four to the web's own copy, and
  `web/`'s **`npm run lint:shared`** fails on anything else, naming the file and
  the import. That is why `utils/upi.ts` is split — `upiUri.ts` is the pure half,
  `upi.ts` keeps the `Linking` opener and re-exports the rest — and why
  `explain.ts` imports `i18next` itself rather than `@/i18n`.
- **A web page opens on the app's own route rule.** `ROUTE_CAPABILITY` lives in
  `navigation/routeCapabilities.ts` as pure data (`routeAccess.ts` imports it and
  checks every key is a real route), and `web/src/routes/paths.ts` names the app
  route each page stands for. Add an app screen there and `web/`'s tests fail until
  the web has a route for it. Whether a page *appears* in the sidebar is the
  separate, job-based question — `web/src/constants/navigation.ts` — and a test
  proves no role is shown an entry it cannot open.
- **Every convention in this file applies there too**: capabilities never role
  names (`passesGate` with the same `{ holds, unless }` shape as Home), no
  hardcoded strings (web-only wording goes in `web/src/i18n/locales` under
  `web.*`, in all four languages), shared server data in a zustand store with
  `loadedFor`, anything irreversible through `utils/confirm.ts` (the same
  `if (await confirm({...}))`, on a `<dialog>`), and the design looked at — at
  320, 390, 820 and 1440 wide, in Gujarati — before a screen is called done.
  **`npm run shots`** does that looking: it builds, serves the build, and
  photographs every scenario in `web/scripts/shots/scenarios.mjs` at those widths
  and languages against a pretend API, failing on sideways scroll or a page
  error. Add a ported page's scenarios there in the same change.
- **The web is not React Native**, so the reasons behind a few app rules do not
  hold there, and it should not imitate the workaround: it has a full `Intl`
  (it fills sign-up's timezone from the browser), a real `localStorage`, CSS
  `gap` and container queries. It still reads the locale files with
  `compatibilityJSON: 'v3'`, because the files are the app's.
- **A date is `DatePicker`, never `<input type="date">`.** The native input
  carries the browser's own calendar, and that panel cannot be styled
  (`::-webkit-calendar-picker-indicator` reaches the little icon and nothing
  behind it), differs in Chrome, Firefox and Safari, and draws its month and
  weekday names in the **browser's** language — so a shop running the app in
  Gujarati got an English calendar. `components/ui/Calendar.tsx` over
  `utils/calendarGrid.ts` is the replacement, and `DateField` (in a form) and
  `DayCursor` (a cursor strip) are the two ways in; the grid is six rows always,
  so paging does not resize the panel, and Sunday-first, so a column index is the
  same number as `Date.getDay()` and `weeklyOffDays`. **Do not reach for a
  date-picker package** to replace it: react-day-picker and the rest name months
  from `date-fns` or `Intl` locales, which would put a second source of month
  names beside `month.1` in the four locale files — the single source precisely
  because Hermes has no dependable `Intl`. The app is the exception and stays one:
  it opens the platform's picker, which is native and OS-localized.
- **Its storage keys are its own**, named in `STORAGE_KEYS` — the two run on
  different origins and never read each other's storage. Both were renamed at the
  KitnaPay rebrand and both carry the old names forward on first read; see
  *Naming*. The token lives in `localStorage`, which is what a bearer-token API
  leaves a browser — an httpOnly cookie would need the backend to issue one.
- **`VITE_API_URL` is inlined at build time**, the same trap as
  `EXPO_PUBLIC_API_URL`. Serve the build from an origin the backend's
  `CORS_ORIGINS` allows once that is set.
- **A service worker keeps the whole build** (`web/sw/service-worker.js`) so the
  counter opens with no connection, even after a browser restart. The build writes
  its file list into `dist/sw.js` (the plugin in `vite.config.ts`, which fails the
  build if the worker's marker is gone). Its invariants: **the API is never
  cached** (another origin, and `/api/`); pages are network-first and fall back to
  this build's kept page; a hashed asset is kept only when it is not HTML, because
  the host answers a missing file with the app's page; this build's and the
  previous build's caches are kept, so an open tab can still load its chunks. It
  registers only in a production build on a secure page, and `npm run shots`
  blocks it. `VITE_SERVICE_WORKER=off` publishes a worker that removes itself.
- **The receipt printer is reached through Web Serial** (`web/src/utils/printer.ts`):
  Chrome and Edge open a printer paired in the system's Bluetooth settings over its
  Serial Port Profile and are sent the shared `buildReceipt` bytes, so a web token
  is the app's token. Web Serial names no device, so this site holds exactly one
  port — choosing a printer forgets the others. Any other browser, or a USB
  printer, prints through the print dialog (`utils/receiptHtml.ts`, built from the
  same rows, every row HTML-escaped). How this browser prints is a setting of the
  browser (`kitnapay_printer`), not of an account.

## Native Android builds

The app ships as a **development build** (`expo-dev-client`), not Expo Go.

- `android/` and `ios/` are generated by `expo prebuild` and are gitignored.
  **Never hand-edit files inside them** — edits are silently discarded on the next
  prebuild. Express native changes as Expo config plugins in `app.json`; see
  `frontend/plugins/withReleaseSigning.js` for a Gradle file it edits and
  `frontend/plugins/withAndroidArchitectures.js` for a Gradle property it sets.
  **A plugin that edits a file by matching text must throw when the text is not
  there.** `withReleaseSigning` used to `replace` quietly, so a React Native template
  change would have produced a "release" signed with the debug key — a build that
  succeeds and that Play refuses. It now stops prebuild and says which piece moved.
- **Native code the app owns lives in `frontend/modules/`, as a local Expo module**
  — the one sanctioned exception to "only config plugins". `modules/receipt-printer`
  (R31) is four Kotlin calls over a Bluetooth SPP socket: list the paired
  printers, connect, write bytes, disconnect. What the bytes *say* is built in
  TypeScript (`utils/escpos.ts`, `utils/receipt.ts`), where it is tested and
  shared, so the Kotlin never changes when the receipt does. Autolinking finds it
  through its `expo-module.config.json` (no `package.json` needed), it survives
  prebuild because it is not inside `android/`, and its `AndroidManifest.xml`
  declares exactly the permissions it uses — `BLUETOOTH_CONNECT`, and `BLUETOOTH`
  capped at API 30 — and **no `BLUETOOTH_SCAN` or location**: the printer is paired
  in Android's own settings and the app only reads the bonded list. It runs on
  `Dispatchers.IO`, never Expo's shared module queue, because a Bluetooth connect
  can block for seconds and that queue also carries the file writes that save a
  sale. The JS side loads it with `requireOptionalNativeModule`, so an APK built
  before it existed (and the web, and iOS) still bills — printing is what is
  missing there, and the printer screen says so. Adding it, or changing its
  Kotlin, needs a native rebuild; compile-check it without one with
  `cd android && ./gradlew :receipt-printer:compileDebugKotlin`.
- **Expo SDK 54, React Native 0.81, and the old architecture** (`newArchEnabled:
  false`). SDK 54 is the last SDK that allows the old one, and the upgrade was made
  for Google Play's target-API rule (API 36), not for the New Architecture — so
  `react-native-reanimated` stays on 3.x, because 4.x requires it.
  `expo.install.exclude` in `package.json` stops `npx expo install --fix` from
  "fixing" that back to 4.x. Play raises the target every August; the 2027 one
  needs SDK 56 or later, and with it the New Architecture.
- React Native's Gradle (8.14 on RN 0.81) cannot run on JDK 25. JDK 17 is pinned
  per-project via `org.gradle.java.home` in `android/gradle.properties`, so the
  machine's global `JAVA_HOME` can stay on a newer JDK for other work. Do not change
  the global one.
- **`frontend/google-services.json` must exist before a build**, or the app has
  no Firebase config compiled into it and no push will ever arrive — the same
  build-time trap as `EXPO_PUBLIC_API_URL`, and just as silent. It is gitignored;
  `Docs/FIREBASE_SETUP.md` is how to produce it. **On EAS that gitignore is the
  problem**: EAS Build uploads only git-tracked files, so prebuild there fails
  outright with "google-services.json is missing". `frontend/app.config.js`
  exists solely to take the path from a `GOOGLE_SERVICES_JSON` file-type EAS
  environment variable when one is set, falling back to the literal path in
  `app.json` locally — which is why `app.json` is no longer the whole config,
  and why a config value that has to vary per build environment belongs there
  rather than in the JSON. The backend's half,
  `backend/firebase-service-account.json`, is a **credential** — anyone holding
  it can push to every user.
- `expo prebuild --clean` deletes machine-local files that must then be restored:
  `android/local.properties`, the JDK pin in `android/gradle.properties`,
  `android/.idea/gradle.xml`, and `android/.gradle/config.properties`. Plain
  `expo prebuild` preserves them, so prefer it unless a full reset is required.
- **`npm run android` builds the *debug* variant**, which carries no JS bundle
  and pulls one from Metro at launch — useless on a phone that is not tethered
  to this machine. A shareable APK is the release variant:
  `cd android && ./gradlew assembleRelease`, which writes
  `android/app/build/outputs/apk/release/app-release.apk` with the bundle, and
  therefore the `EXPO_PUBLIC_API_URL` that was in `.env` at build time, compiled
  in. Without `frontend/keystore.properties` it is signed with the debug key —
  fine for sideloading, not acceptable for the Play Store. **What Play takes is an
  `.aab`, built by `npm run build:play`** (see *Commands*), which sets the API
  address from its argument rather than `.env` and refuses the mistakes above
  before Gradle starts.
- **`frontend/tsconfig.json` must keep excluding `android` and `ios`**, and its
  `exclude` list must keep repeating the four entries from `expo/tsconfig.base` —
  `exclude` replaces that list rather than merging with it. `expo/tsconfig.base`
  sets `allowJs: true` and does not exclude the native directories, so a Gradle
  build drops 1.4MB of bundled dev-menu JS into `android/app/build`, and that
  bundle contains `process = this.process || {}`. TypeScript infers it, merges it
  with the global `process`, and `process.env` loses its index signature. The only
  symptom is `Property 'EXPO_PUBLIC_API_URL' does not exist on type 'typeof env'`
  in `api/client.ts` — a file nobody edited, breaking because somebody ran
  `npm run android`, and clean again the moment `android/` is deleted. Hunting it
  in the frontend source finds nothing, because it is not there.
- **The launch splash is Android's own, configured by the `expo-splash-screen`
  plugin in `app.json`.** Its icon is `adaptive-icon.png` (the bare mark, inside the
  launcher's safe circle) at `imageWidth` 288dp, which Android 12+ masks to a 192dp
  circle the whole mark fits inside. That puts the mark at 288 × 500/1024 = 140.6dp,
  which is `splashMarkWidth` in `constants/brandMark.json`, and `AnimatedSplash`
  draws it at exactly that width so the hand-over does not jump;
  `scripts/generate-brand-assets.js` throws if the three stop agreeing. Up to SDK 51
  a custom plugin, `withAndroid12SplashScreen`, supplied what Expo did not emit.
  **Do not bring it back**: SDK 52+ derives the splash theme from
  `Theme.SplashScreen`, and its `parent="AppTheme"` override would break the
  splash. The splash and `AnimatedSplash` are the same white (`#FFFFFF`, repeated in
  `app.json` because JSON cannot import it), and `androidStatusBar.barStyle` asks for
  dark status-bar icons so the clock does not vanish into it before JS starts.
- **Every Android screen is edge-to-edge, and there is no way out.** Android 16
  enforces it for an app targeting API 36, and SDK 54 turns it on for every
  version: the app draws under the status bar and the navigation bar. So
  `androidStatusBar.backgroundColor` does nothing any more, and anything pinned to
  the bottom of a screen — a tray, a button bar, a form's submit — has to keep clear
  of the navigation bar with `useSafeAreaInsets().bottom` or a `SafeAreaView` whose
  `edges` include `bottom`. **A screen that is a tab for one role and a modal for
  another takes its edges from `useScreenEdges()`**: inside the tab navigator the
  tab bar already keeps clear of the system bar, so `bottom` must be left out or it
  is padded twice; pushed as a modal there is no tab bar, and `bottom` is needed.
  Twelve screens skipped `bottom` unconditionally, which was harmless before SDK 54
  and put a modal's last button under the bar after it. Check it with both gesture
  and 3-button navigation; nothing else will show it.
- **The keyboard no longer shrinks the window.** Edge-to-edge breaks
  `adjustResize`: Android hands the app the keyboard's size and resizes nothing.
  So every screen with an input wraps its scroll view in
  `<KeyboardAvoidingView behavior="padding">` **on Android as well as iOS** — the
  `Platform.OS === 'ios' ? 'padding' : undefined` every form used to have now
  leaves Android doing nothing, and a field near the bottom disappears under the
  keyboard.
- **`userInterfaceStyle: "light"` reaches Android only through `expo-system-ui`.**
  SDK 54's template theme is `DayNight`, so without that package a phone in dark
  mode draws the confirm dialogs and the date picker dark over a light app — and
  prebuild says so only as a one-line warning.
- **The debug APK is built for one CPU architecture, and that is deliberate.**
  React Native's default packages all four, which on this project meant **127MB of
  native libraries in a 147MB APK** — `arm64-v8a` 38.8MB, `x86` 34.4MB, `x86_64`
  33.3MB, `armeabi-v7a` 20.6MB. A modern phone reports `arm64-v8a` and nothing
  else, so ~88MB of every install was native code the device cannot execute.
  `plugins/withAndroidArchitectures.js` sets `reactNativeArchitectures` through
  `withGradleProperties`, so it survives prebuild instead of being a hand edit to
  `android/gradle.properties` that the next one throws away. **On React Native
  0.81 the property alone does nothing for this app**: RN's Gradle plugin turns it
  into `ndk.abiFilters` only under the New Architecture, so after the SDK 54
  upgrade the APK quietly went back to all four ABIs and 145MB. The plugin
  therefore also writes `abiFilters` into the app's `defaultConfig`, read from the
  same property so a `-P` still wins. Do not drop that half while the app is on
  the old architecture.
  **Two cases need it widened, and neither fails loudly**, so use the environment
  variable rather than editing the plugin: an **emulator** is usually `x86_64`, and
  a **release APK for distribution** that drops `armeabi-v7a` simply cannot be
  installed on a 32-bit device.

      EXPO_ANDROID_ARCHITECTURES=x86_64 npm run android
      EXPO_ANDROID_ARCHITECTURES=arm64-v8a,armeabi-v7a npx expo prebuild -p android

  `npm run build:play` passes `armeabi-v7a,arm64-v8a,x86_64` to Gradle as `-P` for
  the Play bundle, so it needs neither and leaves the debug setting alone.

- **`adb.exe: failed to install … exited with non-zero code: 1` is not the error.**
  Expo's `spawnAsync` swallows adb's own message and reports only the exit code, so
  an install failure reads like a build problem. **Run the install by hand to see
  what actually happened** — the command is in the stack trace Expo prints:

      adb -s <device> install -r -d --user 0 android/app/build/outputs/apk/debug/app-debug.apk

  The two causes seen so far are completely different and the exit code cannot tell
  them apart: `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, which is a **signature clash**
  from a release APK already being installed (uninstall it — `-r -d` can downgrade a
  version but never change a signature), and a **dropped wireless adb connection**
  mid-transfer, which succeeds on a plain retry and is why the APK size above is
  worth caring about.
- **`adb` over Wi-Fi goes `offline` when idle, and the device's IP moves.** The
  symptom is `adb devices` reporting `device`, `get-state` reporting `device`, and
  the very next `adb shell` saying `adb.exe: device offline`. Reconnect with
  `adb disconnect <ip>:5555 && adb connect <ip>:5555`. The IP is a DHCP lease and
  has already changed between sessions, so a reservation on the router — or a
  cable — saves rediscovering it. **Every reconnect drops the reverse tunnels**, so
  `npm run adb:reverse` has to follow it or the app loads and every request fails
  with `errors.unreachable` (see *Environment*).

## Downloading a file to the device

**Never `FileSystem.downloadAsync`.** It does not reject on a non-2xx status, so a
403 writes `{"message":"Insufficient permissions"}` into the file and shares a
corrupt one under a `.pdf` or `.xlsx` name. That shipped once already. Fetch
through `apiClient` — axios rejects, and the caller's existing catch reports it —
and hand the body to one of the two helpers that exist for this:

- `utils/printDocument.ts` for server-rendered HTML the device prints to PDF
  (payslips, the export summary).
- `utils/downloadFile.ts` for binary (the export spreadsheet). It reads the
  response as a `Blob` and base64-encodes it with `FileReader`, because
  `expo-file-system` writes text and Node's `Buffer` is not in an Expo bundle —
  both are core APIs, so this needs no polyfill.

Both split on `Platform.OS === 'web'`, where the useful action is a print dialog
or an anchor download rather than a share sheet. Both — and `utils/saveTemplate.ts`
— import `expo-file-system/legacy`: SDK 54 made a new File/Directory API the
package's default, and the legacy entry point is the API they were written
against. Moving them is its own task, not a find-and-replace.

## The counter works offline

Requirements 29–31. The counter is the one part of the app that has to keep
working with no connection, because a shop does not stop serving when its Wi-Fi
does. The rules that make that safe, each of which is easy to break by tidying:

- **One write path.** Every paid sale — online or offline — goes to
  `POST /counter-sales/sync` (`counterSale.service.js`). An online sale is an
  offline sale whose queue emptied at once. Do not add a "fast path" that posts
  a sale directly when the phone seems online; that is a second code path to keep
  honest, and "seems online" is a guess.
- **Idempotent by `clientRef`.** The phone names each sale with a UUID
  (`expo-crypto`), and `@@unique([businessId, clientRef])` makes a resend find
  the first copy. The sync is state-based — "this sale exists and is CLOSED/VOID"
  — not a log of operations, so a void is the same sale sent again.
- **Saved before printed.** `counterStore.completeSale` awaits the write to disk
  before the token is printed or shown. A token in a customer's hand must never
  belong to a sale the phone could still lose.
- **Never dropped on the phone's own initiative.** A refused sale stays, with its
  reason, until a person sends it again or confirms removing it. `logout()` resets
  the store in memory and leaves its files; the next person to sign in to that
  business sends them. `pruneQueue` drops only sales the server has, from a day
  that is over.
- **A paid sale is never refused for catalog drift**, and records the price the
  phone charged. It is refused only for what this person may not record at all,
  and per sale, so one bad sale never holds the queue.
- **The server owns the day.** `tokenDate` is the branch-local date of the paid
  instant, computed on the server; the phone only needs it to number tokens, and
  gets the branch's UTC offset and the server's clock from `counter-day` rather
  than trusting Hermes's `Intl` or its own clock.
- **Tokens are chosen under the counter row's lock.** Postgres aborts a
  transaction on a unique violation, so the free-number check happens inside the
  lock `allocateToken` also takes, never by catching P2002 and retrying.
- **The phone's files are `utils/textStore.ts`**: JSON in the app's private
  document directory, written to a temporary file and moved over the old one, and
  serialised per key. Not SecureStore (secrets only, ~2KB a value) and not
  AsyncStorage (a native dependency for what `expo-file-system` already does).
  Use it for anything else that must survive offline; keep it out of the shared
  files the web reads — the web keeps its bills in IndexedDB (below).
- **The app opens offline.** `authStore.bootstrap` restores the last session the
  server confirmed (`session-cache`) when the server cannot be reached, for the
  same token only. The cost is written down in TESTING_GUIDE's known limitations:
  an account disabled while its phone is offline keeps billing there until the
  phone next reaches the server.
- **The pure half is shared.** `utils/counterQueue.ts`, `counterReceipt.ts`,
  `receipt.ts`, `escpos.ts` and the sender's rules, `counterSyncRunner.ts`, import
  nothing but each other and the types, and are tested in the web's Vitest. Each
  app wires the runner to its own store, API call and axios errors
  (`utils/counterSync.ts` in both); change *when* or *how* the counter sends in
  the runner, never in one app's wiring.

**The web counter keeps the same rules in a browser** (W12), and adds what tabs
need. Each is easy to undo by tidying:

- **Its bills are in IndexedDB, not localStorage** (`web/src/utils/counterPersistence.ts`).
  A write resolves only once its transaction has committed (`durability: 'strict'`
  for a sale) — "saved before printed" in a browser; localStorage returns before
  the disk has it and swallows a full disk.
- **Every change is one read-change-write transaction on the stored record**, and
  the record is then the store's state. **A sale's token is chosen inside that
  transaction**, from what is really stored, so two tabs of the counter never
  issue the same token. Never write the store's in-memory copy back whole: it may
  be a tab behind.
- **One tab sends.** The drain runs under a Web Lock per business; a tab that
  finds it held tries later. Without Web Locks (plain http) it just sends — a
  resend is DUPLICATE. Other tabs hear of a change, and of the sync state, on a
  BroadcastChannel.
- **A browser that will not keep data takes no bill** (some private windows): the
  counter says why rather than pretend to save.
- **The page opens offline** from `kitnapay_session_cache` (the web authStore,
  same rules as the app's), and from the service worker — see *Web app*.

## Dependency overrides

Both `package.json` files carry an `overrides` block, and every entry is a
security patch forced above what some dependency's own range allows. A `//overrides`
note in each file points here.

**`npm audit`'s `fix available via npm audit fix --force` is almost always wrong
for this project, and following it would destroy the app.** npm only ever
proposes bumping the *direct* dependency, so a vulnerability three levels down
inside `@expo/cli` is reported as "will install expo@57, which is a breaking
change" — six SDK majors, a different React Native, a different new-architecture
default, and every native module re-pinned. The vulnerable package is nearly
always a **build-time tool** that an override can patch on its own while Expo and
React Native stay exactly where they are. That is the first thing to reach for.

**Before overriding a transitive dependency across a major version, read the
call site that consumes it.** This is the whole risk, and it does not show up as
a type error or a failing test — it shows up as a broken build later, on someone
else's machine. Two patched majors on record changed exactly the surface their
consumer calls, both found by checking. One is still live:

- **`image-size` 2** is the only patched line (`<=2.0.2`; 1.x never got a fix,
  so `npm audit`'s "fix available via `npm audit fix`" for it is false). On SDK 54
  its consumer is **the metro pinned inside `@expo/metro`** — 0.83.3, at
  `node_modules/@expo/metro/node_modules/metro` — which is the copy Expo bundles
  with. Its `src/Assets.js` does `_interopRequireDefault(require("image-size")).default(...)`
  with a Buffer in one place **and a file path** in the other; image-size 2's
  CommonJS build sets `__esModule` with no `default`, and measures bytes only. A
  bare override breaks Metro's asset pipeline, which means every bundle. The
  top-level metro (0.83.8, pulled in by React Native's CLI) has its own image
  parser and no image-size at all — which is how this pair will end.
- **`tar` 7** was the other, until SDK 54. `@expo/cli` 0.18 did
  `_interopRequireDefault(require('tar')).default.extract(...)` against a tar 7
  with no `default`, and on **Windows** every tarball Expo extracts — the prebuild
  template among them — went through it, because `extractAsync` only uses the
  native `tar` binary elsewhere. SDK 54's `@expo/cli` asks for `tar ^7.5.2` itself
  and calls it correctly, so the override and its patch were deleted in the
  upgrade.

Both were confirmed by installing the candidate version in a scratch directory
and replicating the exact `require` and call, not by reading changelogs. Do that
rather than guessing: the failure mode is a build that works for you and not for
CI.

**When the break is only in how the consumer calls it, patch the consumer.**
`image-size` is overridden to the patched line anyway (`^2.0.4`), and
`frontend/patches/@expo+metro++metro+0.83.3.patch` turns metro's
`_imageSize.default` into a wrapper that reads a path into bytes before calling
`imageSize`. `patch-package --error-on-fail` applies it on `postinstall`, so
`npm ci` in CI and on EAS gets it too. **An override and its patch only work as a
pair** — neither half on its own leaves a working build.

- A patch is written against an exact version, and for a nested copy an exact
  path: the `++` in the file name is patch-package's spelling of
  `@expo/metro/node_modules/metro`. When an Expo release moves it,
  `--error-on-fail` stops the install instead of leaving the build half-patched.
  Regenerate the patch against the new version (edit the file in `node_modules`,
  then `npx patch-package @expo/metro/metro`); don't drop the override to make the
  install pass.
- A patch that still applies but no longer works is what
  `npm run lint:patched-deps` (in CI) catches. It calls metro's two measurers
  through `@expo/metro/metro/Assets` — the entry point Expo itself uses, not the
  top-level `metro`, which is a different copy — and checks them against the
  icon's own PNG header.
- **A `file:` override cannot do this job**, and it was tried first, as a local
  adapter package standing in for `tar`. npm 10 resolves a `file:` override's
  path relative to **each package that depends on it**, not the project root, so
  `file:./compat/tar` became `node_modules/@expo/cli/compat/tar`, a dangling
  link; the `$name` reference form returns the same string and fails the same
  way. `npm audit` then reported **0 vulnerabilities**, because the vulnerable
  package was gone — and so was the module Expo requires. After any override
  change, read `npm ls` for `invalid`, not just the audit count.

**What an override is allowed to be:** a patch within the same major
(`postcss` in the frontend, `qs` in the backend), or a major bump whose consumer
provably only uses the surface that survived (`uuid` 7→11 is fine because
`xcode`, its one consumer left on SDK 54, calls the named `v4` export, which
uuid 11 still ships for CommonJS).

**`qs` is the one that is actually attacker-reachable.** Everything else in
either audit is developer tooling that never leaves this machine; `qs` parses
request query strings on the live API. Express 4.22 asks for `~6.15.1` and every
`6.15.x` is vulnerable, so 6.16.0 is the only fix and the override is the only
way to get there. The backend test suite goes through Express for every route,
which is what makes that bump safe to make rather than safe to hope about.

**Three frontend advisories have no fixed version to override to.** On SDK 54,
every one of the frontend's `npm audit` findings (29, as of 2026-10) traces to
`braces` ≤3.0.3 (micromatch, in Metro's and Jest's file watchers and in
patch-package), `node-forge` ≤1.4.0 (Expo's code-signing certificates, for signed
updates this app does not use) or `sprintf-js` ≤1.1.3 (an old argparse under
Jest's coverage tooling). Each is already the latest release of its package, all
three are developer tooling, and none is in the app bundle. `npm audit`'s remedy
for them is `expo@44` or `react-native@0.86` — see above. Re-check when a fixed
version is published; that is when an override becomes possible.

**There is no `react-native` override any more.** On SDK 51,
`@react-native/virtualized-lists`' `peer react-native: "*"` made npm install a
**second, complete React Native** (0.86.3, nested under `node_modules/react-native`),
and an override pinned it out. React Native 0.81 dedupes to one copy. If
`npm ls react-native` ever shows two again, an override is the fix — and **`npm
install` alone will not apply it**: npm honours an existing lockfile entry over an
override, so the stale entries have to be deleted from `package-lock.json` first.
The same is true of any major upgrade: the React Navigation 6 entries had to be
removed by hand before 7 would install.

**After changing either `overrides` block, prove the toolchain still works** —
neither `tsc` nor the parity gates can see any of this:

- `cd frontend && npx expo config --type public` exercises the config plugins,
  which is where `@expo/plist` and the `xcode` → `uuid` path live.
- `cd frontend && npx expo export --platform android --output-dir <tmp>` builds a
  real production bundle through Metro, and is the only check that covers the
  asset pipeline, `postcss`, and anything that ships in the app. Point it at a
  temp directory so it leaves nothing in the repo.
- `cd frontend && npm run lint:patched-deps` covers the `image-size` patch.
- `cd backend && npm test` covers `qs`, and `xlsx` through both the ingestion and
  export paths.

None of these starts a dev server, so all of them are safe to run (see *Running
the app*).

**`xlsx` is installed from a URL, not from npm, and that is deliberate.**
`backend/package.json` reads
`"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`. SheetJS
**withdrew the package from the npm registry**, so the `xlsx` name there is frozen
at 0.18.5 with a prototype-pollution and a ReDoS advisory against it and npm
reports "No fix available" — there is no fixed version on the registry to point
at. The vendor's own CDN is the upstream remedy. This one had to be fixed rather
than documented, because unlike everything else in either audit it is **reachable
from a request**: `ingestion.service.js` calls `XLSX.read` on an uploaded
spreadsheet. The API surface this project uses is six calls (`read`, `write`,
`utils.book_new` / `aoa_to_sheet` / `book_append_sheet` / `sheet_to_json`) and all
six are unchanged in 0.20.x. `package-lock.json` records the URL **with a sha512
integrity hash**, so `npm ci` verifies it exactly as it would a registry tarball —
but CI does need to reach `cdn.sheetjs.com`, which is the trade. Note 0.20's
`exports` map does not expose `./package.json`, so `require('xlsx/package.json')`
throws; read `XLSX.version` instead.

**Re-check the whole list when the Expo SDK is upgraded.** An override that has
become unnecessary is a version pin nobody asked for. The SDK 54 upgrade retired
seven: `tar` with its patch, `react-native`, and `ajv`, `send`, `@xmldom/xmldom`,
`fast-xml-parser` and `decode-uri-component`, which nothing in the new tree asks
for at a vulnerable version. When `@expo/metro` moves past metro 0.83.3, delete
the `image-size` override, its patch, `lint:patched-deps` and its CI step — and
`patch-package` itself, if nothing else is patched by then.

## Environment

**`backend/src/config/env.js` runs before the server listens and refuses to
start on a bad one.** `DATABASE_URL` and `JWT_SECRET` must exist everywhere; in
**production only**, `JWT_SECRET` must also not be a known placeholder and must
be at least 32 characters. The strength rules stop at production on purpose —
CI signs with `ci-test-secret` and every checkout's `.env.test` has its own short
value, and a guard that broke both on the day it landed is one that gets deleted
rather than satisfied. A token is valid for seven days and carries nothing but
`sub`, so a leaked or guessable secret is a way to *be* any user in any business;
rotating it signs everyone out, which is the intended cure.

`CORS_ORIGINS` is a comma-separated allow-list. **Unset means any origin**, which
is what `npm run web` needs and what this has always done — the native app sends
no `Origin` header and is not subject to CORS at all, so tightening it by default
would break the browser preview and protect nobody. Set it in production if the
web build is served.

**`LEGAL_NAME`, `LEGAL_ADDRESS` and `SUPPORT_EMAIL` name the company on the public
`/privacy` and `/delete-account` pages**, and are deliberately configuration, not
code: the company is not registered yet, and when it is, setting them and
restarting is the whole change. Until all three are set the pages say the
operator's details are being finalised — never a blank where a name should be —
and a production server warns at every start. It does not refuse to start; the
API has to run before the company exists.

**`SMTP_URL`, `MAIL_FROM` and `PUBLIC_WEB_URL` are the only outbound email there
is**, and they are optional on the same contract as `FIREBASE_SERVICE_ACCOUNT`: a
server without them starts and serves. One thing is sent — a password-reset link
— and unset, `mail/send.js` **writes that link to the log instead**, so the whole
flow is testable before any mail account exists. A production server warns at
every start, because a reset flow that silently does nothing is worse than none.
Plain SMTP on purpose, so the provider is a matter of configuration. Without
`PUBLIC_WEB_URL` the link has no host and cannot be opened.

**`NODE_ENV=production` is not decoration — it switches behaviour.** It is what
turns on the strict secret rules above and what turns the access log from
`morgan('dev')` into one JSON object per line. A deployment that forgets it
starts with weak-secret checking disabled and emits ANSI-coloured text that no
log collector can parse. The Docker image sets it; a host that runs `npm start`
directly has to.

**Every response carries `X-Request-Id`, and every log line carries the same
id** (`middleware/requestLog.js`, `config/logger.js`). An unhandled 500 is
logged as `unhandled_error` with that id and the stack, so "it broke around
four" becomes one grep rather than a guess — the access line and the error line
join up. An id supplied by a proxy or the app is reused so an upstream trace
carries through, but it is pattern-checked first and replaced if it is not
plainly an id: the value is written verbatim into the log, so a newline in it
would forge entries in a record somebody later reads as evidence. Logging is
**silent under `NODE_ENV=test`** for the reason `errorHandler` already was —
several hundred request lines bury the one assertion that failed.

`frontend/.env` sets `EXPO_PUBLIC_API_URL`. A physical device needs one of two
setups, and `localhost` on its own means the phone itself:

- **USB** — `adb reverse tcp:4000 tcp:4000` tunnels the API over the cable, the
  same mechanism Expo already uses for Metro on 8081, and `localhost:4000` then
  does reach this machine. Works on mobile data and needs no firewall rule.
  `frontend/scripts/adb-reverse.js` runs from `prestart`/`preandroid` so it is
  re-established whenever Metro starts. **Expo re-creates its own 8081 forward
  but not this one**, so after a mid-session replug or an adb restart the app
  still loads while every request fails with `errors.unreachable` — rerun
  `npm run adb:reverse` (or the raw `adb reverse`) rather than restarting Metro.
- **Wireless adb** — `adb pair` / `adb connect` over Wi-Fi. **`adb reverse`
  works over a TCP adb connection exactly as it does over USB**, so this keeps
  `localhost:4000/api` working with no LAN IP and no firewall rule: it is the
  USB setup above with the cable removed, not the Wi-Fi one below. Worth
  preferring for that reason alone. The forward is per device and has to be
  re-established after every reconnect, which `npm run adb:reverse` does.
- **Wi-Fi, without adb** — the development machine's LAN IP, with the phone on
  the same network and Windows Firewall allowing inbound connections for the
  exact `node.exe` binary running the backend (a rule for a different
  `node.exe` on disk, e.g. an nvm copy, does not apply to it).

When neither holds, every request fails before reaching the server and the app
surfaces `errors.unreachable` rather than any auth error — check connectivity
before suspecting credentials.

Read these values only as `process.env.EXPO_PUBLIC_X` member expressions. Expo's
Babel transform matches that exact shape, and **anything wrapped around
`process.env` defeats it** — destructuring (`const { EXPO_PUBLIC_X } = process.env`)
and a type assertion (`(process.env as { EXPO_PUBLIC_X?: string }).EXPO_PUBLIC_X`)
both compile and type-check cleanly, then yield `undefined` at runtime and fall
back silently. The cast form sat in `api/client.ts` for months undetected,
because its fallback *was* the dev URL: over `adb reverse` a broken inline is
indistinguishable from a working one, and only a release APK pointed at the
hosted API exposed it — as "cannot reach the KitnaPay server at
http://localhost:4000/api" on a server that was up. No cast is needed anyway,
since `@types/node` types `process.env` as a string dictionary.

## Deploying

`Docs/DEPLOYMENT.md` is the procedure. Four things about it are invariants
rather than steps, and each one breaks quietly:

- **`prisma` is a regular dependency, not a dev one**, and moving it back
  breaks the image rather than the tests. The container applies its own
  migrations (`npm run start:prod`), so `prisma migrate deploy` has to survive
  `npm ci --omit=dev`. There is a `//prisma-is-a-dependency` note beside it in
  `backend/package.json`.
- **`migrate deploy` in production, never `migrate dev`.** The development
  command can generate a migration from a drifted schema and will offer to
  reset. `npm run migrate:deploy` exists so the production path cannot reach it
  by accident. On a host with a release phase, run it *there* — `Procfile`
  does — so a failed migration stops the deploy instead of leaving a
  half-migrated database serving requests, and two instances starting together
  cannot both try.
- **`.dockerignore` is a security file, not a size optimisation.** `.env` holds
  `JWT_SECRET` and the database password, and `firebase-service-account.json`
  can push to every user. A secret copied into a layer stays in the image's
  history whatever a later step deletes it with.
- **`npm ci` needs `cdn.sheetjs.com` as well as the registry**, because `xlsx`
  is installed from the vendor's CDN (see *Dependency overrides*). A build
  network that allow-lists the registry alone fails at install, which looks
  nothing like its cause.

**The frontend is not deployed, it is built** — and `EXPO_PUBLIC_API_URL` is
inlined at build time, so a release APK calls whatever was in `frontend/.env`
when the bundle was made. There is no run-time configuration to correct it
afterwards.

**The web app is a static site, built the same way** — `render.yaml` describes it
for Render. Four things about it are invariants: the build checks out the whole
repository (it compiles `frontend/src`'s shared files), every address is rewritten
to `index.html` (the pages are drawn in the browser), **`/sw.js` is served with
`Cache-Control: no-cache`** (it is how an open counter learns of a new build; kept
for a year, it would pin every shop to today's), and once it is served the API's
`CORS_ORIGINS` must name its origin. `Docs/DEPLOYMENT.md` *The web app* has the
steps, and `VITE_SERVICE_WORKER=off` is the way back if a worker ever misbehaves.
