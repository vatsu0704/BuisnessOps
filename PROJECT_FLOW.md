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
| 3 | Multi-language + voice | FR-02, FR-03 | 🟡 UI i18n done (en/hi/gu/mr); voice and query-language work outstanding |
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

## 4a. Attendance & Salary Slip module (ad hoc)

Not part of the original PRD phase sequence — added on request, from a separate reference requirements doc. **Backend and frontend both done.**

**Backend:**
- `StaffMember` (Phase 1) extended with `baseSalary`; `Branch` extended with an opt-in `geofenceRadiusMeters` alongside its existing `latitude`/`longitude`. New `Attendance` and `SalarySlip` tables — see `database-table.md` section 4a for the full column-level rationale (in particular, why Attendance is a model of its own rather than reusing `Shift`).
- Self-service `POST /attendance/punch-in` / `punch-out`, resolved to the caller's own `StaffMember` via their `userId` — never a client-supplied id. Punches are rejected outside a branch's geofence when one is configured (haversine distance, hand-rolled rather than pulling in `geolib` for one formula).
- Manager/owner `POST /staff/:staffMemberId/attendance/mark` for days with no punch (absence, approved leave), and monthly/daily read endpoints.
- `POST /staff/:staffMemberId/salary-slips/generate`: pro-rates `baseSalary` against the month's attendance (`PRESENT`=1, `HALF_DAY`=0.5, `ABSENT`/`LEAVE`=0 — leave is unpaid by default, there's no leave-balance/policy model), minus a manually-entered `deductions` amount. Regenerating overwrites the same slip rather than duplicating it.
- `GET /salary-slips/:id/pdf` generates the payslip PDF on demand (via `pdfmake`) from the stored numbers — no cloud storage is wired up in this project yet, so there's no persisted `slip_url` the way the reference doc's schema had one.
- Full Jest coverage in `backend/tests/attendance.test.js` (geofence accept/reject, double-punch guards, RBAC, payroll math, PDF response).

**Frontend:** reachable from Settings → "My attendance" (everyone) and "Staff & payroll" (OWNER/ADMIN/MANAGER only).
- `AttendanceScreen` — today's punch status, punch in/out (captures device location via `expo-location`, best-effort — proceeds without it if permission is declined, since not every branch requires a geofence), month history with month navigation.
- `StaffScreen` / `AddStaffScreen` — branch-scoped staff list and a form to register one, optionally linking an existing account by email (resolved server-side, same pattern as the existing membership invite) so that person becomes punch-capable.
- `StaffDetailScreen` — a staff member's monthly attendance, a manager-override "mark a day" action, payslip generation, and a list of past payslips with a download action (native: `expo-file-system` downloads the PDF straight to a file, then hands it to the share sheet via `expo-sharing` — the same pattern `saveTemplate.ts` already used for the CSV template; web: a straight browser download).
- Verified live end-to-end against the running app (Playwright): staff list → staff detail → mark absent → generate payslip → PDF download, and separately the punch-in/out cycle with a mocked in-geofence location.

**Known gap found while verifying, not fixed here:** the app has no business-switcher, and every screen (not just this module) picks `user.memberships[0]` as "the" business. Since signup always creates a new business, *any* user invited into a second business ends up with two memberships, and which one is `[0]` is arbitrary — for this module specifically, that can make "My attendance" claim someone "isn't registered as a staff member" even when they are, in the wrong business. Worth a real fix (a business switcher, or at least a sensible tie-break) before staff invites are used for real.

**Deliberately not built:** `runMonthlyPayrollBatch()` (a scheduled job) — there's no cron/queue infrastructure in this project yet, and generation is already available on demand; a branch-update endpoint for setting geofence coordinates after creation (currently branch-creation-time only); auto half-day detection from punch duration (half-day is manager-set only, for now); and a real date picker for the "mark a day" form (plain YYYY-MM-DD text input instead — no date-picker library is installed).

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

**Status: UI i18n done (and extended to Marathi). Everything that depends on the query engine is blocked behind Phase 2; voice is not started.**

**Deliverables**
- ✅ UI i18n: every static string renders through `t()`, with translations in **en / hi / gu / mr**. Strings live in `frontend/src/i18n/locales/*.json`; `en.json` is the source of truth and `t()` is typed against it, so a missing key is a compile error rather than text that renders as the raw key. Language resolution is device choice → account `preferredLocale` → device language → English, persisted locally and to the account via `PATCH /auth/me/locale`.
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

What's actually next:

1. **Phase 2 — Core Query Engine.** Still blocked on an LLM provider being wired in (Anthropic API key not yet provided). The Home screen already has the answer surface and the disabled ask bar waiting for it.
2. **Locale-aware formatting** (Phase 3 leftover) — the Home/staff/payroll screens all use a plain thousands-separator placeholder for currency right now; see the Hermes `Intl` caveat in Section 6.
3. **The multi-membership bug, narrowed but not eliminated:** every screen still picks `user.memberships[0]` as "the" business. Signing up via a pending invite no longer creates a redundant extra business (the main way this happened), but someone who signed up independently *and separately* gets invited elsewhere later still ends up with two memberships and no way to choose between them. A real business-switcher is still worth doing eventually.
4. **Revoking an invite or a member's access** — you can invite and grant branches, but there's no way yet to revoke a pending invite or an existing member's access once granted.
5. **Live POS adapter** — blocked on either picking a different pull-capable vendor or a Petpooja partner conversation (see Section 12).

**Ingestion contract, for whoever builds on it:** required CSV columns are `occurred_at, product_name, quantity, unit_price, payment_method`; optional `transaction_external_id, sku, unit, tax_amount, discount_amount`. Rows sharing a `transaction_external_id` group into one transaction. A data source is bound to exactly one branch — there is no per-row branch column — so each branch gets its own `CSV_UPLOAD` source. Bad rows are skipped and reported per row rather than failing the file.

**Screens that exist but are deliberately hollow:** Reports (Phase 4) and Alerts (Phase 5) render an honest "planned" notice rather than mock data, and Home's ask bar is visibly inactive. Replace each with the real thing as its phase lands; none of them are stubs that were forgotten.

---

## 12. Open Risks (carried from PRD Section 12)

- **Gujarati NLU/voice quality** — validate early with real speakers; text-first fallback if voice accuracy is weak.
- **POS integration breadth** — investigated Petpooja (the natural first pick for this PRD's market) directly: its public API has no data-export/reporting endpoint, only order-injection for aggregators. A live adapter needs either a different vendor with a genuine pull API, or a partner-level conversation with Petpooja for reporting access — neither resolved yet. CSV upload is not just a fallback for everyone else; for now it's the *only* path for Petpooja merchants specifically, and is working end-to-end.
- **Data privacy regulation differs by market** — no market launch without its own compliance review (Phase 7).
- **Pricing model** — undefined; validate during Phase 4–5 user testing, not assumed upfront.
- **PRD not yet validated with external owners** — treat Section 6 priorities (and thus this phase order) as provisional until early user interviews confirm them, especially the Phase 2/3 ordering of query-engine vs. voice.
