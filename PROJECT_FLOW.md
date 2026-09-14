# Project Flow — AI Business Intelligence Platform

This document translates the product requirements (PRD) into a buildable engineering sequence for this repo: **React Native/Expo (TypeScript) frontend + Node.js/Express backend + PostgreSQL via Prisma**. It exists so that at any point in the build, anyone can answer "what phase are we in, what does it depend on, and how do we know it's done."

The repo today is a bare scaffold — Express app with a single `User` model, an Expo app with one screen. Everything below starts from that.

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

| Phase | Focus | Maps to PRD |
|---|---|---|
| 0 | Foundations: multi-tenant data model, auth, RBAC | prerequisite to Phase 1 |
| 1 | Data ingestion: unified schema, CSV/Excel upload, first POS adapter | FR-04, FR-05 |
| 2 | Core query engine: metrics catalog + NL → answer pipeline (English first) | FR-01, FR-06 |
| 3 | Multi-language + voice | FR-02, FR-03 |
| 4 | Reporting & cross-branch comparison | FR-06, FR-07 |
| 5 | Proactive intelligence: alerts, benchmarking, wastage, cash-mix, seasonal correlation | FR-08–FR-12 |
| 6 | Strategic & franchise: staff analytics, royalty automation, expansion what-if, forecasting | FR-13–FR-16 |
| 7 | Hardening: security, compliance, performance, billing | NFRs (Section 7) |

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

**Deliverables**
- Normalized schema: `Product`, `Transaction`, `LineItem`, `InventoryUsage`, `Shift`, each carrying `businessId` + `branchId`.
- `DataSourceAdapter` interface: `pullSales()`, `pullInventory()`, `pullShifts()`.
- CSV/Excel upload adapter (works for any business on day one — this unblocks onboarding per FR-05, regardless of POS vendor).
- One live POS API adapter as the reference implementation (pick the most common vendor among target early users; this is the template for every future connector).
- Ingestion job runner (queue or scheduled task) that normalizes and de-duplicates incoming records; a sync-status view so an owner can see "last synced: 2 hours ago" per branch.

**Exit criteria:** uploading a CSV or connecting the reference POS populates `Transaction`/`LineItem` rows queryable per branch and per date range.

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

**Deliverables**
- UI i18n: all static strings in en/hi/gu (structure this so a fourth language is a translation file, not a code change).
- Intent parser extended to accept hi/gu input — reuses the same language-agnostic intent schema from Phase 2, so only the parsing prompt/model changes per language.
- Answer composer extended to phrase results in the query's language.
- Voice: STT on-device mic capture → text → existing pipeline → optional TTS response. Ship English voice first, then Hindi/Gujarati once STT/TTS accuracy is validated (PRD Section 12 flags Gujarati as higher-risk — validate with real speakers before enabling voice for it, text-first if needed).
- Locale-aware currency/date/number formatting per business's region (NFR: Localization beyond language).

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

1. Replace the standalone `User` model in [backend/prisma/schema.prisma](backend/prisma/schema.prisma) with `Business` / `Branch` / `Membership` (Phase 0).
2. Add tenant-resolution middleware in [backend/src/middleware/](backend/src/middleware/) alongside the existing `errorHandler.js`.
3. Stand up the signup flow (create `Business` + first `OWNER`) reusing the existing `user.controller.js` / `user.service.js` pattern.
4. Replace [frontend/src/screens/HomeScreen.tsx](frontend/src/screens/HomeScreen.tsx) with an auth-gated shell once login exists, ahead of the Phase 2 chat screen.

---

## 12. Open Risks (carried from PRD Section 12)

- **Gujarati NLU/voice quality** — validate early with real speakers; text-first fallback if voice accuracy is weak.
- **POS integration breadth** — define the initial supported-vendor shortlist before Phase 1 starts; CSV upload is the permanent fallback for everyone else.
- **Data privacy regulation differs by market** — no market launch without its own compliance review (Phase 7).
- **Pricing model** — undefined; validate during Phase 4–5 user testing, not assumed upfront.
- **PRD not yet validated with external owners** — treat Section 6 priorities (and thus this phase order) as provisional until early user interviews confirm them, especially the Phase 2/3 ordering of query-engine vs. voice.
