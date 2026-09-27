-- =============================================================================
-- BizIQ — seven months of test data for two businesses
-- =============================================================================
--
-- Run the whole file in a query tool (pgAdmin, DBeaver, psql) connected to the
-- development database `buisnessops`. It is one DO block followed by one SELECT:
--
--   * The DO block writes everything or nothing — any error rolls all of it back.
--   * The SELECT prints, month by month, the figures the Reports tab will show.
--
-- Safe to re-run. Every row this script writes has an id beginning `5eed5eed-`,
-- and the first thing it does is delete those rows, so a second run replaces the
-- first instead of doubling it. Set `v_remove_only := true` below to delete them
-- and stop there.
--
-- It never edits or deletes a row it did not write: users, memberships,
-- branches, expense categories and everything you entered by hand stay as they
-- are, and are counted when the net-profit targets are hit.
--
-- What it writes, and why every number is what it is: Docs/TEST_DATA_SEED.md.
-- =============================================================================

DO $seed$
DECLARE
  -- ---- Settings -------------------------------------------------------------
  v_owner_email  text    := 'vatsaltailor178@gmail.com';
  v_month_count  int     := 7;            -- this month and the six before it
  v_a_pattern    text    := '%thindi%';   -- business A ("Puma thindi")
  v_a_target     numeric := 40000;        -- A: the BUSINESS's net profit, every month
  v_b_pattern    text    := 'shriman%';   -- business B ("Shriman amrutulya")
  v_b_target     numeric := 18000;        -- B: its first BRANCH's net profit, every month
  v_remove_only  boolean := false;        -- true: delete this script's rows and stop

  -- ---- Working state --------------------------------------------------------
  v_owner_user   text;
  v_now_utc      timestamp := now() AT TIME ZONE 'UTC';
  v_row          record;
BEGIN
  -- ===========================================================================
  -- 0. Helpers (temporary: they vanish when the session ends)
  -- ===========================================================================

  -- Every id this script writes starts with 5eed5eed-, which is how the next run
  -- finds and removes it. The rest is a real v4 UUID.
  CREATE OR REPLACE FUNCTION pg_temp.seed_id() RETURNS text
    LANGUAGE sql VOLATILE
    AS $f$ SELECT '5eed5eed' || substr(gen_random_uuid()::text, 9) $f$;

  -- A branch's wall-clock time -> the UTC timestamp Prisma stores in a DateTime.
  CREATE OR REPLACE FUNCTION pg_temp.utc(local_ts timestamp, tz text) RETURNS timestamp
    LANGUAGE sql STABLE
    AS $f$ SELECT (local_ts AT TIME ZONE tz) AT TIME ZONE 'UTC' $f$;

  -- The reverse: which calendar day a stored instant fell on at the branch.
  CREATE OR REPLACE FUNCTION pg_temp.local_day(utc_ts timestamp, tz text) RETURNS date
    LANGUAGE sql STABLE
    AS $f$ SELECT ((utc_ts AT TIME ZONE 'UTC') AT TIME ZONE tz)::date $f$;

  -- Working tables left over from an earlier run in this same session.
  FOR v_row IN
    SELECT c.relname FROM pg_class c
     WHERE c.relnamespace = pg_my_temp_schema() AND c.relkind = 'r' AND c.relname LIKE 'seed\_%'
  LOOP
    EXECUTE format('DROP TABLE pg_temp.%I', v_row.relname);
  END LOOP;

  -- ===========================================================================
  -- 1. Remove what an earlier run wrote
  -- ===========================================================================

  -- Remember which token days and which order books those rows used, so their
  -- counters can be handed back below. Only those: counters this script never
  -- touched are left exactly as they are.
  CREATE TEMP TABLE seed_freed_days ON COMMIT DROP AS
  SELECT DISTINCT "branchId" AS branch_id, "tokenDate" AS token_date
    FROM counter_orders WHERE id LIKE '5eed5eed-%';
  CREATE TEMP TABLE seed_freed_books ON COMMIT DROP AS
  SELECT DISTINCT "businessId" AS business_id
    FROM supply_orders WHERE id LIKE '5eed5eed-%';

  DELETE FROM counter_orders         WHERE id LIKE '5eed5eed-%';  -- + counter_order_items
  DELETE FROM transactions           WHERE id LIKE '5eed5eed-%';  -- + line_items
  DELETE FROM supply_orders          WHERE id LIKE '5eed5eed-%';  -- + items and events
  DELETE FROM expenses               WHERE id LIKE '5eed5eed-%';
  DELETE FROM day_closes             WHERE id LIKE '5eed5eed-%';
  DELETE FROM salary_slips           WHERE id LIKE '5eed5eed-%';
  DELETE FROM attendance             WHERE id LIKE '5eed5eed-%';
  DELETE FROM holidays               WHERE id LIKE '5eed5eed-%';
  DELETE FROM staff_members          WHERE id LIKE '5eed5eed-%';
  DELETE FROM product_branch_details WHERE id LIKE '5eed5eed-%';
  DELETE FROM products               WHERE id LIKE '5eed5eed-%';
  DELETE FROM inventory_items        WHERE id LIKE '5eed5eed-%';

  -- The next real token or order number continues from the last one that still
  -- exists, rather than from a number nobody holds any more.
  DELETE FROM branch_token_counters c
   USING seed_freed_days f
   WHERE c."branchId" = f.branch_id AND c."tokenDate" = f.token_date
     AND NOT EXISTS (SELECT 1 FROM counter_orders o
                      WHERE o."branchId" = c."branchId" AND o."tokenDate" = c."tokenDate");
  UPDATE branch_token_counters c
     SET "lastNumber" = (SELECT max(o."tokenNumber") FROM counter_orders o
                          WHERE o."branchId" = c."branchId" AND o."tokenDate" = c."tokenDate")
    FROM seed_freed_days f
   WHERE c."branchId" = f.branch_id AND c."tokenDate" = f.token_date;
  UPDATE supply_order_counters c
     SET "lastNumber" = COALESCE((SELECT max(o."orderNumber") FROM supply_orders o
                                   WHERE o."businessId" = c."businessId"), 0)
    FROM seed_freed_books f
   WHERE c."businessId" = f.business_id;

  IF v_remove_only THEN
    RAISE NOTICE 'Removed every row this script had written. Nothing new was added.';
    RETURN;
  END IF;

  -- ===========================================================================
  -- 2. The two businesses, their branches and their people
  -- ===========================================================================

  SELECT id INTO v_owner_user FROM users WHERE lower(email) = lower(v_owner_email);
  IF v_owner_user IS NULL THEN
    RAISE EXCEPTION 'No BizIQ account uses the email %', v_owner_email;
  END IF;

  CREATE TEMP TABLE seed_biz (
    tag text, business_id text, name text, owner_mid text, tz text, currency text,
    weekly_off int[], unmarked text, target numeric, level text,
    today date, start_date date, warehouse_mid text, has_warehouse boolean,
    target_branch text, order_base int
  ) ON COMMIT DROP;

  FOR v_row IN
    SELECT * FROM (VALUES ('A', v_a_pattern, v_a_target, 'BUSINESS'),
                          ('B', v_b_pattern, v_b_target, 'BRANCH')) AS t(tag, pattern, target, level)
  LOOP
    INSERT INTO seed_biz (tag, business_id, name, owner_mid, tz, currency, weekly_off, unmarked, target, level)
    SELECT v_row.tag, b.id, b.name, m.id, b.timezone, b."defaultCurrency", b."weeklyOffDays",
           b."unmarkedWorkingDayStatus"::text, v_row.target, v_row.level
      FROM businesses b
      JOIN memberships m ON m."businessId" = b.id
     WHERE m."userId" = v_owner_user AND m.role = 'OWNER' AND m.status = 'ACTIVE'
       AND b.name ILIKE v_row.pattern
     ORDER BY b."createdAt"
     LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION '% owns no business whose name matches "%"', v_owner_email, v_row.pattern;
    END IF;
  END LOOP;

  -- "Today" is the business's own calendar day, never the server's.
  UPDATE seed_biz SET today = (now() AT TIME ZONE tz)::date;
  UPDATE seed_biz SET start_date = (date_trunc('month', today::timestamp)
                                    - (v_month_count - 1) * interval '1 month')::date;

  -- Every active branch. Shops are ranked by age: the oldest is shop 1.
  CREATE TEMP TABLE seed_branch ON COMMIT DROP AS
  SELECT br.id AS branch_id, sb.business_id, sb.tag, br.name, br.kind::text AS kind,
         br.timezone AS tz, COALESCE(br.currency, sb.currency) AS currency,
         br.latitude AS lat, br.longitude AS lng,
         CASE WHEN br."weeklyOffOverride" THEN br."weeklyOffDays" ELSE sb.weekly_off END AS weekly_off,
         CASE WHEN br.kind = 'BRANCH'
              THEN row_number() OVER (PARTITION BY sb.business_id, br.kind ORDER BY br."createdAt", br.code)
         END AS shop_rank,
         (SELECT m.id FROM branch_access ba JOIN memberships m ON m.id = ba."membershipId"
           WHERE ba."branchId" = br.id AND m.role = 'CASHIER' AND m.status = 'ACTIVE'
           ORDER BY m."createdAt" LIMIT 1) AS cashier_mid,
         sb.owner_mid
    FROM seed_biz sb
    JOIN branches br ON br."businessId" = sb.business_id AND br.status = 'ACTIVE';

  -- What each branch spends on the fixed bills. A warehouse sells nothing and
  -- buys no milk; it pays rent, power, fuel and the wholesale stock bill.
  -- `weight` is a shop's share of its business's sales: shop 1 is a little busier.
  ALTER TABLE seed_branch
    ADD COLUMN rent numeric, ADD COLUMN milk numeric, ADD COLUMN power numeric, ADD COLUMN counter_mid text,
    ADD COLUMN weight numeric;
  UPDATE seed_branch SET
    weight = CASE WHEN kind = 'WAREHOUSE' THEN NULL WHEN shop_rank = 1 THEN 1.15 ELSE 1.0 END,
    rent  = CASE WHEN kind = 'WAREHOUSE' THEN 10000
                 WHEN tag = 'A' THEN CASE WHEN shop_rank = 1 THEN 15000 ELSE 12000 END
                 ELSE CASE WHEN shop_rank = 1 THEN 9000 ELSE 8000 END END,
    milk  = CASE WHEN kind = 'WAREHOUSE' THEN 0
                 WHEN tag = 'A' THEN CASE WHEN shop_rank = 1 THEN 1300 ELSE 1200 END
                 ELSE CASE WHEN shop_rank = 1 THEN 900 ELSE 800 END END,
    power = CASE WHEN kind = 'WAREHOUSE' THEN 2000
                 WHEN tag = 'A' THEN CASE WHEN shop_rank = 1 THEN 3600 ELSE 3200 END
                 ELSE CASE WHEN shop_rank = 1 THEN 2400 ELSE 2200 END END,
    -- Whoever works the till: the branch's cashier, or the owner where there is none.
    counter_mid = COALESCE(cashier_mid, owner_mid);

  IF EXISTS (SELECT 1 FROM seed_biz sb
              WHERE NOT EXISTS (SELECT 1 FROM seed_branch b
                                 WHERE b.business_id = sb.business_id AND b.kind = 'BRANCH')) THEN
    RAISE EXCEPTION 'Each business needs at least one active shop (a branch that is not a warehouse)';
  END IF;

  UPDATE seed_biz sb SET
    warehouse_mid = COALESCE((SELECT m.id FROM memberships m
                               WHERE m."businessId" = sb.business_id AND m.role = 'WAREHOUSE' AND m.status = 'ACTIVE'
                               ORDER BY m."createdAt" LIMIT 1), sb.owner_mid),
    has_warehouse = EXISTS (SELECT 1 FROM seed_branch b
                             WHERE b.business_id = sb.business_id AND b.kind = 'WAREHOUSE'),
    target_branch = CASE WHEN sb.level = 'BRANCH'
                         THEN (SELECT b.branch_id FROM seed_branch b
                                WHERE b.business_id = sb.business_id AND b.shop_rank = 1) END,
    -- Supply order numbers continue after the highest one already issued.
    order_base = GREATEST(
      COALESCE((SELECT c."lastNumber" FROM supply_order_counters c WHERE c."businessId" = sb.business_id), 0),
      COALESCE((SELECT max(o."orderNumber") FROM supply_orders o WHERE o."businessId" = sb.business_id), 0));

  -- Delivery agents, numbered 1..n by name so runs can be shared out between them.
  CREATE TEMP TABLE seed_agent ON COMMIT DROP AS
  SELECT m."businessId" AS business_id, m.id AS mid, u.name,
         row_number() OVER (PARTITION BY m."businessId" ORDER BY u.name, u.email) AS n,
         count(*) OVER (PARTITION BY m."businessId") AS of_n
    FROM memberships m JOIN users u ON u.id = m."userId"
   WHERE m."businessId" IN (SELECT business_id FROM seed_biz)
     AND m.role = 'DELIVERY_AGENT' AND m.status = 'ACTIVE';

  -- One row per branch per day, from the first day of the window to today.
  CREATE TEMP TABLE seed_day ON COMMIT DROP AS
  SELECT b.branch_id, b.business_id, gs.ts::date AS d, extract(dow FROM gs.ts)::int AS dow,
         date_trunc('month', gs.ts)::date AS month_start, (gs.ts::date = sb.today) AS is_today
    FROM seed_branch b
    JOIN seed_biz sb ON sb.business_id = b.business_id
    CROSS JOIN LATERAL generate_series(sb.start_date::timestamp, sb.today::timestamp, interval '1 day') AS gs(ts);

  -- Expense categories are seeded with every business; find them by code.
  CREATE TEMP TABLE seed_cat ON COMMIT DROP AS
  SELECT c."businessId" AS business_id, c.code, c.id
    FROM expense_categories c
   WHERE c."businessId" IN (SELECT business_id FROM seed_biz) AND c.code IS NOT NULL;

  IF EXISTS (SELECT 1 FROM seed_biz sb
               CROSS JOIN (VALUES ('MILK'), ('GAS'), ('ELECTRICITY'), ('RENT'), ('REPAIRS'),
                                  ('TRANSPORT'), ('PETTY'), ('OTHER')) AS need(code)
              WHERE NOT EXISTS (SELECT 1 FROM seed_cat c
                                 WHERE c.business_id = sb.business_id AND c.code = need.code)) THEN
    RAISE EXCEPTION 'A business is missing one of its standard expense categories';
  END IF;

  -- ===========================================================================
  -- 3. The menu each shop sells
  -- ===========================================================================

  -- `weight` is how often an item is ordered. A name the business already sells
  -- (your own "Masala chai", say) is reused with your price, not duplicated.
  -- `only_shop` makes a product that one shop's own (requirement 4).
  CREATE TEMP TABLE seed_menu ON COMMIT DROP AS
  SELECT sb.business_id, v.tag, v.name, v.sku, v.category, v.unit,
         v.cost::numeric AS cost, v.sell::numeric AS sell, v.weight::numeric AS weight, v.only_shop,
         (SELECT p.id FROM products p
           WHERE p."businessId" = sb.business_id AND p."branchId" IS NULL AND p."isActive"
             AND p."sellPrice" IS NOT NULL AND lower(p.name) = lower(v.name)
           ORDER BY p."createdAt" LIMIT 1) AS existing_id,
         NULL::text AS product_id, NULL::text AS only_branch
    FROM (VALUES
      ('A', 'Masala Chai',        'PT-MCH', 'Chai',      'Cup',   10, 25, 26, NULL::int),
      ('A', 'Cutting Chai',       'PT-CUT', 'Chai',      'Cup',    6, 15, 20, NULL),
      ('A', 'Ginger Tea',         'PT-GIN', 'Chai',      'Cup',    8, 20,  8, NULL),
      ('A', 'Lemon Tea',          'PT-LEM', 'Chai',      'Cup',    8, 20,  6, NULL),
      ('A', 'Cold Coffee',        'PT-CCF', 'Coffee',    'Glass', 25, 60,  4, NULL),
      ('A', 'Vada Pav',           'PT-VDP', 'Snacks',    'Plate', 10, 25, 10, NULL),
      ('A', 'Maska Bun',          'PT-MBN', 'Snacks',    'Piece', 12, 30,  6, NULL),
      ('A', 'Kanda Bhaji',        'PT-KBJ', 'Snacks',    'Plate', 20, 50,  3, NULL),
      ('A', 'Sabudana Vada',      'PT-SBV', 'Snacks',    'Plate', 18, 45,  3, NULL),
      ('A', 'Poha',               'PT-POH', 'Breakfast', 'Plate', 15, 40,  6, NULL),
      ('A', 'Misal Pav',          'PT-MSL', 'Breakfast', 'Plate', 35, 80,  4, NULL),
      ('A', 'Surati Locho',       'PT-LOC', 'Snacks',    'Plate', 25, 60,  4, 2),
      ('B', 'Amruttulya Special', 'SA-SPL', 'Chai',      'Cup',    6, 15, 34, NULL),
      ('B', 'Masala Chai',        'SA-MCH', 'Chai',      'Cup',    8, 20, 18, NULL),
      ('B', 'Ginger Chai',        'SA-GIN', 'Chai',      'Cup',    8, 20, 14, NULL),
      ('B', 'Lemon Tea',          'SA-LEM', 'Chai',      'Cup',    7, 15,  6, NULL),
      ('B', 'Black Coffee',       'SA-COF', 'Coffee',    'Cup',   10, 25,  6, NULL),
      ('B', 'Bun Maska',          'SA-BMS', 'Snacks',    'Piece', 12, 30, 10, NULL),
      ('B', 'Khari',              'SA-KHR', 'Snacks',    'Piece',  6, 15,  6, NULL),
      ('B', 'Toast Butter',       'SA-TST', 'Snacks',    'Plate', 10, 25,  6, NULL)
    ) AS v(tag, name, sku, category, unit, cost, sell, weight, only_shop)
    JOIN seed_biz sb ON sb.tag = v.tag;

  UPDATE seed_menu SET product_id = COALESCE(existing_id, pg_temp.seed_id());
  UPDATE seed_menu m SET sell = p."sellPrice", cost = p."costPrice"
    FROM products p WHERE p.id = m.existing_id;
  UPDATE seed_menu m SET only_branch = b.branch_id
    FROM seed_branch b
   WHERE m.only_shop IS NOT NULL AND b.business_id = m.business_id AND b.shop_rank = m.only_shop;

  INSERT INTO products (id, "businessId", "branchId", name, sku, category, unit,
                        "costPrice", "sellPrice", "isActive", "createdAt", "updatedAt")
  SELECT m.product_id, m.business_id, m.only_branch, m.name, m.sku, m.category, m.unit,
         m.cost, m.sell, true, pg_temp.utc(sb.start_date - 7 + time '10:00', sb.tz),
         pg_temp.utc(sb.start_date - 7 + time '10:00', sb.tz)
    FROM seed_menu m JOIN seed_biz sb ON sb.business_id = m.business_id
   WHERE m.existing_id IS NULL;

  -- One branch price override: shop 2 of business A charges 18 for a cutting chai.
  INSERT INTO product_branch_details (id, "productId", "branchId", "costPrice", "sellPrice", "isActive")
  SELECT pg_temp.seed_id(), m.product_id, b.branch_id, o.cost, o.sell, true
    FROM (VALUES ('A', 'Cutting Chai', 2, 6, 18)) AS o(tag, name, shop_rank, cost, sell)
    JOIN seed_menu m ON m.tag = o.tag AND m.name = o.name AND m.existing_id IS NULL
    JOIN seed_branch b ON b.tag = o.tag AND b.shop_rank = o.shop_rank;

  -- The price each shop actually charges, and a cumulative weight band per item
  -- so a random number between 0 and 1 picks an item in proportion to its weight.
  CREATE TEMP TABLE seed_price ON COMMIT DROP AS
  SELECT b.branch_id, m.product_id, m.name, m.weight, COALESCE(d."sellPrice", m.sell) AS price,
         NULL::numeric AS cum_lo, NULL::numeric AS cum_hi
    FROM seed_branch b
    JOIN seed_menu m ON m.business_id = b.business_id AND (m.only_branch IS NULL OR m.only_branch = b.branch_id)
    LEFT JOIN product_branch_details d ON d."productId" = m.product_id AND d."branchId" = b.branch_id
   WHERE b.kind = 'BRANCH' AND (d.id IS NULL OR d."isActive");

  UPDATE seed_price p SET cum_lo = q.lo, cum_hi = q.hi
    FROM (SELECT branch_id, product_id,
                 (sum(weight) OVER w - weight) / sum(weight) OVER (PARTITION BY branch_id) AS lo,
                 sum(weight) OVER w / sum(weight) OVER (PARTITION BY branch_id) AS hi
            FROM seed_price
          WINDOW w AS (PARTITION BY branch_id ORDER BY product_id ROWS UNBOUNDED PRECEDING)) q
   WHERE p.branch_id = q.branch_id AND p.product_id = q.product_id;

  -- ===========================================================================
  -- 4. Holidays, staff, attendance and payslips
  -- ===========================================================================

  -- National holidays that fall in the window, business-wide and paid.
  INSERT INTO holidays (id, "businessId", "branchId", "date", name, "isPaid", "createdAt")
  SELECT pg_temp.seed_id(), sb.business_id, NULL, h.d, h.name, true, v_now_utc
    FROM seed_biz sb
    CROSS JOIN LATERAL (
      SELECT make_date(y.yr, hm.mon, hm.dom) AS d, hm.name
        FROM generate_series(extract(year FROM sb.start_date)::int, extract(year FROM sb.today)::int) AS y(yr)
       CROSS JOIN (VALUES (1, 26, 'Republic Day'), (8, 15, 'Independence Day'),
                          (10, 2, 'Gandhi Jayanti')) AS hm(mon, dom, name)
    ) h
   WHERE h.d BETWEEN sb.start_date AND (date_trunc('month', sb.today::timestamp) + interval '1 month' - interval '1 day')::date
     AND NOT EXISTS (SELECT 1 FROM holidays x WHERE x."businessId" = sb.business_id AND x.date = h.d);

  -- Staff with no app login — a helper, a cook, a tea master. Payroll and the
  -- Staff tab treat them exactly like people who do log in.
  INSERT INTO staff_members (id, "businessId", "branchId", "userId", name, role, "baseSalary", status,
                             "employeeCode", "hiredOn")
  SELECT pg_temp.seed_id(), b.business_id, b.branch_id, NULL, s.name, s.role, s.salary, 'ACTIVE',
         s.code, sb.start_date - 90
    FROM (VALUES ('A', 1, 'Ramu Yadav',   'Helper',        12000, 'PT-101'),
                 ('A', 2, 'Kishan Patel', 'Cook',          14000, 'PT-102'),
                 ('B', 1, 'Ganesh More',  'Tea master',    15000, 'SA-101'),
                 ('B', 1, 'Sunil Jadhav', 'Helper',        11000, 'SA-102'),
                 ('B', 1, 'Pooja Shinde', 'Counter staff', 12000, 'SA-103')
         ) AS s(tag, shop_rank, name, role, salary, code)
    JOIN seed_branch b ON b.tag = s.tag AND b.shop_rank = s.shop_rank
    JOIN seed_biz sb ON sb.business_id = b.business_id
   WHERE NOT EXISTS (SELECT 1 FROM staff_members x
                      WHERE x."businessId" = b.business_id AND lower(x.name) = lower(s.name));

  -- Everyone on payroll in either business: the people above and those already
  -- there (the warehouse, the cashiers, the delivery agents).
  CREATE TEMP TABLE seed_staff ON COMMIT DROP AS
  SELECT s.id AS staff_id, s."businessId" AS business_id, s."branchId" AS branch_id,
         s."baseSalary" AS base, s."hiredOn" AS hired_on, s."exitedOn" AS exited_on,
         b.tz, b.lat, b.lng, b.weekly_off, b.owner_mid
    FROM staff_members s JOIN seed_branch b ON b.branch_id = s."branchId"
   WHERE s.status = 'ACTIVE' AND s."baseSalary" IS NOT NULL;

  -- Their working days: not a weekly off, not a holiday, inside employment.
  CREATE TEMP TABLE seed_workday ON COMMIT DROP AS
  SELECT st.staff_id, st.business_id, st.branch_id, st.tz, st.lat, st.lng, st.owner_mid,
         dd.d, dd.is_today, random() AS r_status, random() AS r_in, random() AS r_out
    FROM seed_staff st
    JOIN seed_day dd ON dd.branch_id = st.branch_id
   WHERE NOT (dd.dow = ANY (st.weekly_off))
     AND NOT EXISTS (SELECT 1 FROM holidays h
                      WHERE h."businessId" = st.business_id AND h.date = dd.d
                        AND (h."branchId" IS NULL OR h."branchId" = st.branch_id))
     AND (st.hired_on IS NULL OR dd.d >= st.hired_on)
     AND (st.exited_on IS NULL OR dd.d <= st.exited_on);

  -- Mostly present with a punch in and out at the branch; now and then absent,
  -- on leave or a half day, marked by the owner. Today: punched in, not out yet.
  -- A day that already has an attendance row keeps it.
  INSERT INTO attendance (id, "businessId", "branchId", "staffMemberId", "date", status,
                          "punchInAt", "punchInLat", "punchInLng",
                          "punchOutAt", "punchOutLat", "punchOutLng",
                          "markedByMembershipId", "createdAt", "updatedAt")
  SELECT pg_temp.seed_id(), a.business_id, a.branch_id, a.staff_id, a.d, a.status::"AttendanceStatus",
         a.punch_in,  CASE WHEN a.punch_in  IS NOT NULL THEN a.lat END, CASE WHEN a.punch_in  IS NOT NULL THEN a.lng END,
         a.punch_out, CASE WHEN a.punch_out IS NOT NULL THEN a.lat END, CASE WHEN a.punch_out IS NOT NULL THEN a.lng END,
         CASE WHEN a.status IN ('ABSENT', 'LEAVE') THEN a.owner_mid END,
         COALESCE(a.punch_in, pg_temp.utc(a.d + time '10:00', a.tz)),
         COALESCE(a.punch_out, a.punch_in, pg_temp.utc(a.d + time '10:00', a.tz))
    FROM (
      SELECT w.*,
             CASE WHEN w.status IN ('PRESENT', 'HALF_DAY')
                  THEN pg_temp.utc(w.d + time '08:45' + (30 * w.r_in) * interval '1 minute', w.tz) END AS punch_in,
             CASE WHEN w.is_today THEN NULL
                  WHEN w.status = 'PRESENT'
                  THEN pg_temp.utc(w.d + time '20:30' + (60 * w.r_out) * interval '1 minute', w.tz)
                  WHEN w.status = 'HALF_DAY'
                  THEN pg_temp.utc(w.d + time '14:00' + (30 * w.r_out) * interval '1 minute', w.tz) END AS punch_out
        FROM (SELECT wd.*,
                     CASE WHEN wd.is_today       THEN 'PRESENT'
                          WHEN wd.r_status < 0.02 THEN 'ABSENT'
                          WHEN wd.r_status < 0.05 THEN 'LEAVE'
                          WHEN wd.r_status < 0.08 THEN 'HALF_DAY'
                          ELSE 'PRESENT' END AS status
                FROM seed_workday wd) w
    ) a
   WHERE a.punch_in IS NULL OR a.punch_in <= v_now_utc
  ON CONFLICT ("staffMemberId", "date") DO NOTHING;

  -- Payslips, computed exactly as payroll.service.js does:
  --   workingDays = days in the month - weekly offs - holidays
  --   worked      = present + half a day for each half day
  --   pay         = base salary / workingDays x worked, to the paisa
  -- A day with no attendance row counts as the business's "unmarked" status, and
  -- a working day still ahead is pending. Past months are FINALIZED; this month
  -- is a DRAFT, which the Reports screen flags as provisional.
  CREATE TEMP TABLE seed_payday ON COMMIT DROP AS
  SELECT st.staff_id, st.business_id, st.branch_id, st.base, st.tz, st.hired_on, st.exited_on,
         gs.ts::date AS d, date_trunc('month', gs.ts)::date AS month_start,
         (now() AT TIME ZONE st.tz)::date AS today,
         extract(dow FROM gs.ts)::int = ANY (st.weekly_off) AS is_off,
         EXISTS (SELECT 1 FROM holidays h
                  WHERE h."businessId" = st.business_id AND h.date = gs.ts::date
                    AND (h."branchId" IS NULL OR h."branchId" = st.branch_id)) AS is_holiday
    FROM seed_staff st
    JOIN seed_biz sb ON sb.business_id = st.business_id
    CROSS JOIN LATERAL generate_series(sb.start_date::timestamp,
                                       date_trunc('month', sb.today::timestamp) + interval '1 month' - interval '1 day',
                                       interval '1 day') AS gs(ts);

  INSERT INTO salary_slips (id, "businessId", "branchId", "staffMemberId", "monthYear", "baseSalary", "workingDays",
                            "daysPresent", "daysHalfDay", "daysAbsent", "daysLeave", "daysPending",
                            "daysWeeklyOff", "daysHoliday", "totalDaysWorked", "grossPay", deductions,
                            "netPay", currency, status, "generatedAt", "finalizedAt")
  SELECT pg_temp.seed_id(), p.business_id, p.branch_id, p.staff_id, to_char(p.month_start, 'YYYY-MM'),
         p.base, p.working_days, p.present_days, p.half_days, p.absent_days, p.leave_days, p.pending_days,
         p.off_days, p.holiday_days, p.present_days + 0.5 * p.half_days,
         round(p.base * (p.present_days + 0.5 * p.half_days) / p.working_days, 2), 0,
         round(p.base * (p.present_days + 0.5 * p.half_days) / p.working_days, 2),
         sb.currency,
         (CASE WHEN p.month_start < date_trunc('month', sb.today::timestamp)::date
               THEN 'FINALIZED' ELSE 'DRAFT' END)::"SalarySlipStatus",
         CASE WHEN p.month_start < date_trunc('month', sb.today::timestamp)::date
              THEN LEAST(pg_temp.utc((p.month_start + interval '1 month')::date + time '10:00', p.tz), v_now_utc)
              ELSE v_now_utc END,
         CASE WHEN p.month_start < date_trunc('month', sb.today::timestamp)::date
              THEN LEAST(pg_temp.utc((p.month_start + interval '1 month')::date + time '11:00', p.tz), v_now_utc) END
    FROM (
      SELECT pd.staff_id, pd.business_id, pd.branch_id, pd.base, pd.tz, pd.month_start,
             count(*) FILTER (WHERE NOT pd.is_off AND NOT pd.is_holiday) AS working_days,
             count(*) FILTER (WHERE pd.is_off)            AS off_days,
             count(*) FILTER (WHERE pd.is_holiday)        AS holiday_days,
             count(*) FILTER (WHERE x.state = 'PENDING')  AS pending_days,
             count(*) FILTER (WHERE x.state = 'PRESENT')  AS present_days,
             count(*) FILTER (WHERE x.state = 'HALF_DAY') AS half_days,
             count(*) FILTER (WHERE x.state = 'ABSENT')   AS absent_days,
             count(*) FILTER (WHERE x.state = 'LEAVE')    AS leave_days
        FROM seed_payday pd
        JOIN seed_biz sb2 ON sb2.business_id = pd.business_id
        LEFT JOIN attendance a ON a."staffMemberId" = pd.staff_id AND a.date = pd.d
        CROSS JOIN LATERAL (SELECT CASE
            WHEN pd.is_off OR pd.is_holiday                         THEN NULL
            WHEN pd.hired_on  IS NOT NULL AND pd.d < pd.hired_on    THEN 'NOT_EMPLOYED'
            WHEN pd.exited_on IS NOT NULL AND pd.d > pd.exited_on   THEN 'NOT_EMPLOYED'
            WHEN pd.d > pd.today                                    THEN 'PENDING'
            ELSE COALESCE(a.status::text, sb2.unmarked) END AS state) x
       GROUP BY pd.staff_id, pd.business_id, pd.branch_id, pd.base, pd.tz, pd.month_start
    ) p
    JOIN seed_biz sb ON sb.business_id = p.business_id
   WHERE p.working_days > 0
  ON CONFLICT ("staffMemberId", "monthYear") DO NOTHING;

  -- ===========================================================================
  -- 5. Expenses
  -- ===========================================================================

  -- Daily milk and petty cash are logged by the branch's cashier (the owner on
  -- Sundays, when the cashier is off); bills by the owner. The warehouse desk
  -- does not hold expense:log, so the warehouse's costs are logged by the owner.
  -- Stock bought from outside the business is logged where it was bought: at
  -- the warehouse, or at the shop itself in a business without one.
  CREATE TEMP TABLE seed_exp (
    business_id text, branch_id text, code text, amount numeric, d date, note text,
    pay text, by_mid text, at_local time, tz text, currency text
  ) ON COMMIT DROP;

  INSERT INTO seed_exp
  SELECT b.business_id, b.branch_id, 'MILK', round(b.milk * (0.9 + 0.2 * random()) / 10) * 10, dd.d,
         'Daily milk', CASE WHEN random() < 0.5 THEN 'CASH' ELSE 'UPI' END,
         CASE WHEN dd.dow = 0 THEN b.owner_mid ELSE b.counter_mid END, time '07:15', b.tz, b.currency
    FROM seed_day dd JOIN seed_branch b ON b.branch_id = dd.branch_id
   WHERE b.kind = 'BRANCH'
  UNION ALL
  SELECT b.business_id, b.branch_id, 'RENT', b.rent, dd.d,
         CASE WHEN b.kind = 'WAREHOUSE' THEN 'Godown rent' ELSE 'Shop rent' END, 'UPI',
         b.owner_mid, time '11:00', b.tz, b.currency
    FROM seed_day dd JOIN seed_branch b ON b.branch_id = dd.branch_id
   WHERE extract(day FROM dd.d) = 1
  UNION ALL
  SELECT b.business_id, b.branch_id, 'ELECTRICITY', round(b.power * (0.85 + 0.3 * random()) / 10) * 10, dd.d,
         'Electricity bill', 'UPI', b.owner_mid, time '12:00', b.tz, b.currency
    FROM seed_day dd JOIN seed_branch b ON b.branch_id = dd.branch_id
   WHERE extract(day FROM dd.d) = 10
  UNION ALL
  SELECT b.business_id, b.branch_id, 'GAS', 1850, dd.d, 'Commercial LPG cylinder', 'CASH',
         CASE WHEN dd.dow = 0 THEN b.owner_mid ELSE b.counter_mid END, time '10:00', b.tz, b.currency
    FROM seed_day dd JOIN seed_branch b ON b.branch_id = dd.branch_id
   WHERE b.kind = 'BRANCH' AND extract(day FROM dd.d) IN (3, 13, 23)
  UNION ALL
  SELECT b.business_id, b.branch_id, 'PETTY', round((100 + 500 * random()) / 10) * 10, dd.d,
         CASE extract(day FROM dd.d)::int WHEN 7 THEN 'Cleaning supplies' WHEN 15 THEN 'Paper napkins and straws'
                                          WHEN 22 THEN 'Drinking water cans' ELSE 'Glasses and tea strainers' END,
         'CASH', CASE WHEN dd.dow = 0 THEN b.owner_mid ELSE b.counter_mid END, time '16:00', b.tz, b.currency
    FROM seed_day dd JOIN seed_branch b ON b.branch_id = dd.branch_id
   WHERE b.kind = 'BRANCH' AND extract(day FROM dd.d) IN (7, 15, 22, 28)
  UNION ALL
  SELECT b.business_id, b.branch_id, 'REPAIRS', round((800 + 1700 * random()) / 50) * 50, dd.d,
         CASE WHEN b.shop_rank % 2 = 1 THEN 'Mixer grinder repair' ELSE 'Plumbing repair' END, 'UPI',
         b.owner_mid, time '15:00', b.tz, b.currency
    FROM seed_day dd JOIN seed_branch b ON b.branch_id = dd.branch_id
   WHERE b.kind = 'BRANCH' AND extract(day FROM dd.d) = 18 AND extract(month FROM dd.d)::int % 2 = 0
  UNION ALL
  SELECT b.business_id, b.branch_id, 'OTHER', round((6000 + 2000 * random()) / 100) * 100, dd.d,
         'Wholesale stock: tea powder, sugar, spices', 'UPI', b.owner_mid, time '10:30', b.tz, b.currency
    FROM seed_day dd JOIN seed_branch b ON b.branch_id = dd.branch_id
   WHERE b.kind = 'WAREHOUSE' AND dd.dow = 1
  UNION ALL
  SELECT b.business_id, b.branch_id, 'OTHER', round((2500 + 1000 * random()) / 50) * 50, dd.d,
         'Tea powder and sugar from the market', 'CASH', b.owner_mid, time '10:30', b.tz, b.currency
    FROM seed_day dd JOIN seed_branch b ON b.branch_id = dd.branch_id
    JOIN seed_biz sb ON sb.business_id = b.business_id
   WHERE b.kind = 'BRANCH' AND dd.dow = 1 AND NOT sb.has_warehouse
  UNION ALL
  SELECT b.business_id, b.branch_id, 'TRANSPORT', round((600 + 300 * random()) / 10) * 10, dd.d,
         'Delivery bike fuel', 'CASH', b.owner_mid, time '18:00', b.tz, b.currency
    FROM seed_day dd JOIN seed_branch b ON b.branch_id = dd.branch_id
   WHERE b.kind = 'WAREHOUSE' AND dd.dow = 6
  UNION ALL
  SELECT b.business_id, b.branch_id, 'PETTY', round((200 + 300 * random()) / 10) * 10, dd.d,
         'Packing material', 'CASH', b.owner_mid, time '17:00', b.tz, b.currency
    FROM seed_day dd JOIN seed_branch b ON b.branch_id = dd.branch_id
   WHERE b.kind = 'WAREHOUSE' AND extract(day FROM dd.d) = 15;

  INSERT INTO expenses (id, "businessId", "branchId", "categoryId", amount, currency, "expenseDate", note,
                        "paymentMethod", "recordedByMembershipId", "createdAt", "updatedAt")
  SELECT pg_temp.seed_id(), e.business_id, e.branch_id, c.id, e.amount, e.currency, e.d, e.note,
         e.pay::"PaymentMethod", e.by_mid,
         LEAST(pg_temp.utc(e.d + e.at_local, e.tz), v_now_utc),
         LEAST(pg_temp.utc(e.d + e.at_local, e.tz), v_now_utc)
    FROM seed_exp e JOIN seed_cat c ON c.business_id = e.business_id AND c.code = e.code;

  -- ===========================================================================
  -- 6. Supply orders: shop -> warehouse -> delivery agent (businesses with a warehouse)
  -- ===========================================================================

  -- The raw-material catalog. An item you already priced under the same name is
  -- reused; `always` items go on every order, the rest on about a third.
  CREATE TEMP TABLE seed_item ON COMMIT DROP AS
  SELECT sb.business_id, v.name, v.unit, v.category, v.price::numeric AS price, v.qmin, v.qmax, v.always,
         (SELECT i.id FROM inventory_items i
           WHERE i."businessId" = sb.business_id AND i."isActive" AND i."unitPrice" IS NOT NULL
             AND lower(i.name) = lower(v.name) LIMIT 1) AS existing_id,
         NULL::text AS item_id
    FROM seed_biz sb
    CROSS JOIN (VALUES
      ('Tea Powder',    'Kg',          'Chai',      480, 1,  3, true),
      ('Refined Sugar', 'Kg',          'Chai',       44, 5, 12, true),
      ('Elaichi',       '100 g',       'Chai',      320, 1,  2, false),
      ('Ginger',        'Kg',          'Chai',      120, 1,  3, false),
      ('Milk Masala',   '500 g',       'Chai',      260, 1,  2, false),
      ('Poha',          'Kg',          'Food',       70, 3,  6, false),
      ('Besan',         'Kg',          'Food',       95, 2,  4, false),
      ('Pav',           'Dozen',       'Food',       48, 5, 12, false),
      ('Groundnut Oil', 'Litre',       'Food',      180, 2,  4, false),
      ('Paper Cups',    'Pack of 100', 'Packaging',  85, 3,  6, false)
    ) AS v(name, unit, category, price, qmin, qmax, always)
   WHERE sb.has_warehouse;

  UPDATE seed_item SET item_id = COALESCE(existing_id, pg_temp.seed_id());
  UPDATE seed_item s SET price = i."unitPrice", unit = i.unit FROM inventory_items i WHERE i.id = s.existing_id;

  INSERT INTO inventory_items (id, "businessId", name, unit, category, "unitPrice", "isActive")
  SELECT item_id, business_id, name, unit, category, price, true FROM seed_item WHERE existing_id IS NULL;

  CREATE TEMP TABLE seed_so (
    order_id text, business_id text, branch_id text, tz text, currency text,
    placed_by text, warehouse_mid text, mode text, reference text, fate text,
    placed_at timestamp, accepted_at timestamp, packed_at timestamp, dispatched_at timestamp,
    delivered_at timestamp, verified_at timestamp, cancelled_at timestamp, promised_at timestamp,
    agent_n int, agent_mid text, agent_name text,
    delay_min int, delay_reason text, delay_note text, delay_at timestamp, delay_by text,
    r_fate float8, r_delay float8, order_number int
  ) ON COMMIT DROP;

  -- History: shop 1 orders on Mondays and Thursdays, shop 2 on Tuesdays and
  -- Fridays, up to two days ago. About 4% are cancelled by the shop, 3% refused
  -- by the warehouse for want of stock, and the rest delivered.
  INSERT INTO seed_so (order_id, business_id, branch_id, tz, currency, placed_by, warehouse_mid, mode,
                       placed_at, r_fate, r_delay)
  SELECT pg_temp.seed_id(), b.business_id, b.branch_id, b.tz, b.currency, b.counter_mid, sb.warehouse_mid,
         CASE WHEN random() < 0.4 THEN 'ONLINE' ELSE 'COD' END,
         pg_temp.utc(dd.d + time '09:30' + (60 * random()) * interval '1 minute', b.tz),
         random(), random()
    FROM seed_day dd
    JOIN seed_branch b ON b.branch_id = dd.branch_id AND b.kind = 'BRANCH'
    JOIN seed_biz sb ON sb.business_id = b.business_id
   WHERE sb.has_warehouse
     AND dd.d <= sb.today - 2
     AND dd.dow = ANY (CASE WHEN b.shop_rank % 2 = 1 THEN ARRAY[1, 4] ELSE ARRAY[2, 5] END);

  UPDATE seed_so SET fate = CASE WHEN r_fate < 0.04 THEN 'CANCELLED'
                                 WHEN r_fate < 0.07 THEN 'REJECTED'
                                 ELSE 'DELIVERED' END;
  UPDATE seed_so SET cancelled_at = placed_at + interval '10 minutes' WHERE fate = 'CANCELLED';
  UPDATE seed_so SET cancelled_at = placed_at + interval '30 minutes' WHERE fate = 'REJECTED';
  UPDATE seed_so SET accepted_at = placed_at + (20 + 20 * random()) * interval '1 minute',
                     promised_at = placed_at + interval '4 hours'
   WHERE fate = 'DELIVERED';
  UPDATE seed_so SET packed_at = accepted_at + (40 + 50 * random()) * interval '1 minute' WHERE fate = 'DELIVERED';
  UPDATE seed_so SET dispatched_at = packed_at + (20 + 40 * random()) * interval '1 minute' WHERE fate = 'DELIVERED';
  -- One run in seven is held up on the road, and the agent says why.
  UPDATE seed_so SET delay_min    = (ARRAY[15, 20, 30, 45])[1 + floor(random() * 4)::int],
                     delay_reason = (ARRAY['TRAFFIC', 'VEHICLE_ISSUE', 'WEATHER'])[1 + floor(random() * 3)::int],
                     delay_at     = dispatched_at + interval '15 minutes',
                     delay_by     = 'AGENT'
   WHERE fate = 'DELIVERED' AND r_delay < 0.15;
  UPDATE seed_so SET promised_at = promised_at + delay_min * interval '1 minute' WHERE delay_min IS NOT NULL;
  UPDATE seed_so SET delivered_at = dispatched_at + (35 + 55 * random() + COALESCE(delay_min, 0)) * interval '1 minute'
   WHERE fate = 'DELIVERED';
  -- An online payment is checked soon after the desk accepts; cash is checked
  -- once the agent has brought it back.
  UPDATE seed_so SET verified_at = CASE WHEN mode = 'ONLINE' THEN accepted_at + interval '5 minutes'
                                        ELSE delivered_at + (60 + 120 * random()) * interval '1 minute' END
   WHERE fate = 'DELIVERED';
  -- Runs are shared out between the agents in turn.
  UPDATE seed_so s SET agent_n = q.seq
    FROM (SELECT order_id, row_number() OVER (PARTITION BY business_id ORDER BY placed_at) AS seq
            FROM seed_so WHERE fate = 'DELIVERED') q
   WHERE s.order_id = q.order_id;

  -- Right now: one order at every stage, so each role has something waiting.
  -- Offsets are "how long ago"; shop 2 falls back to shop 1 where there is only one.
  INSERT INTO seed_so (order_id, business_id, branch_id, tz, currency, placed_by, warehouse_mid, mode, fate,
                       placed_at, accepted_at, packed_at, dispatched_at, delivered_at, verified_at,
                       promised_at, agent_n, delay_min, delay_reason, delay_note, delay_at, delay_by)
  SELECT pg_temp.seed_id(), b.business_id, b.branch_id, b.tz, b.currency, b.counter_mid, sb.warehouse_mid,
         l.mode, 'LIVE',
         v_now_utc - l.placed, v_now_utc - l.accepted, v_now_utc - l.packed, v_now_utc - l.dispatched,
         v_now_utc - l.delivered, v_now_utc - l.verified,
         CASE WHEN l.accepted IS NOT NULL
              THEN v_now_utc - l.placed + interval '5 hours' + COALESCE(l.delay_min, 0) * interval '1 minute' END,
         l.agent_n, l.delay_min, l.delay_reason, l.delay_note, v_now_utc - l.delay_ago, l.delay_by
    FROM (VALUES
      -- shop, mode, placed, accepted, packed, dispatched, delivered, verified, agent, delay (min, reason, note, ago, by)
      -- 1. New at the desk (cash on delivery)
      (1, 'COD',    interval '40 minutes', NULL::interval, NULL::interval, NULL::interval, NULL::interval, NULL::interval,
                    NULL::int, NULL::int, NULL::text, NULL::text, NULL::interval, NULL::text),
      -- 2. New at the desk, paid online: the reference is waiting to be checked
      (2, 'ONLINE', interval '25 minutes', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
      -- 3. Accepted, with a promised time
      (1, 'COD',    interval '3 hours', interval '2 hours 40 minutes', NULL, NULL, NULL, NULL,
                    NULL, NULL, NULL, NULL, NULL, NULL),
      -- 4. Packed and waiting for an agent to be picked
      (2, 'COD',    interval '4 hours', interval '3 hours 40 minutes', interval '1 hour', NULL, NULL, NULL,
                    NULL, NULL, NULL, NULL, NULL, NULL),
      -- 5. On the road with agent 1, who has posted a delay
      (1, 'ONLINE', interval '5 hours', interval '4 hours 45 minutes', interval '3 hours', interval '50 minutes',
                    NULL, interval '4 hours 40 minutes',
                    1, 30, 'TRAFFIC', 'Heavy traffic at the flyover', interval '20 minutes', 'AGENT'),
      -- 6. On the road with agent 2
      (2, 'COD',    interval '4 hours 30 minutes', interval '4 hours 10 minutes', interval '2 hours', interval '30 minutes',
                    NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL),
      -- 7. Delivered yesterday, cash collected, not yet confirmed by the desk
      (1, 'COD',    interval '28 hours', interval '27 hours 40 minutes', interval '26 hours', interval '25 hours',
                    interval '24 hours', NULL, 2, NULL, NULL, NULL, NULL, NULL),
      -- 8. Accepted, but the warehouse is short-handed and has said so
      (2, 'ONLINE', interval '2 hours', interval '1 hour 45 minutes', NULL, NULL, NULL, NULL,
                    NULL, 45, 'STAFF_SHORTAGE', NULL, interval '1 hour', 'WAREHOUSE')
    ) AS l(shop, mode, placed, accepted, packed, dispatched, delivered, verified,
           agent_n, delay_min, delay_reason, delay_note, delay_ago, delay_by)
    JOIN seed_biz sb ON sb.has_warehouse
    JOIN seed_branch b ON b.business_id = sb.business_id
     AND b.shop_rank = LEAST(l.shop, (SELECT max(x.shop_rank) FROM seed_branch x WHERE x.business_id = sb.business_id));

  UPDATE seed_so SET reference = 'UPI' || lpad(floor(random() * 1e12)::bigint::text, 12, '0') WHERE mode = 'ONLINE';
  -- Agent n of the business; with no agents at all a run goes out unassigned.
  UPDATE seed_so s SET agent_mid = a.mid, agent_name = a.name
    FROM seed_agent a
   WHERE s.agent_n IS NOT NULL AND s.dispatched_at IS NOT NULL
     AND a.business_id = s.business_id AND a.n = 1 + ((s.agent_n - 1) % a.of_n);
  -- Numbers continue after the last one issued, in the order the orders were placed.
  UPDATE seed_so s SET order_number = q.n
    FROM (SELECT so.order_id,
                 sb.order_base + row_number() OVER (PARTITION BY so.business_id ORDER BY so.placed_at) AS n
            FROM seed_so so JOIN seed_biz sb ON sb.business_id = so.business_id) q
   WHERE s.order_id = q.order_id;

  -- Draw per order-and-item pair first. `WHERE random() < 0.35` on the join
  -- would be pushed down to the item scan and pick one item set for every order.
  CREATE TEMP TABLE seed_soi_raw ON COMMIT DROP AS
  SELECT so.order_id, i.item_id, i.name, i.unit, i.price, i.qmin, i.qmax, i.always,
         random() AS r_pick, random() AS r_qty
    FROM seed_so so JOIN seed_item i ON i.business_id = so.business_id;

  CREATE TEMP TABLE seed_soi ON COMMIT DROP AS
  SELECT order_id, item_id, name, unit, price,
         (qmin + floor(r_qty * (qmax - qmin + 1)))::numeric AS qty,
         row_number() OVER (PARTITION BY order_id ORDER BY name) AS line_no
    FROM seed_soi_raw
   WHERE always OR r_pick < 0.35;

  INSERT INTO supply_orders (id, "businessId", "branchId", "orderNumber", status, "totalAmount", currency,
                             "paymentMode", "paymentStatus", "paymentReference", "paymentVerifiedAt", "promisedAt",
                             "placedByMembershipId", "deliveryAgentMembershipId",
                             "placedAt", "dispatchedAt", "deliveredAt", "cancelledAt", "createdAt", "updatedAt")
  SELECT so.order_id, so.business_id, so.branch_id, so.order_number,
         (CASE WHEN so.cancelled_at  IS NOT NULL THEN 'CANCELLED'
               WHEN so.delivered_at  IS NOT NULL THEN 'DELIVERED'
               WHEN so.dispatched_at IS NOT NULL THEN 'DISPATCHED'
               WHEN so.packed_at     IS NOT NULL THEN 'PACKED'
               WHEN so.accepted_at   IS NOT NULL THEN 'ACCEPTED'
               ELSE 'PLACED' END)::"SupplyOrderStatus",
         (SELECT sum(x.qty * x.price) FROM seed_soi x WHERE x.order_id = so.order_id), so.currency,
         so.mode::"SupplyPaymentMode",
         (CASE WHEN so.verified_at  IS NOT NULL THEN 'VERIFIED'
               WHEN so.mode = 'ONLINE'          THEN 'PAID'
               WHEN so.delivered_at IS NOT NULL THEN 'PAID'
               ELSE 'PENDING' END)::"SupplyPaymentStatus",
         so.reference, so.verified_at, so.promised_at, so.placed_by, so.agent_mid,
         so.placed_at, so.dispatched_at, so.delivered_at, so.cancelled_at,
         so.placed_at - interval '15 minutes',
         GREATEST(so.placed_at, so.accepted_at, so.packed_at, so.dispatched_at, so.delivered_at,
                  so.verified_at, so.cancelled_at, so.delay_at)
    FROM seed_so so;

  INSERT INTO supply_order_items (id, "supplyOrderId", "inventoryItemId", "itemNameSnapshot", "unitSnapshot",
                                  quantity, "unitPrice", "lineTotal", "createdAt")
  SELECT pg_temp.seed_id(), x.order_id, x.item_id, x.name, x.unit, x.qty, x.price, x.qty * x.price,
         so.placed_at - interval '15 minutes' + x.line_no * interval '20 seconds'
    FROM seed_soi x JOIN seed_so so ON so.order_id = x.order_id;

  -- The timeline, written the way supplyOrder.service.js writes it: who moved
  -- it, when, and the payment story as its own events beside the status ones.
  INSERT INTO supply_order_events (id, "supplyOrderId", type, "fromStatus", "toStatus", "delayMinutes",
                                   "reasonCode", note, "actorMembershipId", "createdAt")
  SELECT pg_temp.seed_id(), e.order_id, e.type::"SupplyOrderEventType",
         e.from_s::"SupplyOrderStatus", e.to_s::"SupplyOrderStatus",
         e.delay_min, e.reason, e.note, e.actor, e.at
    FROM (
      SELECT order_id, 'STATUS_CHANGE' AS type, 'DRAFT' AS from_s, 'PLACED' AS to_s, NULL::int AS delay_min,
             NULL AS reason, NULL AS note, placed_by AS actor, placed_at AS at
        FROM seed_so
      UNION ALL
      SELECT order_id, 'PAYMENT', NULL, NULL, NULL,
             CASE WHEN mode = 'ONLINE' THEN 'PAYMENT_CLAIMED' ELSE 'PAYMENT_ON_DELIVERY' END,
             reference, placed_by, placed_at + interval '4 milliseconds'
        FROM seed_so
      UNION ALL
      SELECT order_id, 'STATUS_CHANGE', 'PLACED', 'ACCEPTED', NULL, NULL, NULL, warehouse_mid, accepted_at
        FROM seed_so WHERE accepted_at IS NOT NULL
      UNION ALL
      SELECT order_id, 'STATUS_CHANGE', 'ACCEPTED', 'PACKED', NULL, NULL, NULL, warehouse_mid, packed_at
        FROM seed_so WHERE packed_at IS NOT NULL
      UNION ALL
      SELECT order_id, 'STATUS_CHANGE', 'PACKED', 'DISPATCHED', NULL, NULL, NULL, warehouse_mid, dispatched_at
        FROM seed_so WHERE dispatched_at IS NOT NULL
      UNION ALL
      SELECT order_id, 'ASSIGNMENT', NULL, NULL, NULL, NULL, agent_name, warehouse_mid,
             dispatched_at + interval '2 milliseconds'
        FROM seed_so WHERE dispatched_at IS NOT NULL AND agent_mid IS NOT NULL
      UNION ALL
      SELECT order_id, 'DELAY', NULL, NULL, delay_min, delay_reason, delay_note,
             CASE WHEN delay_by = 'AGENT' THEN COALESCE(agent_mid, warehouse_mid) ELSE warehouse_mid END, delay_at
        FROM seed_so WHERE delay_at IS NOT NULL
      UNION ALL
      SELECT order_id, 'STATUS_CHANGE', 'DISPATCHED', 'DELIVERED', NULL, NULL, NULL,
             COALESCE(agent_mid, warehouse_mid), delivered_at
        FROM seed_so WHERE delivered_at IS NOT NULL
      UNION ALL
      SELECT order_id, 'PAYMENT', NULL, NULL, NULL, 'PAYMENT_COLLECTED', NULL,
             COALESCE(agent_mid, warehouse_mid), delivered_at + interval '4 milliseconds'
        FROM seed_so WHERE delivered_at IS NOT NULL AND mode = 'COD'
      UNION ALL
      SELECT order_id, 'PAYMENT', NULL, NULL, NULL, 'PAYMENT_VERIFIED', NULL, warehouse_mid, verified_at
        FROM seed_so WHERE verified_at IS NOT NULL
      UNION ALL
      -- Cancelled by the shop, or refused by the warehouse with its reason.
      SELECT order_id, 'STATUS_CHANGE', 'PLACED', 'CANCELLED', NULL,
             CASE WHEN fate = 'REJECTED' THEN 'STOCK_OUT' END, NULL,
             CASE WHEN fate = 'REJECTED' THEN warehouse_mid ELSE placed_by END, cancelled_at
        FROM seed_so WHERE cancelled_at IS NOT NULL
    ) e;

  INSERT INTO supply_order_counters ("businessId", "lastNumber")
  SELECT business_id, max(order_number) FROM seed_so GROUP BY business_id
  ON CONFLICT ("businessId") DO UPDATE
     SET "lastNumber" = GREATEST(supply_order_counters."lastNumber", EXCLUDED."lastNumber");

  -- ===========================================================================
  -- 7. Counter sales, sized so each month lands just under its target
  -- ===========================================================================

  -- Branch x month, with the figures analytics.service.js reads:
  --   sales     COMPLETED transactions whose instant falls in the branch's month
  --   expenses  expenses whose date falls in the month
  --   payroll   payslips for the month, DRAFT ones included
  --   material  supply orders placed in the month, neither DRAFT nor CANCELLED
  CREATE TEMP TABLE seed_bm ON COMMIT DROP AS
  SELECT b.branch_id, b.business_id, b.kind, b.shop_rank, b.tz, dd.month_start,
         (dd.month_start + interval '1 month')::date AS next_month,
         pg_temp.utc(dd.month_start::timestamp, b.tz) AS from_utc,
         pg_temp.utc((dd.month_start + interval '1 month')::date::timestamp, b.tz) AS to_utc,
         count(*) AS days,
         0::numeric AS expenses, 0::numeric AS payroll, 0::numeric AS material, 0::numeric AS sales,
         0::numeric AS need
    FROM seed_day dd JOIN seed_branch b ON b.branch_id = dd.branch_id
   GROUP BY b.branch_id, b.business_id, b.kind, b.shop_rank, b.tz, dd.month_start;

  -- One definition, used both to size the sales and to check the result.
  CREATE OR REPLACE FUNCTION pg_temp.seed_measure() RETURNS void
    LANGUAGE sql
    AS $f$
      UPDATE seed_bm m SET
        expenses = COALESCE((SELECT sum(e.amount) FROM expenses e
                              WHERE e."branchId" = m.branch_id
                                AND e."expenseDate" >= m.month_start AND e."expenseDate" < m.next_month), 0),
        payroll  = COALESCE((SELECT sum(s."netPay") FROM salary_slips s
                              WHERE s."branchId" = m.branch_id
                                AND s."monthYear" = to_char(m.month_start, 'YYYY-MM')), 0),
        material = COALESCE((SELECT sum(o."totalAmount") FROM supply_orders o
                              WHERE o."branchId" = m.branch_id
                                AND o.status IN ('PLACED', 'ACCEPTED', 'PACKED', 'DISPATCHED', 'DELIVERED')
                                AND o."placedAt" >= m.from_utc AND o."placedAt" < m.to_utc), 0),
        sales    = COALESCE((SELECT sum(t."totalAmount") FROM transactions t
                              WHERE t."branchId" = m.branch_id AND t.status = 'COMPLETED'
                                AND t."occurredAt" >= m.from_utc AND t."occurredAt" < m.to_utc), 0);
    $f$;

  PERFORM pg_temp.seed_measure();

  -- How much each shop still has to sell. Business A is measured as a whole —
  -- material bought from its own warehouse never left the business, so it is
  -- not a cost there — and the need is shared between its shops by weight.
  -- Business B is measured at its first branch, where material is a cost; any
  -- other branch of B just trades at a modest profit.
  UPDATE seed_bm m SET need = GREATEST(q.need_total * w.weight / w.total_weight, 0)
    FROM (SELECT bm.business_id, bm.month_start,
                 sb.target + sum(bm.expenses) + sum(bm.payroll) - sum(bm.sales) AS need_total
            FROM seed_bm bm JOIN seed_biz sb ON sb.business_id = bm.business_id
           WHERE sb.level = 'BUSINESS'
           GROUP BY bm.business_id, bm.month_start, sb.target) q,
         (SELECT branch_id, weight, sum(weight) OVER (PARTITION BY business_id) AS total_weight
            FROM seed_branch WHERE kind = 'BRANCH') w
   WHERE m.business_id = q.business_id AND m.month_start = q.month_start AND m.branch_id = w.branch_id;

  UPDATE seed_bm m SET need = GREATEST(
           CASE WHEN m.branch_id = sb.target_branch THEN sb.target ELSE 15000 END
           + m.expenses + m.payroll + m.material - m.sales, 0)
    FROM seed_biz sb
   WHERE sb.business_id = m.business_id AND sb.level = 'BRANCH' AND m.kind = 'BRANCH';

  -- Orders per day: 95% of the need, spread over the month's days, busier at
  -- the weekend, +/-10% day to day. The last few percent is a catering order
  -- per shop, added in section 8 once the real total is known.
  CREATE TEMP TABLE seed_plan ON COMMIT DROP AS
  SELECT dd.branch_id, dd.business_id, dd.d, dd.dow, dd.is_today, b.tz, b.currency, b.counter_mid, b.owner_mid,
         GREATEST(round(m.need * 0.95 / m.days / ev.order_value
                        * CASE dd.dow WHEN 0 THEN 1.2 WHEN 6 THEN 1.1 ELSE 0.94 END
                        * (0.9 + 0.2 * random())), 0)::int AS orders,
         -- Tokens continue after any the branch already issued that day.
         GREATEST(COALESCE((SELECT t."lastNumber" FROM branch_token_counters t
                             WHERE t."branchId" = dd.branch_id AND t."tokenDate" = dd.d), 0),
                  COALESCE((SELECT max(o."tokenNumber") FROM counter_orders o
                             WHERE o."branchId" = dd.branch_id AND o."tokenDate" = dd.d), 0)) AS token_base
    FROM seed_day dd
    JOIN seed_branch b ON b.branch_id = dd.branch_id AND b.kind = 'BRANCH'
    JOIN seed_bm m ON m.branch_id = dd.branch_id AND m.month_start = dd.month_start
    -- Expected order value: average item price x 2 per line x 1.65 lines per order.
    JOIN (SELECT branch_id, sum(weight * price) / sum(weight) * 2 * 1.65 AS order_value
            FROM seed_price GROUP BY branch_id) ev ON ev.branch_id = dd.branch_id;

  CREATE TEMP TABLE seed_co_raw ON COMMIT DROP AS
  SELECT p.*, random() AS r_slot, random() AS r_at, random() AS r_fate, random() AS r_pay,
         random() AS r_lines, random() AS r_close
    FROM seed_plan p CROSS JOIN LATERAL generate_series(1, p.orders) AS g(i);

  -- A morning rush, a quiet afternoon and an evening crowd; nothing after now.
  -- Tokens run in the order customers arrived. About one order in seventy is
  -- voided, and today's last two tokens are still at the counter — so the
  -- cashier has open orders, and closing the day is refused until they are
  -- handed over.
  CREATE TEMP TABLE seed_co ON COMMIT DROP AS
  SELECT t.*,
         CASE WHEN t.r_fate < 0.015                THEN 'VOID'
              WHEN t.is_today AND t.from_end <= 2  THEN 'OPEN'
              ELSE 'CLOSED' END AS status,
         CASE WHEN t.r_fate < 0.015 OR (t.is_today AND t.from_end <= 2) THEN NULL
              ELSE LEAST(t.opened_at + (2 + 6 * t.r_close) * interval '1 minute', v_now_utc) END AS closed_at,
         CASE WHEN t.r_pay < 0.45 THEN 'CASH' WHEN t.r_pay < 0.90 THEN 'UPI'
              WHEN t.r_pay < 0.95 THEN 'CARD' ELSE 'UNSPECIFIED' END AS pay,
         0::numeric AS total
    FROM (SELECT o.*,
                 o.token_base + row_number() OVER (PARTITION BY o.branch_id, o.d ORDER BY o.opened_at) AS token,
                 row_number() OVER (PARTITION BY o.branch_id, o.d ORDER BY o.opened_at DESC) AS from_end
            FROM (SELECT pg_temp.seed_id() AS order_id, pg_temp.seed_id() AS tx_id, x.*
                    FROM (SELECT raw.*,
                                 CASE WHEN raw.dow = 0 THEN raw.owner_mid ELSE raw.counter_mid END AS placed_by,
                                 pg_temp.utc(raw.d + CASE
                                   WHEN raw.r_slot < 0.45 THEN time '07:30' + (210 * raw.r_at) * interval '1 minute'
                                   WHEN raw.r_slot < 0.65 THEN time '11:00' + (300 * raw.r_at) * interval '1 minute'
                                   ELSE                        time '16:00' + (330 * raw.r_at) * interval '1 minute' END,
                                   raw.tz) AS opened_at
                            FROM seed_co_raw raw) x
                   WHERE x.opened_at <= v_now_utc - interval '1 minute') o) t;

  -- One to three lines an order, one to three of each item, each item picked in
  -- proportion to its weight. Drawn into a table first, so each random number
  -- is used exactly once.
  CREATE TEMP TABLE seed_coi_raw ON COMMIT DROP AS
  SELECT co.order_id, co.branch_id, g.n AS line_no, random() AS r_prod, random() AS r_qty
    FROM seed_co co
    CROSS JOIN LATERAL generate_series(1, 1 + (co.r_lines >= 0.5)::int + (co.r_lines >= 0.85)::int) AS g(n);
  ANALYZE seed_coi_raw;
  ANALYZE seed_price;

  CREATE TEMP TABLE seed_coi ON COMMIT DROP AS
  SELECT i.order_id, i.line_no, p.product_id, p.name, p.price, (1 + floor(i.r_qty * 3))::numeric AS qty
    FROM seed_coi_raw i
    JOIN seed_price p ON p.branch_id = i.branch_id AND i.r_prod >= p.cum_lo AND i.r_prod < p.cum_hi;
  ANALYZE seed_co;
  ANALYZE seed_coi;

  UPDATE seed_co c SET total = s.total
    FROM (SELECT order_id, sum(qty * price) AS total FROM seed_coi GROUP BY order_id) s
   WHERE c.order_id = s.order_id;

  -- Each order and the sale it projects to, exactly as salesProjection.service.js
  -- writes them: externalId "counter:<order id>", occurredAt = when it was opened,
  -- a VOID order projecting as VOIDED so no report counts it.
  INSERT INTO transactions (id, "businessId", "branchId", "externalId", "occurredAt", "totalAmount",
                            "taxAmount", "discountAmount", currency, "paymentMethod", status, source, "createdAt")
  SELECT tx_id, business_id, branch_id, 'counter:' || order_id, opened_at, total, 0, 0, currency,
         pay::"PaymentMethod", (CASE WHEN status = 'VOID' THEN 'VOIDED' ELSE 'COMPLETED' END)::"TransactionStatus",
         'COUNTER', opened_at
    FROM seed_co;

  INSERT INTO line_items (id, "transactionId", "productId", "productNameSnapshot", quantity, "unitPrice", "lineTotal")
  SELECT pg_temp.seed_id(), co.tx_id, i.product_id, i.name, i.qty, i.price, i.qty * i.price
    FROM seed_coi i JOIN seed_co co ON co.order_id = i.order_id;

  INSERT INTO counter_orders (id, "businessId", "branchId", "tokenNumber", "tokenDate", status, "totalAmount",
                              currency, "paymentMethod", "placedByMembershipId", "transactionId",
                              "openedAt", "closedAt", "updatedAt")
  SELECT order_id, business_id, branch_id, token, d, status::"CounterOrderStatus", total, currency,
         pay::"PaymentMethod", placed_by, tx_id, opened_at, closed_at, COALESCE(closed_at, opened_at)
    FROM seed_co;

  INSERT INTO counter_order_items (id, "counterOrderId", "productId", "productNameSnapshot", quantity,
                                   "unitPrice", "lineTotal", "createdAt")
  SELECT pg_temp.seed_id(), i.order_id, i.product_id, i.name, i.qty, i.price, i.qty * i.price,
         co.opened_at + i.line_no * interval '5 seconds'
    FROM seed_coi i JOIN seed_co co ON co.order_id = i.order_id;

  INSERT INTO branch_token_counters ("branchId", "tokenDate", "lastNumber")
  SELECT branch_id, d, max(token) FROM seed_co GROUP BY branch_id, d
  ON CONFLICT ("branchId", "tokenDate") DO UPDATE
     SET "lastNumber" = GREATEST(branch_token_counters."lastNumber", EXCLUDED."lastNumber");

  -- ===========================================================================
  -- 8. Land every month exactly on its target
  -- ===========================================================================

  PERFORM pg_temp.seed_measure();

  CREATE TEMP TABLE seed_gap ON COMMIT DROP AS
  SELECT sb.business_id, bm.month_start, NULL::text AS branch_id,
         sb.target - (sum(bm.sales) - sum(bm.expenses) - sum(bm.payroll)) AS gap
    FROM seed_bm bm JOIN seed_biz sb ON sb.business_id = bm.business_id
   WHERE sb.level = 'BUSINESS'
   GROUP BY sb.business_id, bm.month_start, sb.target
  UNION ALL
  SELECT sb.business_id, bm.month_start, bm.branch_id,
         sb.target - (bm.sales - bm.expenses - bm.material - bm.payroll)
    FROM seed_bm bm JOIN seed_biz sb ON sb.business_id = bm.business_id AND bm.branch_id = sb.target_branch
   WHERE sb.level = 'BRANCH';

  -- Business A's correction is shared between its shops by the same weights as
  -- their sales, to the paisa: the last shop takes whatever rounding leaves.
  INSERT INTO seed_gap (business_id, month_start, branch_id, gap)
  SELECT q.business_id, q.month_start, q.branch_id,
         CASE WHEN q.from_last = 1 THEN q.gap - (q.share_sum - q.share) ELSE q.share END
    FROM (SELECT s.*,
                 sum(s.share) OVER (PARTITION BY s.business_id, s.month_start) AS share_sum,
                 row_number() OVER (PARTITION BY s.business_id, s.month_start ORDER BY s.shop_rank DESC) AS from_last
            FROM (SELECT g.business_id, g.month_start, g.gap, b.branch_id, b.shop_rank,
                         round(g.gap * b.weight
                               / sum(b.weight) OVER (PARTITION BY g.business_id, g.month_start), 2) AS share
                    FROM seed_gap g JOIN seed_branch b ON b.business_id = g.business_id AND b.kind = 'BRANCH'
                   WHERE g.branch_id IS NULL) s) q;
  DELETE FROM seed_gap WHERE branch_id IS NULL;

  -- Shop 1's on the 20th, shop 2's on the 13th, at half past twelve — or
  -- earlier today, if the month has not got that far yet.
  ALTER TABLE seed_gap ADD COLUMN at_utc timestamp, ADD COLUMN day date;
  UPDATE seed_gap g SET at_utc = GREATEST(
           pg_temp.utc(g.month_start::timestamp, b.tz),
           LEAST(pg_temp.utc(LEAST(g.month_start + 19 - ((b.shop_rank - 1) % 3)::int * 7, sb.today) + time '12:30', b.tz),
                 v_now_utc - interval '1 minute'))
    FROM seed_branch b JOIN seed_biz sb ON sb.business_id = b.business_id
   WHERE b.branch_id = g.branch_id;
  UPDATE seed_gap g SET day = pg_temp.local_day(g.at_utc, b.tz) FROM seed_branch b WHERE b.branch_id = g.branch_id;

  -- A shortfall becomes one catering order at the counter ...
  CREATE TEMP TABLE seed_fill ON COMMIT DROP AS
  SELECT pg_temp.seed_id() AS order_id, pg_temp.seed_id() AS tx_id, g.business_id, g.branch_id, g.day,
         g.at_utc, g.gap AS amount, b.currency, b.counter_mid,
         GREATEST(COALESCE((SELECT t."lastNumber" FROM branch_token_counters t
                             WHERE t."branchId" = g.branch_id AND t."tokenDate" = g.day), 0),
                  COALESCE((SELECT max(o."tokenNumber") FROM counter_orders o
                             WHERE o."branchId" = g.branch_id AND o."tokenDate" = g.day), 0)) + 1 AS token
    FROM seed_gap g JOIN seed_branch b ON b.branch_id = g.branch_id
   WHERE g.gap > 0;

  INSERT INTO transactions (id, "businessId", "branchId", "externalId", "occurredAt", "totalAmount",
                            "taxAmount", "discountAmount", currency, "paymentMethod", status, source, "createdAt")
  SELECT tx_id, business_id, branch_id, 'counter:' || order_id, at_utc, amount, 0, 0, currency,
         'UPI', 'COMPLETED', 'COUNTER', at_utc
    FROM seed_fill;

  INSERT INTO line_items (id, "transactionId", "productId", "productNameSnapshot", quantity, "unitPrice", "lineTotal")
  SELECT pg_temp.seed_id(), tx_id, NULL, 'Catering order', 1, amount, amount FROM seed_fill;

  INSERT INTO counter_orders (id, "businessId", "branchId", "tokenNumber", "tokenDate", status, "totalAmount",
                              currency, "paymentMethod", "placedByMembershipId", "transactionId",
                              "openedAt", "closedAt", "updatedAt")
  SELECT order_id, business_id, branch_id, token, day, 'CLOSED', amount, currency, 'UPI', counter_mid, tx_id,
         at_utc, at_utc, at_utc
    FROM seed_fill;

  INSERT INTO counter_order_items (id, "counterOrderId", "productId", "productNameSnapshot", quantity,
                                   "unitPrice", "lineTotal", "createdAt")
  SELECT pg_temp.seed_id(), order_id, NULL, 'Catering order', 1, amount, amount, at_utc FROM seed_fill;

  INSERT INTO branch_token_counters ("branchId", "tokenDate", "lastNumber")
  SELECT branch_id, day, token FROM seed_fill
  ON CONFLICT ("branchId", "tokenDate") DO UPDATE
     SET "lastNumber" = GREATEST(branch_token_counters."lastNumber", EXCLUDED."lastNumber");

  -- ... and a surplus (only possible if you had already sold a lot by hand)
  -- becomes one miscellaneous expense.
  INSERT INTO expenses (id, "businessId", "branchId", "categoryId", amount, currency, "expenseDate", note,
                        "paymentMethod", "recordedByMembershipId", "createdAt", "updatedAt")
  SELECT pg_temp.seed_id(), g.business_id, g.branch_id, c.id, -g.gap, b.currency, g.day,
         'Miscellaneous', 'UPI', b.owner_mid, g.at_utc, g.at_utc
    FROM seed_gap g
    JOIN seed_branch b ON b.branch_id = g.branch_id
    JOIN seed_cat c ON c.business_id = g.business_id AND c.code = 'OTHER'
   WHERE g.gap < 0;

  -- Check the result the way the Reports tab will compute it. Anything off by
  -- even a paisa rolls the whole run back.
  PERFORM pg_temp.seed_measure();
  FOR v_row IN
    SELECT sb.name, to_char(bm.month_start, 'Mon YYYY') AS month, sb.target,
           CASE WHEN sb.level = 'BUSINESS'
                THEN sum(bm.sales) - sum(bm.expenses) - sum(bm.payroll)
                ELSE sum(bm.sales - bm.expenses - bm.material - bm.payroll)
                       FILTER (WHERE bm.branch_id = sb.target_branch) END AS net
      FROM seed_bm bm JOIN seed_biz sb ON sb.business_id = bm.business_id
     GROUP BY sb.name, sb.level, sb.target, sb.target_branch, bm.month_start
  LOOP
    IF v_row.net <> v_row.target THEN
      RAISE EXCEPTION '% % came to % instead of %', v_row.name, v_row.month, v_row.net, v_row.target;
    END IF;
  END LOOP;

  -- ===========================================================================
  -- 9. Close every past day, as a cashier would at the end of each one
  -- ===========================================================================

  INSERT INTO day_closes (id, "businessId", "branchId", "date", "closedAt", "closedByMembershipId")
  SELECT pg_temp.seed_id(), dd.business_id, dd.branch_id, dd.d,
         pg_temp.utc(dd.d + time '22:30', b.tz),
         CASE WHEN dd.dow = 0 THEN b.owner_mid ELSE b.counter_mid END
    FROM seed_day dd JOIN seed_branch b ON b.branch_id = dd.branch_id AND b.kind = 'BRANCH'
   WHERE NOT dd.is_today
     AND NOT EXISTS (SELECT 1 FROM counter_orders o
                      WHERE o."branchId" = dd.branch_id AND o."tokenDate" = dd.d AND o.status = 'OPEN')
  ON CONFLICT ("branchId", "date") DO NOTHING;

  -- ===========================================================================
  -- Done
  -- ===========================================================================

  FOR v_row IN
    SELECT sb.name,
           (SELECT count(*) FROM counter_orders o WHERE o."businessId" = sb.business_id AND o.id LIKE '5eed5eed-%') AS orders,
           (SELECT count(*) FROM supply_orders o  WHERE o."businessId" = sb.business_id AND o.id LIKE '5eed5eed-%') AS supply,
           (SELECT count(*) FROM expenses e       WHERE e."businessId" = sb.business_id AND e.id LIKE '5eed5eed-%') AS expenses,
           (SELECT count(*) FROM salary_slips s   WHERE s."businessId" = sb.business_id AND s.id LIKE '5eed5eed-%') AS slips,
           (SELECT count(*) FROM attendance a     WHERE a."businessId" = sb.business_id AND a.id LIKE '5eed5eed-%') AS days
      FROM seed_biz sb ORDER BY sb.tag
  LOOP
    RAISE NOTICE '%: % counter orders, % supply orders, % expenses, % payslips, % attendance days',
      v_row.name, v_row.orders, v_row.supply, v_row.expenses, v_row.slips, v_row.days;
  END LOOP;
END
$seed$;

-- =============================================================================
-- The figures the Reports tab will show, month by month
-- =============================================================================
-- Business net profit = customer sales - expenses - wages. Money a shop paid its
-- own warehouse ("moved internally") is not subtracted here, only from the shop.
-- Each branch's own figure also subtracts the material it ordered.
WITH seeded AS (
  SELECT DISTINCT "businessId" AS business_id FROM counter_orders WHERE id LIKE '5eed5eed-%'
),
months AS (
  SELECT b.id AS business_id, b.name AS business, m::date AS month_start, (m + interval '1 month')::date AS next_month
    FROM businesses b
    JOIN seeded s ON s.business_id = b.id
    CROSS JOIN LATERAL generate_series(
      (SELECT date_trunc('month', min(o."tokenDate")::timestamp) FROM counter_orders o
        WHERE o."businessId" = b.id AND o.id LIKE '5eed5eed-%'),
      date_trunc('month', now() AT TIME ZONE b.timezone),
      interval '1 month') AS m
),
per_branch AS (
  SELECT mo.business, mo.month_start, br.name AS branch, br.kind,
         COALESCE((SELECT sum(t."totalAmount") FROM transactions t
                    WHERE t."branchId" = br.id AND t.status = 'COMPLETED'
                      AND t."occurredAt" >= (mo.month_start::timestamp AT TIME ZONE br.timezone) AT TIME ZONE 'UTC'
                      AND t."occurredAt" <  (mo.next_month::timestamp  AT TIME ZONE br.timezone) AT TIME ZONE 'UTC'), 0) AS sales,
         COALESCE((SELECT sum(e.amount) FROM expenses e
                    WHERE e."branchId" = br.id
                      AND e."expenseDate" >= mo.month_start AND e."expenseDate" < mo.next_month), 0) AS expenses,
         COALESCE((SELECT sum(s."netPay") FROM salary_slips s
                    WHERE s."branchId" = br.id AND s."monthYear" = to_char(mo.month_start, 'YYYY-MM')), 0) AS wages,
         COALESCE((SELECT sum(o."totalAmount") FROM supply_orders o
                    WHERE o."branchId" = br.id
                      AND o.status IN ('PLACED', 'ACCEPTED', 'PACKED', 'DISPATCHED', 'DELIVERED')
                      AND o."placedAt" >= (mo.month_start::timestamp AT TIME ZONE br.timezone) AT TIME ZONE 'UTC'
                      AND o."placedAt" <  (mo.next_month::timestamp  AT TIME ZONE br.timezone) AT TIME ZONE 'UTC'), 0) AS material
    FROM months mo JOIN branches br ON br."businessId" = mo.business_id
)
SELECT business,
       to_char(month_start, 'Mon YYYY')                AS month,
       sum(sales)                                      AS customer_sales,
       sum(expenses)                                   AS expenses,
       sum(wages)                                      AS wages,
       sum(material)                                   AS moved_internally,
       sum(sales) - sum(expenses) - sum(wages)         AS business_net_profit,
       string_agg(branch || ' ' || (sales - expenses - material - wages)::text, '  |  '
                  ORDER BY kind, branch)               AS branch_net_profit
  FROM per_branch
 GROUP BY business, month_start
 ORDER BY business, month_start;
