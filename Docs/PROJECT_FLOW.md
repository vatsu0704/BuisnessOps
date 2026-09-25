# Project Flow — BizIQ

This document translates the product requirements (PRD) into a buildable engineering sequence for this repo: **React Native/Expo (TypeScript) frontend + Node.js/Express backend + PostgreSQL via Prisma**. It exists so that at any point in the build, anyone can answer "what phase are we in, what does it depend on, and how do we know it's done."

The product is named **BizIQ** (Android package `com.biziq.app`), renamed from the earlier "BuisnessOps". The old name deliberately survives where changing it would be disruptive — the repository folder and the Postgres database name `buisnessops` — and those are not typos to fix.

**Where the repo actually is:** Phases 0 and 1 (CSV path) are done. The app ships as an Expo **development build** rather than Expo Go, with its own icon, animated splash and a four-tab shell (Home, Staff, Reports, Settings). Phase 3's UI i18n is done ahead of order; the rest of Phase 3 and all of Phase 2 are not started. An **Attendance & Salary Slip module** was also added outside the phase sequence, on request — backend and frontend both done (see 4a below).

**A second track is now running alongside this one.** *Branch Operations*
(Section 13, driven by [REQUIREMENTS.md](REQUIREMENTS.md)) turns BizIQ from a
product that analyses a business into one that runs it — counter billing,
supply orders, expenses, net profit. Task 1 of that track has landed and it
amends Phase 0: see the note under the Phase 0 exit criterion.

---

## 1. Guiding Architecture Principles

These decisions shape every phase and shouldn't be revisited per-feature:

1. **Tenant-first schema.** Every table that holds business data carries a `businessId`. A `Business` (tenant) has many `Branch`es. No cross-tenant query is ever possible by construction, not just by convention — enforce it in one data-access layer, not scattered per-controller.
2. **Metrics catalog, not free-text SQL generation.** The LLM never writes ad-hoc SQL against raw tables. Instead, we define a fixed set of parameterized queries ("metrics": `sales_by_period`, `sales_by_branch`, `top_products`, `wastage_rate`, …). The NL layer's job is to map a question to `{metric, params}`, execute the deterministic query, and only then use the LLM to phrase the *already-computed* numbers as an answer. This is what makes every answer traceable and non-hallucinated (see NFR: Answer Accuracy & Traceability) — the LLM narrates, it never computes.
3. **Language is a presentation concern, not a data concern.** Query understanding and the metrics catalog operate on a language-agnostic intent schema. Only two edges touch language: NL input parsing (in en/hi/gu) and answer phrasing (in en/hi/gu). This is what lets Section 10 of the PRD ("add languages later without redesign") actually hold.
4. **Ingestion is adapter-based.** Every POS/data source (including manual CSV upload) implements the same `DataSourceAdapter` interface and writes into the same normalized schema (`Transaction`, `LineItem`, `Product`, `InventoryUsage`, `Shift`). New POS support is a new adapter, never a schema change.
5. **Alerts and forecasts are background jobs, not request-time work.** Anomaly detection, benchmarking, and forecasting run on a schedule (queue/cron) and write `Alert`/`Insight` rows. The query engine and the alerts feed both read from the same underlying metrics, so "what needs my attention" and "what were October sales" are the same kind of query.

---

## 2. Phase Map

| Phase | Focus | Maps to PRD | Status |
|---|---|---|---|
| 0 | Foundations: multi-tenant data model, auth, RBAC | prerequisite to Phase 1 | ✅ done |
| 1 | Data ingestion: unified schema, CSV/Excel upload, first POS adapter | FR-04, FR-05 | ✅ CSV path done; live POS adapter deferred |
| 2 | Core query engine: metrics catalog + NL → answer pipeline (English first) | FR-01, FR-06 | ⛔ blocked on an LLM provider |
| 3 | Multi-language + voice | FR-02, FR-03 | 🟡 UI **and API message** i18n done (en/hi/gu/mr); voice and query-language work outstanding |
| 4 | Reporting & cross-branch comparison | FR-06, FR-07 | ⏳ not started (tab exists, shows a planned notice) |
| 5 | Proactive intelligence: alerts, benchmarking, wastage, cash-mix, seasonal correlation | FR-08–FR-12 | ⏳ not started (tab exists, shows a planned notice) |
| 6 | Strategic & franchise: staff analytics, royalty automation, expansion what-if, forecasting | FR-13–FR-16 | ⏳ not started |
| 7 | Hardening: security, compliance, performance, billing | NFRs (Section 7) | ⏳ not started |

Phase 3's UI half landed out of order, ahead of Phase 2 — that was a deliberate request, not a plan change. The phase ordering below still stands.

Phases 0–4 are the MVP (PRD Phase 1). Phase 5 is PRD Phase 2. Phase 6 is PRD Phase 3. Phase 7 runs partly in parallel with 4–6 but gates any real launch.

---

## 3. Phase 0 — Foundations

**Objective:** a secure, multi-tenant skeleton that every later feature builds on.

**Deliverables**
- Prisma schema: `Business`, `Branch`, `Membership` (user ↔ business ↔ branch ↔ role), replacing the standalone `User` model's implicit single-tenant assumption.
- Roles per Section 8 of the PRD: `OWNER`, `MANAGER` (branch-scoped), `STAFF` (alerts-only), `ADMIN` (config-only). **Superseded by Section 13** — there are now seven roles, and what each may do lives in a capability matrix rather than in role-name checks at each route.
- Auth: JWT-based login/session (already have `jsonwebtoken` installed), password hashing, business signup flow that creates the first `Business` + `OWNER` membership.
- Middleware: tenant-resolution (derive `businessId` from the authenticated session, never from client input) + role guard.
- Environment/config split for dev/staging/prod; CI running `npm test` + Prisma migration check on both backend and frontend.

**Exit criteria:** a branch-scoped account cannot read another branch's data even if it guesses an ID — verified by a test, not just by inspection.

> **Amended 2026-09-23.** This criterion used to name the *manager* as the
> branch-scoped role, and `tests/tenant-isolation.test.js` demonstrated it with
> one. Requirement 14 of the Branch Operations track (Section 13) makes MANAGER
> admin-equivalent and business-wide, so the role no longer carries the
> property. **The property itself is unchanged and still enforced** — it is now
> demonstrated with a `CASHIER`, and the same test file additionally asserts the
> manager's new reach, so the widening is a decision on record rather than an
> absence of coverage.
>
> A `MANAGER`'s `BranchAccess` rows still exist and can still be removed; they
> simply no longer bound what that person can reach. The invite screen therefore
> stops asking for branches when the role is MANAGER.

---

## 4. Phase 1 — Data Ingestion

**Objective:** get real business data into the unified schema, from at least one real source plus manual upload, so there's something to query in Phase 2.

**Status: CSV/Excel path done and verified. Live POS adapter deferred — see decision below.**

**Deliverables**
- ✅ Normalized schema: `Product`, `Transaction`, `LineItem`, `InventoryUsage`, `Shift`, each carrying `businessId` + `branchId`.
- ✅ CSV/Excel upload adapter (works for any business on day one — this unblocks onboarding per FR-05, regardless of POS vendor). One library (`xlsx`) reads both formats; rows group into transactions by an external id; bad rows are reported per-row without failing the whole file.
- ⏸️ One live POS API adapter as the reference implementation — **investigated and deferred.** Petpooja (India's dominant restaurant POS, the natural first pick given this PRD's market) was researched directly: its public, documented API (`onlineorderingapisv210.docs.apiary.io`) is an *order-injection* API built for aggregators like Zomato/Swiggy to push orders **into** Petpooja — there is no documented endpoint to pull sales/transactions **out**. Their reporting/export feature is a manual one-click dashboard export, not a programmatic API. True live sync would require Petpooja granting enterprise reporting-API access through their partnerships team — a business-development step, not an engineering one, and not something to build against speculatively. Decision: Petpooja (and by extension most Indian restaurant POS systems in the same position) goes through the CSV path already built — a merchant exports from their POS dashboard and uploads it. Revisit a live adapter only once a specific vendor's real, pull-capable API is confirmed (either a different vendor, or Petpooja after a partner conversation).
- `DataSourceAdapter` interface (`pullSales()`, `pullInventory()`, `pullShifts()`) — not built; deferred along with the live adapter, since there's only one adapter (CSV) to abstract over so far.
- Ingestion job runner (queue or scheduled task) for *live* sources — not applicable yet (CSV upload is inherently on-demand, not scheduled); revisit once a live adapter exists. A sync-status view (`SyncRun` history, `DataSourceConnection.lastSyncedAt`) is already in place and works for the CSV path today.

**Exit criteria:** ~~uploading a CSV or connecting the reference POS~~ uploading a CSV populates `Transaction`/`LineItem` rows queryable per branch and per date range. **Met** (verified via automated tests and a live end-to-end run).

---

## 4a. Attendance, Payroll & Salary Slips (ad hoc)

Not part of the original PRD phase sequence — added on request, from a separate reference requirements doc. **Backend and frontend both done.**

Rebuilt in a second pass (2026-09-20) after a Saral HRM quote (₹46,020/yr for 50 employees) and an eSSL biometric-device quote (₹80,500) raised the question of whether BizIQ should do this job itself. That pass fixed three defects that made the first version unfit for a real business, and moved the feature out of Settings into the places it is actually used.

**The three defects the second pass fixed:**

1. **Pay was divided by calendar days.** `(baseSalary / daysInMonth) * daysWorked` meant someone with Sundays off could never reach their full salary — about 87% of it — and an unmarked day silently paid ₹0. Replaced by a real work calendar (below).
2. **The payslip could not render `₹` or any Indian language.** `pdfmake` was configured with base-14 Helvetica, which is WinAnsi-only, and embedded no font — in an app that ships in English, Hindi, Gujarati and Marathi. Replaced by an HTML document the device prints (below).
3. **"Today" was the server's UTC date.** For IST every punch before 05:30 local was filed against the previous day. Now computed in the branch's own timezone via `Branch.timezone`.

**The work calendar — how pay is computed now:**

```
workingDays     = calendar days − week-offs − holidays        (per branch, per month)
totalDaysWorked = daysPresent + 0.5 × daysHalfDay             (working days only)
gross           = baseSalary ÷ workingDays × totalDaysWorked   (Decimal, 2dp, half-up)
net             = max(0, gross − deductions)
```

Week-offs and holidays are **paid by construction**: they are in neither the divisor nor the numerator, so missing one costs nothing and someone present on every working day earns exactly their salary. That identity is a test. `Business.weeklyOffDays` defaults to Sunday and a branch may override it whole (an override of `[]` legitimately means a seven-day week); `Holiday` rows are business-wide or branch-specific. `Business.unmarkedWorkingDayStatus` decides what a working day with no record means — `PRESENT` by default, making payroll exception-based, because under `ABSENT` any business that doesn't punch daily would see every salary zeroed.

**Backend:**
- `StaffMember` (Phase 1) extended with `baseSalary`, and in the second pass with `phone`, `employeeCode`, `hiredOn`, `exitedOn`, `deactivatedAt` and `notes`. `hiredOn`/`exitedOn` shrink the *numerator* only, so a mid-month joiner is paid a part month rather than a full one. `Branch` carries an opt-in `geofenceRadiusMeters` alongside `latitude`/`longitude`, plus `weeklyOffOverride`/`weeklyOffDays`. New `Holiday` table. `SalarySlip` now snapshots its own basis (`baseSalary`, `workingDays`) and itemises day buckets, so a later policy change or a raise can never silently restate a payslip someone has already been shown. The dead `Shift` model was dropped — nothing had ever written to it. See `database-table.md` section 4a.
- All payroll arithmetic uses `Prisma.Decimal` (`backend/src/utils/money.js`), never floats. `Number()` is banned inside the calculation.
- Self-service `POST /attendance/punch-in` / `punch-out`, resolved to the caller's own `StaffMember` via their `userId` — never a client-supplied id. Punches are rejected outside a branch's geofence when one is configured (haversine distance, hand-rolled rather than pulling in `geolib` for one formula).
- Manager/owner `POST /staff/:staffMemberId/attendance/mark`, which now rejects future dates, refuses days before the person joined, and clears the punch timestamps when marking someone away (the row used to claim both "absent" and "punched in at 09:02"). Every override records `markedByMembershipId`.
- `GET /branches/:branchId/attendance` is now a real roster: it left-joins all ACTIVE staff, so someone who hasn't punched appears with `attendance: null`. It previously returned only the rows that existed, which made "who hasn't punched in yet?" unanswerable.
- `POST /staff/:staffMemberId/salary-slips/generate`, plus `GET /payroll/preview` and `POST /payroll/run` for a whole month in one call — payroll was one HTTP call per person, unusable at the 50 employees the HRM quote was priced for. Run and preview return the same shape, and skips carry machine codes (`NO_BASE_SALARY` …) the client translates. `POST /salary-slips/:id/finalize` finally gives `SalarySlipStatus` meaning: a finalized slip refuses regeneration with a 409.
- `PATCH /staff/:id`, `POST /staff/:id/deactivate|reactivate`, `GET /staff/me`, `PATCH /branches/:branchId`, and work-week/holiday CRUD. Before this there was **no way to change anything about a staff member after creation**, and branch timezone and geofence were write-once.
- `GET /salary-slips/:id/document?lang=` renders the payslip as styled HTML (`backend/src/documents/`), which the device prints to PDF. The `/pdf` route and `pdfmake` remain for now so a phone running the previous build still works; both go once the app update has rolled out.
- **Security fix:** `GET /staff/:id/attendance` and the branch roster gated on `req.branchAccess` alone, so a STAFF-role member who happened to carry `BranchAccess` rows could read every colleague's attendance. `backend/src/middleware/staffScope.js` now separates "may see this branch's data" from "may see this person's record". The existing tests missed it because their STAFF fixture had no branch access at all.
- Jest coverage in `backend/tests/attendance.test.js` — geofence accept/reject, double-punch guards, RBAC including a regression test for the hole above, the working-days pay maths, roster completeness, finalize immutability, and the HTML document including an escaping test.

**Frontend:** the feature moved out of Settings, where a payslip was four taps deep.
- **Home** carries a `TodayPunchCard` — punch in/out is one tap from opening the app, which is where a daily action belongs. It renders nothing for someone with no `StaffMember` row, and shows a calm week-off state instead of nagging someone on their day off.
- **A `Staff` tab replaces the empty `Alerts` placeholder** (Phase 5, not started; `AlertsScreen` and its translations are kept on disk so Phase 5 reinstates a tab rather than rewriting a screen). `StaffHubScreen` is role-aware: an owner or manager gets today's roster with inline marking, the staff list and payroll; everyone else gets their own attendance and payslips. The backend enforces the same split.
- `StaffDetailScreen` — month summary, attendance, a manager-override "mark a day" using a real date picker (`@react-native-community/datetimepicker`, wrapped in `DateField` with an `<input type="date">` branch so `npm run web` keeps working), payslip generation, and past payslips with a share action. The mark-a-day field was previously free text with no validation, and was decoupled from the month cursor so you could write into a month you weren't looking at; its status also defaulted to `ABSENT`, one tap from Save.
- `EditStaffScreen`, `PayrollRunScreen`, `WorkCalendarScreen` — editing and deactivating a staff member, running a month's payroll, and configuring the weekly off and holidays. Without the last one the working-days model would be invisible and stuck at its default.
- Sharing a payslip fetches HTML and prints it with `expo-print`, then hands the PDF to `expo-sharing`. This also removed a real bug: `FileSystem.downloadAsync` does not reject on an HTTP error status, so a 403 used to write the JSON error body into a `.pdf` and share a corrupt file.
- Supporting cleanups: `utils/permissions.ts` replaces three separately-declared role Sets and finally honours `membership.status`; `utils/date.ts` replaces two copies of a UTC-based `todayISO()`; `useMonthCursor` uses translated month names (Hindi used to render "पेरोल — September 2026") and gained the missing upper clamp; `formatAmount` groups INR the Indian way; and `scripts/check-i18n-parity.js` guards translation parity, which `tsc` cannot catch.

**Branch settings, now built.** `PATCH /branches/:branchId` was written during this rebuild and then called by nothing: the Add Branch form captured no coordinates, and no screen existed to add them afterwards, so **a geofence could only ever be set by hand through the API** and a mistyped timezone was permanent in practice. Both ends are now built — `BranchSettingsScreen` (reached by tapping a branch on Home) edits the timezone, the coordinates and the radius, and the Add Branch form captures all three optionally at creation. Both offer "use my current location" through `expo-location`, which the punch flow already depended on. The translations for that screen had been written at the same time as the endpoint and sat unused in all four locale files until now.

The endpoint also had **no test at all**, which is why `backend/tests/branch-settings.test.js` now covers the rules that are easy to get wrong: a radius is validated against the *merged* result rather than the request body (so setting one on a branch that already has coordinates works), `geofenceRadiusMeters: null` clears the geofence while keeping the coordinates, and the whole endpoint is OWNER/ADMIN-only even for a MANAGER who has access to that branch.

A small side-effect worth knowing: `getCurrentCoords` now lives in `frontend/src/utils/location.ts`. The same best-effort permission-and-fix block had been copied into `TodayPunchCard` and `AttendanceScreen`, and this would have been a third copy. The punch paths treat "no fix" as "carry on without coordinates", because the backend decides whether the geofence needed them; branch settings treats it as a failure worth showing, because the person explicitly asked for it.

**Known gap, now closed:** the app had no business switcher, so anyone genuinely in two businesses saw one arbitrary one. Settings now carries a real switcher (see *Access control* below), and `activeMembership()` resolves the stored choice rather than guessing.

**Deliberately not built:** overtime from punch duration (`punchInAt`/`punchOutAt` are stored but hours still have no effect on pay); leave balances, entitlement and approvals (`LEAVE` remains unpaid and is only a status); statutory deductions — PF, ESI, TDS, PT (`deductions` is still one manually-entered amount with a free-text note); salary advances and loan recovery; salary revision history, so changing someone's pay overwrites and regenerating an *unfinalized* slip for a past month uses the new figure — finalizing is what locks it; a scheduled payroll job (the run is request-time, since there is still no cron/queue); and auto half-day detection from punch duration.

This was also where the app’s one remaining English-only surface was recorded — every validation message and API error reached the UI as hardcoded English. **That is now done**, following the payroll-run reason codes as the pattern; see *Backend i18n* below.

**On the quotes that prompted this:** the module now covers what Saral HRM lists as *Core HR + Payroll + ESS + Leave* minus leave balances, and *Advance Time & Attendance* minus overtime. It does not need the eSSL devices — geofenced punch-in covers the same job from a phone. If those are bought anyway, the integration path is an attendance CSV import reusing the existing `xlsx` ingestion pattern, not a device driver.

---

## 4b. Backend i18n (ad hoc)

Not part of the phase sequence. The app shipped in four languages while **every
message from the API arrived in English** — a Gujarati-speaking owner typing a
wrong password read "Invalid email or password", and a manager punching in
outside the geofence read the distance in English. 180-odd messages across 33
files, each one written as prose at the point it was thrown.

**The backend does not translate, and deliberately so.** It cannot know which
language to use: the choice lives on the device and may differ from the
account's `preferredLocale`. So the wire carries a stable **code** plus the
parameters the sentence needs, and the wording lives in the locale files beside
every other string in the app. This is the payroll-run reason codes
(`NO_BASE_SALARY` …) generalised to the whole API, which is what this document
said to do.

**The contract.** Every error response now looks the same:

```json
{ "code": "PUNCH_OUTSIDE_GEOFENCE", "message": "You are 120m from the branch, outside the allowed 50m radius",
  "params": { "distance": 120, "radius": 50 } }
```

- `code` is the contract. The client renders `t('errors.api.<CODE>')` with `params`.
- `message` is English, rendered by the server from `backend/src/errors/catalog.js`. It is the **fallback**, not the translation — what a client that has never heard of a code shows, and what curl, Postman and the logs show. An app older than the server therefore degrades to correct English rather than to a blank.
- A 400 from a failed validation adds `details`, one `{ code, field, params }` per rejected field, and keeps `errors` as the plain array of English strings it has always been so an older app build renders text rather than `[object Object]`. `errors` is *rendered from* `details`, so the two cannot drift.
- CSV/Excel upload row problems ("Row 7: quantity is empty") travel the same way, as `errorDetails` alongside the existing `errors`.

**What it replaced:** `const err = new Error('...'); err.status = 404; throw err;`, written out 41 times, plus 42 hand-built `res.status(...).json({ message })` responses and 76 validation strings. Those 76 turned out to be about 30 shapes — `{{field}} is required`, `{{field}} must be one of {{options}}` — so the validators now return `{ code, field, params }` and `validations/shared.js` carries the shorthands (`required('name')`). Translating 30 sentences is work someone finishes; translating 76 near-duplicates is work nobody does.

**Two gates, because neither the type system nor the existing one can see this:**

- `frontend/scripts/check-error-parity.js` (`npm run lint:errors`, in CI) reads the backend catalog and fails if a code has no entry in `en.json`, or if a translation uses a placeholder nothing supplies. `tsc` cannot catch it — the key is built at runtime — and `check-i18n-parity.js` cannot either, because a code missing from **all four** locales is perfectly consistent.
- It also reports placeholders the app copy deliberately drops. Three do: a URL path and two lists of database column names, none of which help a shop owner.

**Incidental fixes this made possible:** the payroll run's skip reasons were matched on HTTP status (`err.status === 400` meant "no working days"), which would have mislabelled every other 400 the calculator ever grew; they now match on the code. And an unplanned 500 no longer returns `err.message` to the client — it goes to the server log instead, where stack paths and query internals belong.

**Deliberately left in English:** the payslip document has its own label dictionary (`backend/src/documents/payslip.labels.js`) and is unaffected; CSV column names (`occurred_at`, `unit_price`) stay untranslated inside row messages, because they are the literal headers in the person's own file; and a library's own error text (multer's upload limits) passes through under `REQUEST_FAILED`, which says plainly that this codebase did not author it.

---

## 5. Phase 2 — Core Query Engine (English)

**Objective:** FR-01 end to end, in English only — the product's core loop.

**Deliverables**
- Metrics catalog v1: `sales_by_period`, `sales_by_branch`, `top_bottom_performers`, `period_over_period_comparison` (backing FR-06).
- Intent parser: LLM call that maps a typed question to `{metric, params: {branchIds, dateRange, comparisonTarget}}` against the language-agnostic intent schema, with a fallback "I didn't understand" path rather than a guessed answer.
- Deterministic execution of the resolved metric query against Postgres.
- Answer composer: LLM turns the computed result into a plain-language sentence, with the underlying numbers and the exact query/date-range/branches attached as a visible "source" trace in the UI (NFR: Traceability).
- Mobile chat-style query screen (replaces the placeholder `HomeScreen`) with text input, answer bubble, and a "view source data" expand.
- Target: answer returned within 5s for standard queries (NFR: Performance).

**Exit criteria:** an owner can type "What were October sales vs last year?" and get a correct, source-linked answer, tested against seeded data with a known expected result.

---

## 6. Phase 3 — Multi-language + Voice

**Objective:** FR-02, FR-03 — the same query engine in Hindi and Gujarati, by text and by voice.

**Status: UI i18n done (and extended to Marathi), and every message the API sends is now translated too (see 4b). Everything that depends on the query engine is blocked behind Phase 2; voice is not started.**

**Deliverables**
- ✅ UI i18n: every static string renders through `t()`, with translations in **en / hi / gu / mr**. Strings live in `frontend/src/i18n/locales/*.json`; `en.json` is the source of truth and `t()` is typed against it, so a missing key is a compile error rather than text that renders as the raw key. Language resolution is device choice → account `preferredLocale` → device language → English, persisted locally and to the account via `PATCH /auth/me/locale`.
- ✅ API messages: the backend sends a stable code plus parameters, never prose, and the app renders it from the same locale files. See section 4b for the contract and the two gates that keep it honest.
- ⚠️ "A fourth language is a translation file, not a code change" holds for the **UI** — a JSON file plus one row in `LANGUAGES`. It does **not** hold for account persistence: `preferredLocale` is a Postgres enum, so a new language also needs a schema change, a migration, the backend validation list and the frontend `Locale` union. Marathi needed five files, not two. Budget for that when adding the next language.
- ⏳ Intent parser extended to accept hi/gu input — reuses the same language-agnostic intent schema from Phase 2, so only the parsing prompt/model changes per language. **Blocked on Phase 2.**
- ⏳ Answer composer extended to phrase results in the query's language. **Blocked on Phase 2.**
- ⏳ Voice: STT on-device mic capture → text → existing pipeline → optional TTS response. Ship English voice first, then Hindi/Gujarati once STT/TTS accuracy is validated (PRD Section 12 flags Gujarati as higher-risk — validate with real speakers before enabling voice for it, text-first if needed). **Not started.**
- ⏳ Locale-aware currency/date/number formatting per business's region (NFR: Localization beyond language). **Not started** — Hermes has no dependable `Intl`, so this needs its own approach rather than assuming `Intl.NumberFormat` works on device.

**Translation quality caveat:** the hi/gu/mr files were written without a native-speaker review. Wording corrections from a speaker are expected, not defects — and PRD Section 12 already flags Gujarati as the higher-risk language.

**Exit criteria:** the same benchmark question set from Phase 2's exit criteria passes in all three languages, text and voice, with Gujarati explicitly spot-checked for accuracy before enabling voice input for it.

---

## 7. Phase 4 — Reporting & Cross-Branch Comparison

**Objective:** FR-06/FR-07 fully, and a lightweight visual fallback for users who do want to see a chart.

**Deliverables**
- Metrics catalog v2: arbitrary branch-set comparison, company-average benchmarking, top/bottom N by any available metric.
- Simple dashboard screen (charts, not required to be conversational) for owners who want to browse rather than ask — same metrics catalog underneath, so numbers can never drift between "ask" and "browse" views.
- Branch/area grouping (by city/region) so a franchise owner can compare "all Mumbai branches" without listing them individually.

**Exit criteria:** cross-branch comparison and benchmarking queries return correct results for a multi-branch seeded dataset (10+ branches).

**MVP checkpoint:** Phases 0–4 complete = PRD Phase 1 / MVP done.

---

## 8. Phase 5 — Proactive Intelligence

**Objective:** FR-08–FR-12 — move from "answer when asked" to "tell me before I ask."

**Deliverables**
- Anomaly detection jobs (scheduled): rule-based first pass — sustained sales decline, wastage rate outliers, cash-vs-digital mix deviation from company norm (FR-08, FR-11, FR-12).
- `Alert` model + in-app/push notification delivery, respecting role scope (staff get operational alerts only, per Section 8).
- Root-cause hint generation: when an alert fires, attach the 1–2 most correlated contributing metrics (e.g., cost-per-unit, peak-hour staffing) rather than raw numbers alone (FR-09).
- Weather/seasonal correlation (FR-10): integrate an external weather/events signal, correlate against historical sales, surface as a suggestion ("rain forecast Friday, stock accordingly") — ship as a Could-Have after the rule-based alerts are trustworthy, not before.
- The query engine can now answer "what needs my attention today?" by reading the same `Alert` table the push notifications use.

**Exit criteria:** injecting a synthetic anomaly into seeded data (e.g., one branch's wastage spikes) produces an alert within one scheduled run, with a plausible root-cause hint attached.

---

## 9. Phase 6 — Strategic & Franchise Features

**Objective:** FR-13–FR-16 — network-level decision support for franchisors.

**Deliverables**
- Staff performance analytics: link `Shift` + sales/quality data, surface top performers and shifts needing support (FR-13).
- Franchise royalty engine: configurable royalty % per franchise agreement, computed from verified sales data, exportable reconciliation statement (FR-14) — this is the one feature with real financial/legal weight, so its calculation must be auditable line-by-line against source transactions.
- Expansion what-if: given a candidate location's characteristics, estimate performance by nearest-neighbor comparison against existing branches with similar profiles (FR-15).
- Demand forecasting: short-term forecast per branch combining historical trend + the weather/seasonal signal from Phase 5 (FR-16).

**Exit criteria:** a royalty statement generated by the system matches a manually-calculated statement for the same period, to the cent.

---

## 10. Phase 7 — Hardening, Compliance & Launch Readiness

Runs partly in parallel with Phases 4–6, but nothing ships to real businesses until this is done.

**Deliverables**
- Security: encryption in transit/at rest, dependency audit, auth hardening (rate limiting, refresh-token rotation).
- Multi-tenancy audit: automated test suite that attempts cross-tenant access on every endpoint and asserts denial.
- Performance: load test to the NFR targets (5s standard / 15s complex query, 99.5% uptime) at a representative multi-branch data volume.
- Compliance review per target market (GDPR for EU, DPDP Act for India) before onboarding businesses there — PRD Section 12 flags this as unresolved; resolve it market-by-market, not globally, before the first business in that market goes live.
- Pricing/subscription model validated alongside real users (PRD Section 12) — needed before any paid rollout, not before MVP demos.

**Exit criteria:** cross-tenant test suite passes, load test meets targets, and a compliance sign-off exists for each market being onboarded.

---

## 11. Immediate Next Steps (from current repo state)

Done and verified: Phases 0 and 1's CSV path (schema, migrations, tests, CI, Postman collection); the BizIQ brand (icon, adaptive icon, animated splash); a designed and animated Login/Signup/Home; a four-tab app shell; Phase 3's UI i18n in four languages; the Attendance & Salary Slip module (4a); and Home's stat tiles now reading real sales figures instead of just counting branches.

An onboarding path now exists end to end: register → add a branch → upload sales data → invite the team. Branch creation, CSV/Excel upload, and team invites are all reachable from Home/Settings as modal screens, so nothing requires Postman to use.

**Team & permissions**, reachable from Settings (OWNER/ADMIN only): `GET /memberships` lists the business's team with each person's role and granted branches. The invite screen (`POST /memberships`) now handles both cases in one call — if the email already has a BizIQ account, they join immediately; if not, it creates a `PENDING Invite` (own model, not a `Membership` — see `database-table.md`) that's claimed automatically the moment that email signs up, via a public `GET /invites/lookup` the signup screen checks as you type. An invited signup joins the inviting business with the role/branches already chosen instead of creating a new business of their own, which is also what fixes the multi-membership bug below for this path. For MANAGER/STAFF invites, the screen requires picking at least one branch before it lets you submit, granted immediately (existing account) or stored on the invite (pending, granted at claim time).

**Access control now goes both ways.** Granting was the only direction that existed: an invite could be sent but never withdrawn, and a branch grant never narrowed.

- `DELETE /invites/:inviteId` withdraws a pending invite. The row is kept as `REVOKED` rather than deleted, which also means re-inviting the same address revives it through the existing `(businessId, email)` upsert.
- `POST /memberships/:membershipId/revoke` ends someone's access. Soft, for the audit trail: `Attendance.markedByMembershipId` points at memberships, so a hard delete would erase who marked each day. `resolveTenant` already demanded `ACTIVE`, so the revoke bites on the revoked person's very next request rather than when their token expires. Two guards, both mirrored in the UI so no button is offered that the API will refuse: **nobody can revoke themselves** (which is also what stops a business losing its only owner, since `OWNER` is not invitable and there is therefore exactly one), and **an ADMIN cannot revoke the OWNER**.
- `DELETE /memberships/:membershipId/branch-access/:branchId` narrows a MANAGER/STAFF member's scope. Leaving someone with zero branches is allowed — it is a state the Team screen already warns about, and it is recoverable.
- Re-inviting a revoked email reactivates the membership with the **new** invite's role and branches. Re-adding someone is a fresh decision about their access, not an undo, and it is the only way back in — there is no separate reinstate endpoint.

**The business switcher.** Memberships returned by signup/login/`/auth/me` now carry their business's name, so the client can name every business someone belongs to without a request per membership. Settings renders a switcher when there is more than one **ACTIVE** membership and nothing at all when there is one. The choice is stored per device and reconciled on every launch against the memberships the session actually has, so a stale choice — a business since revoked, or one left by whoever used the device last — falls back instead of pinning the app to a businessId the API refuses. `GET /businesses/:businessId` was added because switching has to replace the full record (industry, currency, timezone), not just the id and name.

One consequence worth stating: being revoked from *every* business is now a real state. `primaryBusiness` returns null rather than naming a revoked business, `activeMembership()` returns undefined rather than falling back to a revoked row, and Home and Settings both say so plainly instead of rendering a dashboard of zeros with an "add your first branch" button that would fail on tap.

What's actually next:

1. **Phase 2 — Core Query Engine.** Still blocked on an LLM provider being wired in (Anthropic API key not yet provided). The Home screen already has the answer surface and the disabled ask bar waiting for it.
2. **Locale-aware formatting** (Phase 3 leftover) — partly done: `formatAmount` now groups INR the Indian way (₹3,40,000) and month, weekday and date labels come from the translation files rather than a hardcoded English array. Still open: locale-aware number and date formatting driven by the business's region rather than the app language, and the Hermes `Intl` caveat in Section 6 still stands.
3. **Live POS adapter** — blocked on either picking a different pull-capable vendor or a Petpooja partner conversation (see Section 12).

*Done since this list was last written: the business switcher, revoking access (both under 4a above), backend i18n (4b) and branch settings — see below.*

**Ingestion contract, for whoever builds on it:** required CSV columns are `occurred_at, product_name, quantity, unit_price, payment_method`; optional `transaction_external_id, sku, unit, tax_amount, discount_amount`. Rows sharing a `transaction_external_id` group into one transaction. A data source is bound to exactly one branch — there is no per-row branch column — so each branch gets its own `CSV_UPLOAD` source. Bad rows are skipped and reported per row rather than failing the file.

**Screens that exist but are deliberately hollow:** Reports (Phase 4) renders an honest "planned" notice rather than mock data, and Home's ask bar is visibly inactive. `AlertsScreen` (Phase 5) is the same, but no longer has a tab — the Staff tab took its slot, since attendance and payroll are used daily while alerts are not built at all. The screen and its `alerts.*` translations stay on disk so Phase 5 puts a tab back rather than rewriting it. None of these are stubs that were forgotten.

---

## 12. Open Risks (carried from PRD Section 12)

- **Gujarati NLU/voice quality** — validate early with real speakers; text-first fallback if voice accuracy is weak.
- **POS integration breadth** — investigated Petpooja (the natural first pick for this PRD's market) directly: its public API has no data-export/reporting endpoint, only order-injection for aggregators. A live adapter needs either a different vendor with a genuine pull API, or a partner-level conversation with Petpooja for reporting access — neither resolved yet. CSV upload is not just a fallback for everyone else; for now it's the *only* path for Petpooja merchants specifically, and is working end-to-end.
- **Data privacy regulation differs by market** — no market launch without its own compliance review (Phase 7).
- **Pricing model** — undefined; validate during Phase 4–5 user testing, not assumed upfront.
- **PRD not yet validated with external owners** — treat Section 6 priorities (and thus this phase order) as provisional until early user interviews confirm them, especially the Phase 2/3 ordering of query-engine vs. voice.

---

## 13. Branch Operations (a separate track, started 2026-09-23)

A second track, running alongside the phase sequence above rather than inside
it. Where Phases 0–7 make BizIQ *analyse* a business, this track makes it *run*
one: counter billing with tokens, branch-to-warehouse supply orders with
payment and dispatch, branch expense logging, and net profit per branch per
month across several businesses in one account.

The requirements and the full task breakdown are in
**[REQUIREMENTS.md](REQUIREMENTS.md)** — that document is the source of truth
for what is being built and why. This section tracks only where each task has
got to.

| Task | Focus | Requirements | Status |
|---|---|---|---|
| 1 | Roles and the permission matrix | R14 | ✅ done |
| 2 | One account, many businesses | R16 | ✅ done |
| 3 | Product catalog, new Home, hide AI | R4, R7 | ✅ done |
| 4 | Counter billing and tokens | R1, R17 | ✅ done |
| 5 | Supply orders end to end | R3, R5, R5.1, R9, R11, R12, R21, R22, R23 | ✅ done |
| 6 | Expenses and the daily log | R10 | ✅ done |
| 7 | Firebase notifications | R2, R8 | ✅ done |
| 8 | Analytics and net profit | R13, R15 | ⏳ not started |
| 9 | Day-end and month-end export | R17 | ⏳ not started |
| 10 | Restrictions that explain themselves | R18, R19 | ⏳ not started |

### Task 1 — Roles and the permission matrix ✅

**Why it had to come first.** Six of these requirements name a role that did not
exist, and the role code could not carry them. Authorization was 27 duplicated
`requireRole('OWNER','ADMIN')` lists plus four hand-written checks written as
**deny-lists** — `if (role === 'STAFF') return false`. An allow-list fails
*closed* when a new role appears, which is safe. A deny-list fails **open**:
adding `DELIVERY_AGENT` would have handed it every colleague's HR record through
`staffScope.js`, and `CASHIER` the ability to create staff in branches it cannot
reach. Those four were inverted *before* the enum grew, so no window existed
where the values were addable and the checks were wrong.

**What landed:**

- Seven roles: the existing `OWNER`, `ADMIN`, `MANAGER`, `STAFF` plus
  `WAREHOUSE`, `CASHIER` and `DELIVERY_AGENT`.
- A capability matrix — `backend/src/permissions/catalog.js` (pure data,
  requires nothing) mirrored to `frontend/src/permissions/matrix.json`, with
  `requirePermission('staff:create')` replacing `requireRole(...)` across all
  seven business routers. Default-deny; `OWNER: '*'` is the one wildcard.
- **MANAGER derives from ADMIN** minus an explicit (currently empty) exclusion
  list, so R14's "all the access that admin has" cannot silently drift.
- **`branch:allAccess` split from `staff:viewAllBranches`.** The
  `req.branchAccess === null` sentinel used to mean both "every branch's data"
  and "business-wide authority over people". Those were the same set while the
  set was {OWNER, ADMIN}; `WAREHOUSE` needs the first and must not have the
  second. Splitting them is what keeps the order desk out of HR records — and
  the newly-reachable `.includes(null)` path needed a guard to return 403 rather
  than crash with a 500.
- `npm run lint:permissions` (`frontend/scripts/check-permission-parity.js`) in
  CI, comparing the two matrices and the `MembershipRole` enum. `tsc` cannot see
  this: it checks the mirror against itself, and a wrong mirror is still
  internally consistent.
- `MembershipRole` on the frontend is now *derived* from the matrix rather than
  hand-written, which is how a new role used to arrive as a string the app
  silently treated as having no permissions.
- `INVITABLE_ROLES` derives from the matrix on both ends. Hand-listing it is the
  trap that makes a whole feature look built and be unreachable — the role
  exists, holds capabilities, and can be given to nobody.
- The revoke guard generalised from "an ADMIN cannot revoke the OWNER" to a rank
  comparison, so a manager cannot remove the admin who issued their account.
  Existing outcomes are unchanged; peers can still remove each other.
- `backend/tests/permissions.test.js` — 20 tests covering the matrix itself and
  each new role over HTTP, including the two regressions the deny-lists would
  have caused.

**Migration:** `20260923171027_operations_roles` adds the three roles and
`PaymentMethod.UNSPECIFIED`. Nothing in it *uses* the new values, deliberately:
Postgres refuses a new enum value in the transaction that added it, and Prisma
wraps each migration file in one — so any later data work writing `'CASHIER'`
into a row needs its own migration directory.

**Two error codes were renamed.** `PAY_SET_REQUIRES_OWNER_ADMIN` and
`PAY_CHANGE_REQUIRES_OWNER_ADMIN` became `PAY_SET_NOT_PERMITTED` and
`PAY_CHANGE_NOT_PERMITTED`, because a cashier sets pay now and naming two roles
in the code was a statement that had stopped being true.

### Task 2 — One account, many businesses ✅

Most of this requirement was already built and unreachable. A `User` has always
been able to hold memberships in several businesses, `Membership` has always
been the join, and Settings has had a working switcher since the access-control
pass. The one missing piece was any way to create the **second** business: a
business could only come into existence through signup, so a second business
meant a second account — exactly what R16 asks to stop.

- `POST /api/businesses` — the only route in `business.routes.js` with no
  tenant, because it creates the business there is no id for yet. Gated on
  `requireAuth` alone and **deliberately on no capability**: the caller has no
  role in a business that does not exist, and someone's ability to start their
  own must not depend on a role they hold in somebody else's.
- The creation itself is `businessService.createBusinessForUser`, **extracted
  from signup rather than copied**, and both callers run it inside a
  transaction. R16 is precisely that a second business should be the same
  operation as the first; a copy is what lets the two drift.
- `validateCreateBusiness` is stricter than signup's equivalent fields, which
  are optional-if-present because a signup claiming a pending invite sends none
  of them and only the service can tell. There is no such case here.
- `authStore.addBusiness` creates, **re-reads the session**, then switches. The
  session re-read matters: `user.memberships` is what the switcher renders and
  what `switchBusiness` validates an id against, so appending the new membership
  locally would be a second place that has to match the server's shape.
- `AddBusinessScreen`, reached from Settings. Its entry sits **outside** the
  switcher's render condition — `BusinessSwitcher` returns null below two
  businesses, so putting it inside would have meant only people who already have
  two could add a third. Fields default from the business being acted under,
  since a second shop in the same country is the common case.
- **Narrowed to owners afterwards.** Starting a business is the owner's act, not
  a delegated one: an admin runs the business they were given, and a cashier or
  a warehouse desk has no use for the entry. It is the capability
  `business:create`, the second entry in `ADMIN_EXCLUDES` — so `MANAGER`, which
  derives from `ADMIN`, does not get it either, and nothing checks a role name.

  This is the one place where the app is deliberately **narrower than the API**,
  which is worth stating because the usual rule is that they match. The gate is
  about what Settings offers; the endpoint stays open because it has no tenant
  to check a capability against, and deciding "which business's role?" would
  stop an invited cashier from ever starting one of their own. The direction is
  the safe one: a control that is hidden, never a control that 403s. The entry
  also survives for someone whose every membership was revoked — no role is left
  to hold a capability, and hiding it would leave an account that can do nothing.
- `INDUSTRY_OPTIONS` moved to `frontend/src/constants/industries.ts` and
  `INDUSTRIES` to `backend/src/validations/shared.js`, each of which had been
  about to become a second copy.
- `backend/tests/multi-business.test.js` — 7 tests, including that the two
  businesses stay isolated (a branch in one is invisible from the other, and
  owning both does not make one reachable through the other's id) and that a
  rejected request leaves no orphan business behind.

### Task 3 — Product catalog, new Home, role-aware navigation, hide AI ✅

**The catalog (R4).** Two scopes in one table: a `Product` with no `branchId`
belongs to the whole business and every branch sells it; one with a `branchId`
exists only there. So "this branch's catalog" is a single filter rather than a
union. Price works the same way — `Product.costPrice`/`sellPrice` are the
business default and a `ProductBranchDetail` row overrides them for one branch,
so a product priced the same everywhere needs no per-branch rows at all.

- `withEffectivePricing` resolves "what does this cost *here*" in one place,
  because three callers will need the same answer and disagreeing about a price
  is the kind of bug nobody notices until the till is short: the catalog, the
  counter order (Task 4) and the day-end export (Task 9).
- `isActive` is an **AND**, not an override. A product withdrawn business-wide
  is withdrawn everywhere; a branch may additionally withdraw one that others
  still sell. There is deliberately no way for a branch to re-activate something
  the business switched off.
- Products are withdrawn, never deleted — `LineItem` rows point at them and a
  past sale has to keep naming what was sold.
- Scope changes are all-branch acts: a cashier can create and price their own
  branch's products, and is refused both creating a business-wide one and
  promoting theirs to the whole business. Otherwise one branch could push a
  product into every other branch's catalog.
- `ProductBranchDetail` finally has an API — it had been in the schema since
  Phase 1 with nothing reading or writing it.
- `backend/tests/product.test.js` — 17 tests, most of them about a scope
  leaking: a branch seeing another branch's private products, or a cashier
  quietly adding one everywhere.

**Role-aware navigation.** The app had none — every tab and every route was
reachable by every role, with gating only as conditional JSX inside four
screens. Three tables now drive it, all keyed on the **same capability strings
the backend guards the matching endpoints with**, so a control that renders is
one whose request will succeed:

- `TAB_CATALOGUE` in `TabNavigator` — a role mounts three to five of five tabs.
- `ROUTE_CAPABILITY` in `navigation/routeAccess.ts` — `AppNavigator` registers
  only the modal routes this person may open, so a stale deep link cannot open a
  screen whose every request would 403.
- `SECTIONS` in `HomeScreen` — Home is now fixed chrome plus a capability-
  filtered, ordered list of section components, each fetching its own data.
  **Adding a role adds zero screens**; Tasks 5 and 6 add the warehouse queue,
  the delivery list and the expense-gap list as rows in that table.

`AppStackParamList` stays complete and un-narrowed on purpose. Making the
*type* depend on the role would force a generic param list onto every shared
screen and every component that navigates — a far worse explosion, and in the
type system where it hurts most. The type says what the app can do; the tables
say what this person can do.

Three interactions that are easy to miss, all handled:

- **Role changes mid-session.** `useMembership` derives from the store, which
  only refreshed on bootstrap and login — so demoting a cashier left them
  holding the cashier's app until they force-closed it. `RootNavigator` now
  refetches the session when the app returns to the foreground.
- **Switching business changes the role.** One person can be ADMIN in one
  business and CASHIER in another, which R16 makes normal. `<AppNavigator
  key={membership?.role}>` forces a clean remount rather than changing the
  screen list under a focused tab. The cost is in-flight form state, which is
  business-scoped anyway.
- **Navigating somewhere unregistered** is a red box in development and
  **silence** in production. `onUnhandledAction` on `NavigationContainer` at
  least logs it, and `resolveDeepLink` catches the case that genuinely arrives
  from outside — a push for a screen the recipient has since lost (Task 7).

**Hiding the AI surface (R7).** There is no AI to switch off; what existed was
three pieces of static teaser UI promising one — Home's decorative ask bar
(never even tappable), the "Ask your business anything" notice, and the
chat-bubble icon the Home tab had borrowed from it. All three now sit behind
`AI_CHAT_ENABLED` in `frontend/src/config/features.ts`. **Nothing is deleted**:
the components and every `home.query*` string stay on disk, exactly as
`AlertsScreen` is kept for Phase 5, so Phase 2 flips one constant rather than
rebuilding the surface from screenshots.

A role whose screens are not built yet — WAREHOUSE and DELIVERY_AGENT until
Task 5 — would otherwise land on a blank Home and reasonably conclude the app
is broken. Home says so instead.

### Task 4 — Counter billing and tokens ✅

Requirement 1: "as orders come in the cashier adds them, issues a token, and the
money keeps counting — and once an order is taken they can edit it." Explicitly
**not** a purchase flow: no cart, no payment step, no fulfilment.

**It landed in two commits, and the order mattered.** First a pure refactor
extracting `salesProjection.service.js` out of `ingestion.service.js` with no
behaviour change, proven by `ingestion.test.js` passing untouched. Only then was
the counter built on top. `ingestion.test.js` is one of very few real
write-path tests in this repo; rewriting it in the same change that adds a
feature would have thrown away the thing that made the refactor safe.

**One sales fact table, still.** A `CounterOrder` is not a second source of
sales — every mutation recomputes the total from its items and re-projects into
`Transaction`/`LineItem` inside one `prisma.$transaction`. So `getSalesSummary`
and every future metric keep reading one table, and because the projection is
idempotent, requirement 1's "they can edit it" costs nothing: editing runs it
again. `VOID` projects as `TransactionStatus.VOIDED`, which the existing
`status: 'COMPLETED'` filter already excludes — **no new code anywhere** for the
void case.

**The token allocator is the project's first deliberate `$queryRaw`**, and the
reason is worth keeping: Prisma cannot express `ON CONFLICT DO UPDATE SET x = x
+ 1`, and every alternative is worse. `MAX(tokenNumber) + 1` races two cashiers
on one counter; adding a retry loop makes it degrade exactly when the counter is
busiest, and the failure mode is a 500 while a customer stands there. A Postgres
sequence is the wrong shape entirely — not per-branch-per-day, needs runtime
DDL, never resets. One statement, atomic under READ COMMITTED. The
`@@unique([branchId, tokenDate, tokenNumber])` on `CounterOrder` is **not** the
allocator; it is the assertion that the allocator is correct, the same posture
`Attendance` takes with its no-double-punch key. A test opens twelve orders
concurrently and asserts twelve distinct tokens.

`tokenDate` is the **branch's** local date via `todayKeyInZone`. Keyed on UTC, a
branch in Asia/Kolkata restarts its numbering at 05:30 local, mid-breakfast.

**Closing an order is not freezing it.** Requirement 1 wants orders editable
after they are handed over, so `CLOSED` stays editable and can be reopened. The
immutability floor is the **day** close, which requirement 17's export needs:
without it, an edit after the export silently restates a number someone has
already been shown — the exact failure `SalarySlip`'s FINALIZED rule exists to
prevent. Closing a day refuses while orders are still open, and reopening is
available, because a day closed by mistake at 18:00 with two hours of trading
left must be recoverable or the floor is a trap.

**Prices come from the catalog, never the caller.** A client-supplied
`unitPrice` on a catalog line is ignored outright — a price the client can name
is a price the client can invent. `name` + `unitPrice` is accepted only for a
one-off with no product behind it.

**The screen is laid out around the job**: the open order and its running total
pinned under the thumb, the product grid above, the day's other tokens below.
Tapping a product with nothing open starts a token rather than scolding, because
that is what the cashier meant.

**A tab-budget rule came out of this.** Adding Counter took owner/admin/manager
to six tabs, and at 320dp the Gujarati, Hindi and Marathi labels truncate before
the English ones — the languages most likely to be in use break first. Five is
now the documented budget: `demoteWhen` gives up a tab slot for a role whose job
it is not (an owner reaches the till from Home instead), and a `__DEV__` warning
fires if any role ever exceeds five again.

`backend/tests/counter-order.test.js` — 22 tests across tokens, the running
total, editing, the projection, the day floor and access.

### Task 5 — Supply orders end to end ✅

Requirements 3, 5, 5.1, 9, 11 and 12, which are one feature: a branch orders raw
material from a central warehouse desk, pays for it, the desk fulfils and
dispatches it, an agent delivers it, and either end can say it is running late.

**A supply order is deliberately NOT projected into the sales fact table.**
This looks inconsistent beside Task 4 and is the whole point: a counter order is
a *sale* — revenue — and a supply order is an internal transfer and a *cost*.
Writing it into `Transaction`/`LineItem` would inflate every sales figure in the
product by the value of the flour a branch bought from its own warehouse. Task 8
reads it from `supply_orders` as a cost input to net profit instead.

**The status machine is data, in one place.** `TRANSITIONS` in
`supplyOrder.service.js` is the whole of what may follow what, and
`assertTransition` is the only thing that enforces it. Written as `if`s at each
endpoint, the rule would be whatever each handler remembered. `CANCELLED` is
reachable from every stage the goods have not left the warehouse in and from
none after: cancelling something already on a bike would leave a branch holding
stock the system says was never sent.

**Cancel and reject are two verbs for one end state, on purpose.** The branch
withdrawing its own order and the warehouse saying it cannot fill one are
different events with different people to tell. They carry different
capabilities (`supplyOrder:create` vs `supplyOrder:fulfil`), allow different
statuses, and the reason is required on a rejection and optional on a
cancellation. One shared endpoint would have lost which happened.

**Every change writes an event**, through the single `recordEvent` choke point.
That is what makes requirement 5.1's four asks — material tracking, order
tracking, dispatch and payment — one stream rather than four features, and it is
where Task 7's push notifications hook in: one trigger there covers the whole of
requirement 8's list, where six call sites would mean six things to keep in step
and one silently missed. It is deliberately **not** stubbed with an empty
notifier today, because a function that does nothing reads as a function that
works.

**Payment is recorded, never collected** — the decision in `REQUIREMENTS.md`. No
gateway, no money through the app. `ONLINE` means the branch paid some other way
and typed a reference; the warehouse checks it against its own records
(`PENDING → PAID → VERIFIED | FAILED`). `COD` stays `PENDING` until the goods
arrive and becomes `PAID` at the moment of delivery, because that is when the
money actually changes hands. Verifying an order nobody has claimed to pay for
is refused rather than quietly stamping it VERIFIED.

**And the cash is confirmed, not assumed** (requirement 22). That `PAID` used to
be a side effect of arriving: the goods reaching the branch was taken as
evidence that the branch's money had reached the warehouse. They are two events,
and only the person standing at the counter knows whether the second one
happened — so marking a COD order delivered asks them, naming the amount and the
branch, and the server refuses the delivery without the answer. "Not yet" leaves
the order on the road and unpaid, which is the state it is actually in and the
state somebody can still chase. Taking the cash writes its own `PAYMENT` row
(`PAYMENT_COLLECTED`) with who took it, because before this a COD order's
history showed it becoming `PAID` with nothing anywhere saying who had the
money. An order with nothing outstanding is delivered with no question asked: a
question whose answer cannot matter only teaches people to tap through it.

**Order numbers use the same atomic allocator as tokens** (`INSERT … ON CONFLICT
DO UPDATE … RETURNING`) and differ in two ways: they are per *business*, and
they never reset. A token is shouted across a counter and has to stay small; an
order number is quoted days later and has to stay unique. They are issued at
`PLACED`, not at cart creation — numbering carts burns numbers on orders that
never happened and leaves gaps the warehouse would ask about.

**One cart per branch, not per cashier.** The branch is what orders, two people
on a shift adding to one list is what a kitchen expects, and a per-person cart
strands whatever someone had half-built when their shift ended. It is
find-then-create rather than a partial unique index, following the precedent the
`Holiday` model already sets: Prisma 5 cannot express one and hand-adding it in
SQL would leave permanent drift against `schema.prisma`. Losing that race costs
a second cart, which is visible and fixable.

**Prices come from the catalog, never the caller** — same rule as the counter.
An unpriced item is refused rather than ordered at zero, because free flour in
the figures is worse than an error.

**Three listings, three capabilities, one component.** The cashier's tracking
list, the warehouse desk and the delivery queue are separate endpoints
(`supply-orders`, `supply-desk`, `supply-deliveries`) so the capability required
decides which cut a caller gets, instead of one endpoint re-deriving permission
from a `?scope=` switch. On the device they are one `SupplyOrderList` with
different props: three near-copies would drift, and the desk's would be the one
that forgot the delay banner.

**Dispatch names an agent, and the desk still never sees the team list**
(requirement 21). The first pass left dispatch unassigned, reasoning that
picking somebody meant listing the business's members and the warehouse holds no
`team:view`. The premise was right and the conclusion was wrong: the answer to
"this screen needs less than the team list" is a narrower endpoint, not a
missing feature. `GET /supply-delivery-agents`, guarded by `supplyOrder:fulfil`,
returns a membership id, a name, a duty state and a count — no email, no
branches, no employment record.

Who appears on it is a capability question asked carefully: an admin holds
*every* capability, so filtering on `supplyOrder:deliver` alone would offer the
owner and every admin as couriers. The list is `supplyOrder:deliver` **and not**
`supplyOrder:fulfil` — someone who can run the desk is not who the desk is
looking for. Both halves come off the matrix, so this is still an allow-list,
and a role added later that carries but does not fulfil appears without an edit.

**Availability is reported, never enforced.** "Free" comes from the attendance
module — a punch-in with no punch-out — rather than from a second notion of
availability invented for this screen. Attendance has nothing to say about an
agent with no employment record, or about a business that does not punch in at
all, so that state is `UNKNOWN` and sorts *above* off duty; blocking on
availability would leave those businesses unable to assign anybody. Every agent
stays selectable and the freest is preselected: the person at the desk knows
things this process does not.

**"Nobody yet" stays on offer**, so a business with no agent can still ship, and
an unnamed run still reaches every agent covering that branch. **Assigning is
its own verb** as well as a field on dispatch, because "who is taking it" and
"it has left" are different facts with different timing — the named agent goes
home an hour later, and with only the dispatch field the sole way to correct
that would be to undo a dispatch that really happened. Each assignment writes an
`ASSIGNMENT` event with the agent's name snapshotted; assigning the same person
twice writes nothing, because a history that says a run was given to Ravi and
then given to Ravi is one nobody reads twice.

**A branch's delivery address is not its city and region.** Those describe where
a branch *is*, for reporting; they are not somewhere a rider can go.
`addressLine` is free text and multi-line, because an Indian address is not a
fixed set of fields and forcing one drops the half that actually finds the place
("behind the old post office"). It travels on the order itself rather than
costing a second request, since the agent's order screen is the only thing they
open and branch endpoints are not theirs to call. A branch with no address says
so rather than showing a blank, and nothing fails.

**Design.** Supply, Desk and Deliveries are tabs for the roles whose daily work
they are. That took a cashier to six tabs, so `demoteWhen` grew an `unless`:
Products is given up by anyone holding `supplyOrder:create` *unless* they also
hold `analytics:viewBusiness`. A cashier trades the catalog for Supply and
reaches it from Home; an admin, who holds the same capability, keeps it. Every
role is back within the five-tab budget. Quantities are typed on the cart
screen, not tapped up on the catalog: raw material is ordered in twenties, and
reaching 20 kg by pressing a plus twenty times is not a design.

**A warehouse is a `Branch` with a kind** (requirement 23), not a table of its
own. Adding a staff member demanded a branch, and for a warehouse employee
there was no true answer — the only locations a business had were the places it
sells from, so there was nowhere to file them and therefore no way for them to
punch in. Attendance, geofencing, payroll, rosters and staff records are every
one of them already keyed on `branchId`, so as a Branch a warehouse gets all
five the day it is created; a separate table would have meant teaching all five
about a second kind of place first.

What it earns is enforced where goods move, not merely left out of the pickers:
`branchOf` in both counterOrder.service.js and supplyOrder.service.js refuses a
WAREHOUSE with `BRANCH_IS_WAREHOUSE`. A warehouse has no till, and an order it
placed on itself would reach the desk asking the desk to ship to the desk. On
the device the split is one rule — **`tradingBranches` where goods move,
`branches` where people are** — stated once in `useBranches` so the next picker
lands on the right side of it.

**Adding a staff member reads the role off the email.** The email field was only
ever "link an account so they can punch in"; it is also the one thing on that
form that identifies somebody the business already knows. So it now says who
they are, and when their role reaches every branch the question changes from
"which branch do they work at" to "where is their base", with a line saying that
it only decides where attendance and payslips are filed. The location is chosen
automatically in the two cases where there is nothing to choose — one location,
or a person whose work spans every branch and a warehouse to base them at — and
never guessed otherwise, because filing someone at the wrong shop silently is
worse than a tap. The membership role is also offered as the job title, which a
delivery agent otherwise types by hand. The lookup needs `team:view`, so for a
cashier it simply does not happen and the screen behaves as it did.

**The form was in the wrong order, which made all of that unreachable.** The
email sat in the *last* card and the location picker in the first, so the
recognition could never fire before the question it was meant to answer had
already been asked — an owner adding a delivery agent was shown "WHICH BRANCH DO
THEY WORK AT?" over a list of shops the agent works at none of. The screen now
runs **who they are → where they are based → what they are paid**, which is the
order the answers actually depend on each other in. The subtitle went with it:
it opened "Every staff member belongs to one branch", which is the sentence that
made the wrong answer sound like the only one.

**Interface work in the same pass.**

- **Destructive actions confirm, through one helper.** Three screens had
  hand-written the same `Alert.alert(title, body, [cancel, destructive])` and
  three more destructive actions had no question at all — cancelling a supply
  order, withdrawing a product, withdrawing a raw material. `utils/confirm.ts`
  is that shape once, resolving a promise so a caller reads as
  `if (await confirm(...))`; it uses React Native's own `Alert`, falls back to
  the browser dialog on web the way `utils/haptics.ts` no-ops there, and settles
  `false` on an Android back press so a busy flag can never stick.
- **`PrimaryButton` had no horizontal padding.** It never showed while every
  button was full width, because the content is centred and the space came from
  the button being wider than its label. The supply cart sized one by its
  content and the label sat flush against both edges. Fixed in the component:
  a button has to look right at its own natural width, not only when something
  else is stretching it. The cart's tray also stopped being a row — the total
  and the button shared one line, and every Indic translation of "Place order"
  is longer than the English, so the figure was squeezed first in the languages
  most likely to be used.
- **Language is a dropdown**, built from `Modal` with `onRequestClose` for the
  Android back button. Four stacked rows was a fifth of the Settings screen for
  a setting most people touch once, and it grew with every language added.
- **The business id is off the Settings screen.** It is a UUID; nobody reading
  that screen can do anything with it.
- **Home shows the cards for your job, not for your capabilities.** An admin
  holds every capability in the matrix, so "Order raw material" and "Your
  deliveries" were on an owner's Home — neither of which an owner does. Sections
  gained the same `hideWhen: { holds, unless }` the tab bar uses. Hiding the
  ordering card took away the only route an admin had to the raw-material
  catalog, so a **Raw material catalog** card replaces it on
  `supplyItem:manage` — which also gave the warehouse desk its first way in at
  all: it holds that capability and had no screen to use it on.

`backend/tests/supply-order.test.js` — 59 tests across the catalog, the cart,
placing, the status machine, role separation, the desk, delays, delivery,
handing a run to an agent, the destination address, cancelling and cross-tenant
isolation.

---

### Task 6 — Expenses and the daily log ✅

Requirement 10: "gas bill, electricity bill, petty expenses and everything else.
Also daily cost: how much did I spend today? And how much did I sell today?
Category-wise too. The person at the back office will call the branches that
haven't logged their daily expenses."

**The counterpart to Task 4, and deliberately not its mirror image.** A counter
order is what a branch took in and is projected into `Transaction`; an expense is
what it paid out and is projected nowhere. They meet in one endpoint —
`GET /branches/:branchId/expense-day` — because the requirement asks them as one
question, and answering them on two screens would make the comparison the reader's
job.

**Seeded categories are codes, not names.** Every business starts with the same
eight, and they are read by a cashier who may have the app in Gujarati. The
backend cannot translate, so a seeded category carries a `code` and the device
renders `t('expenseCategory.GAS')`; the `name` column is the English fallback,
playing exactly the role the English in `errors/catalog.js` plays. A category
somebody types carries no code and is shown verbatim — their own words are not
ours to translate, the same rule a delay note already follows.

**Custom categories exist because the breakdown is the requirement.** The seeded
eight cover what R10 names and not "Vegetables" or "Staff tea". Without a way to
add one, everything specific lands in Other with a note — and "today I took
₹2,000 of milk" stops being answerable about milk, which is the feature.

**The double-count question is answered here, not in Task 8.** There is no
raw-material category, on purpose: supply spend is already recorded in
`supply_orders`, and a category inviting someone to log it again by hand would
subtract it twice from net profit. §5 of `REQUIREMENTS.md` records the decision
and what is left for Task 8 — a business can still name a custom category
anything, so the export flags overlap rather than pretending the data shape
prevents it.

**`expense:view` is a new capability, and the reason is the warehouse desk.**
R10 gives the back office the job of chasing branches, which means reading every
branch's figures and recording none of them. `expense:log` and
`expense:viewAllBranches` could not express that between them: one is the wrong
authority and the other is a question of scope. This is the same narrowing that
produced `GET /supply-delivery-agents` in Task 5 — when a screen needs less than
a capability grants, the answer is a narrower capability, not the broader one.

**"Who hasn't logged today" is a query, and every branch is asked about its own
day.** A business with branches in two timezones has no single "today", so
taking the server's would tell the back office to ring a branch whose day has
not started. Two queries however many branches there are: the branch list, then
one grouped count over the (branch, date) pairs it produced. Computed when the
card loads, so it is exact — a job snapshotting at 20:00 is wrong by 20:05, and
the requirement says a person makes the call anyway.

**`localDayRange` is the new piece of `utils/datetime.js`.** Expenses are keyed
on a branch-local date and need no conversion; sales are instants and do.
`occurredAt::date` would have compared UTC days — counting every sale before
05:30 IST against the day before — and could not have used the existing index,
because a function over a column is not indexable. Task 9's day-end export wants
the same window.

**Design notes.** The category picker is a wrapping row of content-width chips
rather than anything that divides the line evenly: the list is eight long before
a business adds one of its own, which is well past where `SegmentedOption`
stops working. The day card shows **two** money tiles and the difference as a
full-width line — three equal shares of a 393dp phone leave each figure about
75dp, which holds ₹2,000 and not ₹1,50,000, and the difference is the conclusion
drawn from the two above it rather than a third peer.

`backend/tests/expense.test.js` — 16 tests across seeding through both business
creation paths, custom categories, refusing to rename a standard one, the
positive-amount and future-date rules, correcting and removing an entry, the day
and month views, the compliance list for today and for a past date, and the four
permission boundaries (desk reads but cannot log, cashier cannot reach another
branch by id or by route, cashier cannot see the business-wide list).

---

### Task 7 — Firebase notifications ✅

Requirements 2 and 8, plus the pushes R3, R9, R11, R12 and R21 had been waiting
for. Setup is `Docs/FIREBASE_SETUP.md`.

**A notification is a row first and a push second.** `notifications` is written
before anything is sent, and the send is best-effort on top of it. That ordering
is what makes every awkward case ordinary rather than special: a phone that is
off, a token FCM has retired, a worker who has never opened the app, a server
with no Firebase credentials at all. Requirement 2 says in as many words that
marking attendance succeeds for a worker who cannot be told; the same has to be
true of a server that cannot tell anybody.

**Without `FIREBASE_SERVICE_ACCOUNT` the whole feature still works, minus the
push.** Rows are written, the in-app centre lists them, the badge counts them.
The backend logs one line at startup and carries on. The 259-test suite runs in
exactly that state, which is why the tests assert `sentAt === null` rather than
mocking FCM: not sending is a supported mode, not a stub.

**The backend renders prose here, and this is the one place it may.** CLAUDE.md
forbids it because the backend cannot know the reader's language — and that
premise is false for exactly this channel, twice over: Android draws the lock
screen before any app code runs, and a device reports its own language when it
registers its token (`DeviceToken.locale`). So the exception is not a hole, it
is a place where the stated reason stops applying. Three things fence it:

- Only `notifications/push.js` may require `notifications/labels.js`.
  `lint:notification-prose` walks the backend tree and fails on any other
  `require`. It replaces a looser substring scan that had been sitting inside
  the permission gate, which could not tell a `require` from a comment about
  the rule.
- Every push carries `{ code, params }` in its data payload as well as the
  rendered text, and the in-app centre renders `t('notifications.<code>')`. So
  the history re-renders when the app language changes; only the already-drawn
  lock-screen copy keeps the language it arrived in, which is correct — it was
  written when it was sent.
- `lint:backend-i18n` compares all four languages in **both** backend
  dictionaries and checks every code the backend can send has an app key.
  `payslip.labels.js` had carried four languages since Phase 4 with **nothing
  comparing them** — a missing key there prints `undefined` on a document
  somebody is handed with their pay.

**Recipients are capabilities, never roles.** "Tell the warehouse" is "tell
everyone in this business holding `supplyOrder:fulfil`", so a role added later
that also fulfils orders is notified with no edit here. The actor is always
excluded — an owner who both places and fulfils would otherwise notify
themselves.

**`DeviceToken.token` is globally unique on purpose.** A handset signing in as
somebody else **moves** the row rather than adding a second one. Without that,
the person who signed out keeps receiving notifications on a phone they have
signed out of — a security property, not tidiness. A token FCM reports as dead
is disabled; a transient failure is not, or one bad afternoon quietly
unsubscribes the whole business.

**Attendance notifications cannot be switched off**, and the switch says so
rather than silently refusing. Requirement 2 exists so a worker finds out they
were marked absent; a preference that hid it would defeat the requirement it was
built for. Everything else — orders, delays, payments, deliveries — is a plain
toggle, stored as rows meaning *muted* so that a category added later is on by
default rather than silently off for everyone who registered before it existed.

**A tap is re-checked before it is dispatched.** A notification outlives the
access that justified it, so `resolveDeepLink` asks the capability matrix again
and falls back to Home. Dispatching into a route the navigator never registered
is a silent no-op — a tap that does nothing, which nobody reports.

`backend/tests/notification.test.js` — 15 tests: the worker is told and a worker
with no account still gets marked, the desk hears about an order and the person
who placed it does not, a delay reaches the branch with its minutes as a param,
the centre counts and marks read, one member cannot read another's, a shared
handset moves rather than duplicates, and attendance refuses to be turned off.
