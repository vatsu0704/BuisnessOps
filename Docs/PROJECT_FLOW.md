# Project Flow — BizIQ

This document translates the product requirements (PRD) into a buildable engineering sequence for this repo: **React Native/Expo (TypeScript) frontend + Node.js/Express backend + PostgreSQL via Prisma**. It exists so that at any point in the build, anyone can answer "what phase are we in, what does it depend on, and how do we know it's done."

The product is named **BizIQ** (Android package `com.biziq.app`), renamed from the earlier "BuisnessOps". The old name deliberately survives where changing it would be disruptive — the repository folder and the Postgres database name `buisnessops` — and those are not typos to fix.

**Where the repo actually is:** Phases 0 and 1 (CSV path) are done. The app ships as an Expo **development build** rather than Expo Go, with its own icon, animated splash and a four-tab shell (Home, Reports, Alerts, Settings). Phase 3's UI i18n is done ahead of order; the rest of Phase 3 and all of Phase 2 are not started. An **Attendance & Salary Slip module** was also added outside the phase sequence, on request — backend and frontend both done (see 4a below).

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
- Roles per Section 8 of the PRD: `OWNER`, `MANAGER` (branch-scoped), `STAFF` (alerts-only), `ADMIN` (config-only).
- Auth: JWT-based login/session (already have `jsonwebtoken` installed), password hashing, business signup flow that creates the first `Business` + `OWNER` membership.
- Middleware: tenant-resolution (derive `businessId` from the authenticated session, never from client input) + role guard.
- Environment/config split for dev/staging/prod; CI running `npm test` + Prisma migration check on both backend and frontend.

**Exit criteria:** a manager account, scoped to one branch, cannot read another branch's data even if it guesses an ID — verified by a test, not just by inspection.

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
4. **Geofence UI at branch creation** — `PATCH /branches/:branchId` can set coordinates and a radius, but the Add Branch form still doesn't capture them, so a new branch has no geofence until someone calls the API.

*Done since this list was last written: the business switcher, revoking access (both under 4a above) and backend i18n (below).*

**Ingestion contract, for whoever builds on it:** required CSV columns are `occurred_at, product_name, quantity, unit_price, payment_method`; optional `transaction_external_id, sku, unit, tax_amount, discount_amount`. Rows sharing a `transaction_external_id` group into one transaction. A data source is bound to exactly one branch — there is no per-row branch column — so each branch gets its own `CSV_UPLOAD` source. Bad rows are skipped and reported per row rather than failing the file.

**Screens that exist but are deliberately hollow:** Reports (Phase 4) renders an honest "planned" notice rather than mock data, and Home's ask bar is visibly inactive. `AlertsScreen` (Phase 5) is the same, but no longer has a tab — the Staff tab took its slot, since attendance and payroll are used daily while alerts are not built at all. The screen and its `alerts.*` translations stay on disk so Phase 5 puts a tab back rather than rewriting it. None of these are stubs that were forgotten.

---

## 12. Open Risks (carried from PRD Section 12)

- **Gujarati NLU/voice quality** — validate early with real speakers; text-first fallback if voice accuracy is weak.
- **POS integration breadth** — investigated Petpooja (the natural first pick for this PRD's market) directly: its public API has no data-export/reporting endpoint, only order-injection for aggregators. A live adapter needs either a different vendor with a genuine pull API, or a partner-level conversation with Petpooja for reporting access — neither resolved yet. CSV upload is not just a fallback for everyone else; for now it's the *only* path for Petpooja merchants specifically, and is working end-to-end.
- **Data privacy regulation differs by market** — no market launch without its own compliance review (Phase 7).
- **Pricing model** — undefined; validate during Phase 4–5 user testing, not assumed upfront.
- **PRD not yet validated with external owners** — treat Section 6 priorities (and thus this phase order) as provisional until early user interviews confirm them, especially the Phase 2/3 ordering of query-engine vs. voice.
