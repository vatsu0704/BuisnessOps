# KitnaPay — web app

The browser version of KitnaPay: React 19, TypeScript, Vite, React Router.
It talks to the same API as the mobile app (`../backend`) and is being brought
to parity with it screen by screen — `Docs/PROJECT_FLOW.md` section 15 tracks
which screens are on the web so far.

## Running it

```bash
cd web
npm install
cp .env.example .env      # VITE_API_URL — defaults to http://localhost:4000/api
npm run dev               # http://localhost:5173
```

The backend has to be running for anything past the sign-in page. Its CORS
allow-list (`CORS_ORIGINS`) is open when unset, which is what development needs;
set it in production to wherever this app is served.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with hot reload on port 5173 |
| `npm run build` | Type-check, then a production build into `dist/` |
| `npm run preview` | Serve the `dist/` build locally |
| `npm run lint` | Type-check (`tsc -b`) — the type gate |
| `npm run lint:i18n` | The web's own strings exist in all four languages, and no translation it reads uses a tag `<Trans>` would empty |
| `npm run lint:shared` | Every file reached in `frontend/src` imports only relative paths and the four pinned packages |
| `npm test` | Vitest + Testing Library on jsdom |
| `npm run shots [-- <filter>] [--widths=320,1440] [--langs=en,gu]` | Build, serve the build, and screenshot every scenario against a pretend API into `shots/`; fails on sideways scroll or a page error. One page that will not load or settle is reported by name and the run carries on — a laptop suspending part way through used to throw away all 194 scenarios |

`VITE_API_URL` is inlined at build time, exactly like the app's
`EXPO_PUBLIC_API_URL`: a build calls whatever was in `.env` when it was made.

## What it shares with the mobile app

The web app does **not** copy the mobile app's code. `@shared/` resolves to
`../frontend/src`, and these are read from there:

| Shared | Why it must be one copy |
| --- | --- |
| `i18n/locales/{en,hi,gu,mr}.json` | Every sentence, including every API error code's wording |
| `permissions/index.ts`, `matrix.json`, `explain.ts`, `staffBase.ts` | The capability matrix (a mirror of the backend's) and R19's "Only Warehouse can …" sentences |
| `navigation/routeCapabilities.ts` | What opening each screen needs — the web's pages open on the same rule |
| `types/*.ts` (all but `notification.ts`) | The API's shapes |
| `constants/brand.ts`, `brandMark.json`, `salesTemplate.ts`, `plans.ts` | The name, the logo, the sales-upload template, how a plan is described |
| `constants/quickActions.ts` | Home's tiles and who sees each — a test proves every tile a role sees opens for it |
| `utils/format.ts`, `validation.ts`, `date.ts`, `upiUri.ts`, `expenseCategory.ts`, `hooks/useMonthCursor.ts` | Amounts in Indian grouping, dates through the translation files, UPI links |
| `utils/costMetrics.ts`, `dailyReport.ts` | A report card's kinds of cost, and Reports' Per day arithmetic |
| `utils/counterQueue.ts`, `counterReceipt.ts`, `receipt.ts`, `escpos.ts`, `counterSyncRunner.ts` | The counter's pure half: the cart, tokens, the sync queue, the printed slip, when and how it sends |
| `utils/teamRules.ts`, `account.ts` | Who may be invited and to what, requirement 18's cashier rules and 409s, who may remove whom; a deleted account |
| `utils/supplyActions.ts`, `supplyStatus.ts`, `supplyGroups.ts`, `whatsappNumber.ts` | Which steps a supply order offers whom, how its status and payment read, how a cart splits by supplier and the catalog groups, a vendor's WhatsApp link |
| `utils/supplyPayments.ts` | What is owed grouped by payee, the one-payee-per-payment selection, the month's payment totals |
| `utils/optionSearch.ts`, `types/picker.ts` | When a list becomes a dropdown (`SEARCH_FROM = 7`) and how typing ranks it — so the same keystrokes offer the same branch first on a phone and on a desktop |
| `constants/regions.ts` | Countries, currencies and timezones, bundled rather than read from the platform because Hermes has no `Intl.supportedValuesOf` |
| `utils/teamFilter.ts` | Finding one person in a team, and who reaches a branch — including the roles that reach every branch without holding a single grant |

**A shared file imports only relative paths and `i18next`, `react`, `react-dom`
or `react-i18next`.** It is compiled by the web's toolchain, where `@/` means
`web/src` and there is no React Native. And a bare import from `frontend/src`
would otherwise resolve to `frontend/node_modules` — a second copy of the package,
or in CI none — so `vite.config.ts` dedupes those four and `tsconfig.app.json`
maps them to `web/node_modules`. `npm run lint:shared` names any import that
breaks this.

The strings only the web needs (its sidebar, its notice pages) live in
`src/i18n/locales/` and are merged under `web.*`. Only English ships in the main
bundle; Hindi, Gujarati and Marathi are fetched when chosen.

## Layout

```
web/
├── index.html
├── public/                 favicon (the app's own, from frontend/assets)
├── scripts/                check-i18n-parity.js, check-shared-imports.js,
│                           shots/ (the screenshot harness: run, scenarios, pretend API)
├── sw/                     service-worker.js — the build writes dist/sw.js from it, with
│                           every file of that build, so the counter opens offline
└── src/
    ├── api/                axios client, error translation, one file per resource
    ├── components/         BusinessFields, ExportActions (requirement 17's card), LanguageMenu, …
    │   ├── brand/          BrandMark, Wordmark
    │   ├── branches/       BranchPicker; the two branch forms' shared fields — kind and
    │   │                   payment model, the geofence card and its rules (geofence.ts)
    │   ├── counter/        the counter's menu, bill panel, charge and bill dialogs, sync
    │   │                   pill and the bills the server refused
    │   ├── expense/        CategoryPicker, Breakdown
    │   ├── home/           Home's sections
    │   ├── payments/       QrCode, UpiPayCard, UpiAccountEditor, PaymentHistory
    │   ├── products/       ProductRow, and the catalog rules (grouping, search, a branch's price)
    │   ├── reports/        Reports' cards, the month strip and bars, the branch × month table,
    │   │                   Per day, and the ranking rules
    │   ├── supply/         SupplyOrderList (the branch's orders, the desk, deliveries), the
    │   │                   status pills, the timeline, the delivery address, AgentPicker
    │   ├── upload/         TemplateGuide, and what an import's answer means
    │   ├── layout/         AppShell, Sidebar, TopBar, UserMenu, AuthHeader, ScreenBackground
    │   └── ui/             FormInput, FormTextArea, DateField, SearchField, FileDrop,
    │                       PrimaryButton, Button, ButtonLink, Dialog, ConfirmHost, PageHeader,
    │                       OptionRow, ChipGroup, CheckChips, ChoiceTile, Pill, InfoCard, StatTile,
    │                       MonthCursor, …
    ├── constants/          navigation (every sidebar entry and who sees it), brand
    ├── hooks/              useBranches, useToday, useTeam, useMyStaffMember, useVendors,
    │                       useSupplyPayments, useMembership,
    │                       useRefreshOnFocus, useCounterSync
    │                       (sends the counter's bills while anyone who bills is signed in),
    │                       useGoBack (back to whichever page opened a form), …
    ├── i18n/               i18next setup, the web-only locale files
    ├── pages/              one per ported screen (Settings, Notifications, AddBranch, …),
    │                       plus NoticePage (not part of this role, not an address)
    ├── permissions/        re-exports the shared matrix
    ├── routes/             paths (every route and who may open it), pages (what each shows),
    │                       AppRoutes, guards (RequireAuth, GuestOnly, RequireAccess)
    ├── store/              zustand: authStore (with the offline session copy), branchStore,
    │                       todayStore, notificationStore, analyticsStore (keyed on the business
    │                       and the month window), counterStore (over IndexedDB), printerStore,
    │                       teamStore, myStaffStore ("am I on the staff here?")
    ├── styles/             tokens.css (the app's theme as CSS variables), global.css
    ├── theme/              motion values JavaScript needs
    ├── types/              the app's own, re-exported; webSerial.d.ts for the printer
    └── utils/              counterPersistence (IndexedDB), counterSync, printer (Web Serial),
                            receiptHtml (the print-dialog slip), serviceWorker, punch (with the
                            browser's location), …
```

## Conventions

They are the mobile app's, from `CLAUDE.md`, applied to the web:

- **A page opens on the app's rule for the same screen.** Every route in
  `routes/paths.ts` names the app route it stands for (or, for a tab, the
  capability); `routes/pages.ts` is a `Record` over every route, so a new route
  fails `tsc` until it has a page. A new app screen = its route in `paths.ts` and
  its page in `pages.ts`.
- **Anything irreversible asks first** through `confirm()` in `utils/confirm.ts` —
  the app's API, rendered once by `ConfirmHost` on a `<dialog>`. Only the
  destructive direction asks.
- **Files go through `apiClient`** (`utils/downloadApiFile.ts`), never a bare link,
  so a refusal is reported rather than saved as a `.xlsx`. Server-rendered HTML
  prints through `utils/printHtml.ts`.

- **Never check a role name** — gate on a capability, narrowed with
  `hideWhen: { holds, unless }` where holding it does not make it the person's job
  (`utils/permissions.ts`). The sidebar, Home and the route guards all use it.
- **Never hardcode a user-facing string.** Shared wording via `t('section.key')`,
  web-only wording via `t('web.section.key')`, added in all four web locale files.
- **Shared server data lives in a zustand store** that records which business it
  belongs to (`loadedFor`), dedupes in-flight requests and keeps its data when a
  refresh fails. A page refetches on mount and when the browser tab comes back
  into view (`useRefreshOnFocus`).
- **A date is `DateField` (in a form) or `DayCursor` (a strip), never
  `<input type="date">`.** Both open `ui/DatePicker` over `ui/Calendar`, because
  the native input brings the *browser's* calendar: unstyleable, different in
  every browser, and drawn in the browser's language rather than the one chosen
  in Settings. Don't add a date-picker package either — they name months from
  `date-fns` or `Intl`, which would be a second source of month names beside the
  locale files the app reads.
- **Styles use the tokens** in `styles/tokens.css`, which repeat
  `frontend/src/theme/index.ts` value for value. Change both together.
- **A layout must survive Gujarati at 320px.** Prefer grids that wrap
  (`repeat(auto-fill, minmax(…))`) or a container query over fixed rows, and add
  the page to `scripts/shots/scenarios.mjs` so `npm run shots` checks it at 320,
  390, 820 and 1440 wide before it is called done.
- **A `<Trans>` tag must not be named after a void HTML element** (`link`, `br`,
  `img`, `input`, …). react-i18next parses its markup as HTML and empties it.
