-- =============================================================================
-- HisabKitab — put a business into any subscription state, for testing (dev only)
-- =============================================================================
--
-- Requirement 28. A plan belongs to a BUSINESS, not to a person: this finds the
-- business through the email of somebody in it (usually the owner), and everyone
-- in that business is then bound by the plan, each within their own role.
--
-- HOW TO USE
--   1. Connect a query tool (pgAdmin, DBeaver, psql) to the development database
--      `buisnessops`. The subscriptions migration must already be applied
--      (`npx prisma migrate deploy` in backend/).
--   2. Change the five settings at the top of the DO block below.
--   3. Run the WHOLE file (pgAdmin: F5. DBeaver: "Execute script", Alt+X.
--      psql: `psql -d buisnessops -f backend/scripts/dev-plan.sql`).
--   4. The last result is every business that email belongs to, and where its plan
--      now stands. What changed is also printed as a NOTICE (pgAdmin: the
--      Messages tab).
--   5. Close and reopen the app (or reload the web page). The server applies the
--      new state on the very next request, but the app learns its plan when the
--      session loads, so its menus and banners follow only after a reopen.
--
-- THE STATES (v_state)
--   show          Change nothing; only print where things stand.
--   trial         Franchise free trial, 30 days left, no branch limit — what a new
--                 business gets.
--   trial_ending  Franchise free trial with 3 days left. The OWNER sees a blue
--                 "Your free trial ends on …" banner on Home; nobody else does.
--   paid          v_plan, paid for a year, for v_branches trading branches.
--   no_end        v_plan, paid with no end date (an invoiced customer).
--   grace         v_plan, ended 2 days ago. Everything still works; the OWNER sees
--                 a yellow "plan ended … becomes read-only on …" banner.
--   read_only     v_plan, ended 8 days ago (past the 7 days of grace). Everyone
--                 sees a red banner; every save is refused with
--                 SUBSCRIPTION_READ_ONLY. Reading, exports, removing someone from
--                 the team and clearing notifications still work.
--   cancelled     v_plan, cancelled now: read-only at once, with no grace.
--
-- v_branches (paid, no_end, grace, read_only, cancelled)
--   NULL  = exactly the trading branches the business has now, so the NEXT branch
--           is refused with PLAN_BRANCH_LIMIT — the quickest way to test the limit.
--   a number = that many. Below what is already trading is allowed here (existing
--           branches keep working, new ones are refused), though set-plan.js
--           refuses it. Warehouses and closed branches never count.
--
-- Every change is also written to billing_events with actor 'dev-sql', the same
-- trail set-plan.js leaves, so the history in Prisma Studio stays honest.
-- It only ever touches the matched business's `subscriptions` row and adds a
-- `billing_events` row; it never edits branches, members or business data.
-- =============================================================================

DO $plan$
DECLARE
  -- ---- Settings -------------------------------------------------------------
  v_email     text := 'vatsaltailor178@gmail.com';  -- somebody in the business
  v_business  text := '%thindi%';  -- which of their businesses (case-insensitive, % = anything)
  v_state     text := 'show';      -- show | trial | trial_ending | paid | no_end | grace | read_only | cancelled
  v_plan      text := 'GROWTH';    -- STARTER | GROWTH | FRANCHISE  (ignored by the two trial states)
  v_branches  int  := NULL;        -- branches paid for; NULL = exactly the ones trading now

  -- The only database this will change. The hosted one may share the name, so
  -- check which server you are connected to as well.
  v_dev_database text := 'buisnessops';

  -- ---- Working state --------------------------------------------------------
  -- Prisma stores every DateTime as UTC in a column without a time zone, so
  -- "now" is taken in UTC, never in the session's own zone.
  v_now          timestamp := now() AT TIME ZONE 'UTC';
  v_business_id  text;
  v_business_name text;
  v_matches      int;
  v_in_use       int;
  v_status       text;
  v_interval     text;
  v_trial_end    timestamp;
  v_period_end   timestamp;
  v_paid         int;
  v_event        text;
BEGIN
  -- The SELECT after this block reads the email from here, so it is set even
  -- for `show`.
  PERFORM set_config('dev_plan.email', v_email, false);

  IF current_database() <> v_dev_database THEN
    RAISE EXCEPTION 'This script only changes the development database "%". You are connected to "%"; nothing was changed.',
      v_dev_database, current_database();
  END IF;

  IF v_state = 'show' THEN
    RETURN;
  END IF;

  IF v_state NOT IN ('trial', 'trial_ending', 'paid', 'no_end', 'grace', 'read_only', 'cancelled') THEN
    RAISE EXCEPTION 'Unknown v_state "%". Use one of: show, trial, trial_ending, paid, no_end, grace, read_only, cancelled.', v_state;
  END IF;
  IF v_plan NOT IN ('STARTER', 'GROWTH', 'FRANCHISE') THEN
    RAISE EXCEPTION 'Unknown v_plan "%". Use STARTER, GROWTH or FRANCHISE.', v_plan;
  END IF;

  -- ===========================================================================
  -- 1. Which business
  -- ===========================================================================
  SELECT count(*), min(b.id), min(b.name)
    INTO v_matches, v_business_id, v_business_name
    FROM users u
    JOIN memberships m ON m."userId" = u.id AND m.status = 'ACTIVE'
    JOIN businesses b ON b.id = m."businessId"
   WHERE lower(u.email) = lower(v_email)
     AND b.name ILIKE v_business;

  IF v_matches = 0 THEN
    RAISE EXCEPTION 'No business of % matches "%". Their businesses: %.',
      v_email, v_business,
      COALESCE((SELECT string_agg(b.name, ', ' ORDER BY b.name)
                  FROM users u
                  JOIN memberships m ON m."userId" = u.id AND m.status = 'ACTIVE'
                  JOIN businesses b ON b.id = m."businessId"
                 WHERE lower(u.email) = lower(v_email)),
               'none — check the email');
  ELSIF v_matches > 1 THEN
    RAISE EXCEPTION '% of %''s businesses match "%": %. Make v_business narrower.',
      v_matches, v_email, v_business,
      (SELECT string_agg(b.name, ', ' ORDER BY b.name)
         FROM users u
         JOIN memberships m ON m."userId" = u.id AND m.status = 'ACTIVE'
         JOIN businesses b ON b.id = m."businessId"
        WHERE lower(u.email) = lower(v_email) AND b.name ILIKE v_business);
  END IF;

  -- Trading branches in use: what the plan pays for (subscription.service.js's
  -- BILLED_BRANCH). Warehouses are free; INACTIVE and CLOSED branches are not billed.
  SELECT count(*) INTO v_in_use
    FROM branches
   WHERE "businessId" = v_business_id AND kind = 'BRANCH' AND status = 'ACTIVE';

  -- ===========================================================================
  -- 2. What the chosen state means
  -- ===========================================================================
  IF v_state IN ('trial', 'trial_ending') THEN
    v_plan       := 'FRANCHISE';          -- a trial is always of the top plan
    v_status     := 'TRIALING';
    v_interval   := NULL;
    v_paid       := NULL;                 -- no branch limit during a trial
    v_trial_end  := v_now + CASE v_state WHEN 'trial' THEN interval '30 days' ELSE interval '3 days' END;
    v_period_end := NULL;
    v_event      := 'TRIAL_STARTED';
  ELSE
    v_status     := CASE v_state WHEN 'cancelled' THEN 'CANCELLED' ELSE 'ACTIVE' END;
    v_interval   := CASE v_state WHEN 'no_end' THEN NULL ELSE 'YEARLY' END;
    v_paid       := GREATEST(COALESCE(v_branches, v_in_use), 1);
    v_trial_end  := NULL;
    v_period_end := CASE v_state
                      WHEN 'paid'      THEN v_now + interval '1 year'
                      WHEN 'no_end'    THEN NULL
                      WHEN 'grace'     THEN v_now - interval '2 days'   -- inside the 7 days of grace
                      WHEN 'read_only' THEN v_now - interval '8 days'   -- past them
                      WHEN 'cancelled' THEN v_now                       -- stopped now; no grace follows
                    END;
    v_event      := CASE v_state WHEN 'cancelled' THEN 'CANCELLED' ELSE 'PLAN_SET' END;

    IF v_paid < v_in_use THEN
      RAISE NOTICE 'Paying for % branch(es) while % are trading: the existing ones keep working and a new one is refused. set-plan.js would refuse this.',
        v_paid, v_in_use;
    END IF;
  END IF;

  -- ===========================================================================
  -- 3. Write it — the subscription, and the event that says how it got there
  -- ===========================================================================
  INSERT INTO subscriptions
    (id, "businessId", plan, status, "interval", "paidBranchCount", "trialEndsAt", "currentPeriodEnd", "createdAt", "updatedAt")
  VALUES
    (gen_random_uuid()::text, v_business_id, v_plan::"SubscriptionPlan", v_status::"SubscriptionStatus",
     v_interval::"BillingInterval", v_paid, v_trial_end, v_period_end, v_now, v_now)
  ON CONFLICT ("businessId") DO UPDATE SET
    plan               = EXCLUDED.plan,
    status             = EXCLUDED.status,
    "interval"         = EXCLUDED."interval",
    "paidBranchCount"  = EXCLUDED."paidBranchCount",
    "trialEndsAt"      = EXCLUDED."trialEndsAt",
    "currentPeriodEnd" = EXCLUDED."currentPeriodEnd",
    "updatedAt"        = EXCLUDED."updatedAt";

  INSERT INTO billing_events
    (id, "businessId", type, plan, "paidBranchCount", "interval", "periodEnd", note, actor, "createdAt")
  VALUES
    (gen_random_uuid()::text, v_business_id, v_event::"BillingEventType", v_plan::"SubscriptionPlan", v_paid,
     v_interval::"BillingInterval", COALESCE(v_trial_end, v_period_end),
     'dev-plan.sql: ' || v_state, 'dev-sql', v_now);

  RAISE NOTICE '% is now: % %, % (branches paid for: %, trading now: %).',
    v_business_name, v_plan, v_status, v_state, COALESCE(v_paid::text, 'no limit'), v_in_use;
END
$plan$;

-- =============================================================================
-- Where every business of that email stands now. `state` is worked out the way
-- the server does it on each request (src/billing/access.js); dates are shown
-- in India time.
-- =============================================================================
SELECT b.name                                            AS business,
       m.role                                            AS their_role,
       s.plan,
       s.status,
       CASE
         WHEN s.id IS NULL                                  THEN 'READ_ONLY (no subscription row)'
         WHEN s.status = 'CANCELLED'                        THEN 'READ_ONLY'
         WHEN e.ends_at IS NULL OR e.now_utc < e.ends_at    THEN 'FULL'
         WHEN e.now_utc < e.ends_at + interval '7 days'     THEN 'GRACE'
         ELSE                                                    'READ_ONLY'
       END                                               AS state,
       CASE
         WHEN s.id IS NOT NULL AND e.ends_at IS NULL THEN 'never'
         ELSE to_char((e.ends_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH12:MI AM')
       END                                               AS ends,
       CASE
         WHEN s.status = 'CANCELLED'                   THEN 'already (cancelled)'
         WHEN s.id IS NOT NULL AND e.ends_at IS NULL   THEN 'never'
         ELSE to_char(((e.ends_at + interval '7 days') AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY HH12:MI AM')
       END                                               AS read_only_from,
       COALESCE(s."paidBranchCount"::text, 'no limit')   AS branches_paid_for,
       (SELECT count(*) FROM branches br
         WHERE br."businessId" = b.id AND br.kind = 'BRANCH' AND br.status = 'ACTIVE')
                                                         AS trading_branches,
       b.id                                              AS business_id
  FROM users u
  JOIN memberships m ON m."userId" = u.id AND m.status = 'ACTIVE'
  JOIN businesses b ON b.id = m."businessId"
  LEFT JOIN subscriptions s ON s."businessId" = b.id
 CROSS JOIN LATERAL (
       SELECT now() AT TIME ZONE 'UTC' AS now_utc,
              CASE WHEN s.status = 'TRIALING' THEN s."trialEndsAt" ELSE s."currentPeriodEnd" END AS ends_at
       ) e
 WHERE lower(u.email) = lower(current_setting('dev_plan.email', true))
 ORDER BY b.name;
