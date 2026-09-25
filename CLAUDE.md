# CLAUDE.md

---

## What this project is

**BizIQ** is a multi-tenant AI business intelligence platform for restaurant,
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

The product is **BizIQ**; the Android package is `com.biziq.app`. It was renamed
from an earlier name, "BuisnessOps". That old name deliberately survives where
changing it would be disruptive — the repository folder, the Postgres database
name `buisnessops`, and git history. Those are not typos to fix.

## Layout

| Path | Contents |
| --- | --- |
| `backend/` | Express API in **JavaScript** (not TypeScript), Prisma + PostgreSQL |
| `frontend/` | Expo / React Native app in TypeScript |
| `Docs/` | Project documents — see *Project documents* above |
| `postman/` | API collection covering auth and data ingestion |
| `.github/workflows/ci.yml` | Backend tests, migration check, frontend type-check |

## Commands

Backend (from `backend/`, serves on port 4000):

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the API with nodemon |
| `npm test` | Jest test suite |
| `npm run prisma:migrate` | Create/apply a dev migration |
| `npm run prisma:studio` | Browse the database |

Frontend (from `frontend/`):

| Command | Purpose |
| --- | --- |
| `npm run lint` | Type-check (`tsc --noEmit`) — the type gate, despite the name |
| `npm start` | Metro for an existing dev build |
| `npm run android` | Build the native app and install it on a connected device |
| `npm run web` | Browser preview, useful for quick UI checks |

## Running the app

Vatsal runs both dev servers himself, in his own terminal — backend's `npm run
dev` and frontend's `npm run android` / Metro. **Never start or restart either
one.** If a task mechanically requires a currently-running one to stop first
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

## Roles and permissions

There are seven roles — `OWNER`, `ADMIN`, `MANAGER`, `STAFF`, `WAREHOUSE`,
`CASHIER`, `DELIVERY_AGENT` — but **never check a role name.** Ask for a
capability:

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
  function over a column cannot use the index behind it.
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
(`authStore`, `branchStore`, `salesStore`), and the hook over it keeps the shape
its call sites already use. This is not a preference — it is a bug that shipped:
`useBranches` held its own `useState`, so each of its twelve callers had a
private copy fetched once on mount, and because tab screens never unmount, Home's
branch card kept showing a stale list until the app was killed and reopened.

- **Every store records which business its data belongs to** (`loadedFor`), and
  the hook's selector checks it. Without that, switching business flashes the
  previous tenant's rows for a frame.
- **Whatever mutates the data refreshes it** — `refreshBranches()`,
  `refreshSalesSummary()` — before navigating away, because the mutating screen
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
  `PressableScale`, `BrandMark`, `AnimatedSplash`, `ScreenBackground`). Reuse these
  before writing a new variant.
- Brand artwork in `frontend/assets/` is generated from vector geometry rather
  than hand-drawn. `BrandMark.tsx` deliberately mirrors the icon's proportions —
  change both together or the in-app logo and the launcher icon will drift apart.

## Translations

The app ships in English, Hindi, Gujarati and Marathi. **Never hardcode a
user-facing string** — render it with `t('section.key')` from
`useTranslation()`.

- Strings live in `src/i18n/locales/{en,hi,gu,mr}.json`. `en.json` is the source of
  truth: `src/i18n/i18next.d.ts` types `t()` against it, so a key missing from
  `en.json` is a compile error rather than text that renders as the raw key.
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

## Native Android builds

The app ships as a **development build** (`expo-dev-client`), not Expo Go.

- `android/` and `ios/` are generated by `expo prebuild` and are gitignored.
  **Never hand-edit files inside them** — edits are silently discarded on the next
  prebuild. Express native changes as Expo config plugins in `app.json`; see
  `frontend/plugins/withAndroid12SplashScreen.js` for the pattern.
- React Native 0.74's Gradle cannot run on JDK 24/25. JDK 17 is pinned per-project
  via `org.gradle.java.home` in `android/gradle.properties`, so the machine's global
  `JAVA_HOME` can stay on a newer JDK for other work. Do not change the global one.
- `expo prebuild --clean` deletes machine-local files that must then be restored:
  `android/local.properties`, the JDK pin in `android/gradle.properties`,
  `android/.idea/gradle.xml`, and `android/.gradle/config.properties`. Plain
  `expo prebuild` preserves them, so prefer it unless a full reset is required.
- On Android 12+ the OS draws its own splash before app code runs. It needs
  `windowSplashScreenBackground`, which Expo SDK 51 does not emit — the config
  plugin above supplies it. Without it the launch starts on a black screen.

## Environment

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
- **Wi-Fi** — the development machine's LAN IP, with the phone on the same
  network and Windows Firewall allowing inbound connections for the exact
  `node.exe` binary running the backend (a rule for a different `node.exe` on
  disk, e.g. an nvm copy, does not apply to it).

When neither holds, every request fails before reaching the server and the app
surfaces `errors.unreachable` rather than any auth error — check connectivity
before suspecting credentials.

Read these values only as `process.env.EXPO_PUBLIC_X` member expressions. Expo's
Babel transform matches that exact shape; destructuring
(`const { EXPO_PUBLIC_X } = process.env`) compiles and type-checks cleanly but
yields `undefined` at runtime, producing a silent fallback that is hard to trace.
