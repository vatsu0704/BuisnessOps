# Manual Testing Guide — BizIQ

Click-by-click walkthroughs for every user-facing flow currently built. Follow
them in order the first time — several later flows (Team, Staff & Payroll)
assume branches and data already exist from earlier steps.

This covers the app as it exists today: Phases 0–1 (auth, branches, CSV
ingestion), Team & permissions (invites), and the Attendance & Salary Slip
module. Reports, Alerts and the "ask a question" bar are intentionally
unfinished (Phase 2 is blocked on an LLM provider) — you'll see a "planned"
notice there, not a bug.

---

## 0. Before you start

You run both servers yourself — nothing here starts them for you.

1. **Backend**: `cd backend`, then `npm run dev`. Confirm it printed
   `Server running on port 4000`.
2. **Frontend**: `cd frontend`, then `npm run web` (fastest for clicking
   through in a browser) or `npm run android` if you want to test on a
   device/emulator.
3. **On a physical phone**, the app has to be able to reach the API — this is
   the usual cause of a login that fails with "cannot reach the BizIQ server".
   Pick whichever matches how the phone is connected, and make sure
   `frontend/.env`'s `EXPO_PUBLIC_API_URL` agrees:
   - **USB cable** (works even on mobile data, and needs no firewall rule):
     run `adb reverse tcp:4000 tcp:4000` and set the URL to
     `http://localhost:4000/api`. Re-run the command after replugging the
     device or restarting adb.
   - **Same Wi-Fi as this PC**: set the URL to this PC's LAN IP, e.g.
     `http://192.168.1.98:4000/api`. Windows Firewall must allow inbound
     connections for the exact `node.exe` running the backend.

   `EXPO_PUBLIC_*` values are baked in when Metro starts, so after editing
   `.env` restart Metro with the cache cleared (`npx expo start -c`).
4. Open the app (the web build opens automatically in your browser; for
   `npm run android` open it on the device/emulator).
5. If the database has no account you know the password for, start at Flow 1 —
   there is no demo login to use.

Two browser profiles are genuinely useful for this app (owner in one, a
teammate in another) — e.g. a normal window plus an Incognito/private window,
or two different browsers. Flows 7 and 8 call this out explicitly.

---

## Flow 1 — Register as a business owner

1. On the **Login** screen, tap **"New to BizIQ? → Register your business and
   connect your first branch."**
2. Fill in:
   - Full name — anything, e.g. `Priya Mehta`
   - Work email — use a real-looking address you'll remember, e.g.
     `priya@example.com`
   - Password — 8+ characters
   - Confirm password — must match
   - Business / brand name — e.g. `Chai Junction`
   - Industry — tap one of the four chips (Retail / Food & Beverage /
     Services / Franchise / Other)
   - Country, Currency, Timezone — prefilled (`IN`, `INR`, `Asia/Kolkata`),
     edit if you want
3. Tap **"Create account & continue."**
4. ✅ **Expected:** you land on **Home**, greeted by name, showing your
   business name, and stat tiles for Sales / Orders / Branches (all zero —
   nothing uploaded yet).

**Try the validation, too:** type a malformed email (e.g. `not-an-email`) —
a red "Enter a valid email address" message appears under the field and the
submit button stays disabled. Type mismatched passwords — a similar message
appears under Confirm Password.

---

## Flow 2 — Log out and log back in

1. From **Home**, tap your avatar (top-right circle with your initials) to
   open **Settings**.
2. Scroll down, tap **"Log out."**
3. ✅ **Expected:** you're back at the **Login** screen.
4. Enter the same email/password, tap **"Sign in to BizIQ."**
5. ✅ **Expected:** back on **Home**, same business, same data.

---

## Flow 3 — Add a branch

1. On **Home**, tap the **"No branches yet"** card (or, if you already have
   one, tap **"+ Add branch"** in the "Your branches" card).
2. Fill in:
   - Branch name — e.g. `Andheri West`
   - Branch code — e.g. `MUM-01` (this must be unique within your business)
   - City / Region — optional
   - Currency / Timezone — prefilled from your business
3. Tap **"Create branch."**
4. ✅ **Expected:** you're back on Home, the branch now appears under "Your
   branches," and the Branches stat tile went up by one.
5. Repeat once or twice more with different codes — several of the later
   flows (Upload, Add staff) are more interesting with 2+ branches.

**Try the validation:** leave the branch code blank and try to submit — the
button stays disabled. Create a second branch reusing an existing code —
you'll get a clean "already exists" error, not a crash.

---

## Flow 4 — Upload sales data (CSV)

1. On **Home**, tap **"Bring your sales data in."**
2. Tap **"Download template"** — a sample CSV downloads (or opens a share
   sheet on a device). Open it to see the expected columns:
   `occurred_at, product_name, quantity, unit_price, payment_method`
   (optional: `transaction_external_id, sku, unit, tax_amount,
   discount_amount`).
3. Back on the Upload screen, tap the branch you want this data attributed to
   (under "Which branch is this data for?").
4. Tap **"Choose a CSV or Excel file"** and pick the template you just
   downloaded (or edit it first — add a few more rows with different dates
   and amounts to make Home's numbers more interesting).
5. Tap **"Upload and import."**
6. ✅ **Expected:** a result card appears showing **Created**, **Updated**,
   and **Skipped** counts. With the unedited template you should see a clean
   import (0 skipped). If you intentionally break a row (e.g. delete a
   `quantity` value), that row is reported by name under "Rows that were
   skipped" and the rest still import — the whole file never fails outright.
7. Go back to **Home**.
8. ✅ **Expected:** the **Sales** and **Orders** stat tiles now show real
   numbers matching what you just uploaded (formatted like `₹1,000`, not
   locale-aware yet — see Known Limitations).

---

## Flow 5 — Explore Settings

1. Tap your avatar → **Settings**.
2. ✅ **Expected to see:**
   - Your profile (initials, name, email)
   - **Account** card — email, role (`Owner`)
   - **Business** card — name, industry, branch count, country, currency,
     timezone, and the business's internal ID
   - **"My attendance"** card (everyone sees this)
   - **"Staff & payroll"** card (owners/admins/managers only)
   - **"Team & permissions"** card (owners/admins only)
   - A language selector (English / Hindi / Gujarati / Marathi)
   - **"Log out"**
3. Tap a different language in the language selector.
4. ✅ **Expected:** the whole app's text switches immediately (try Home,
   Settings, Upload — everything should be translated, not just this
   screen). Switch back to English when you're done, or continue testing in
   another language if you want to spot-check translations (the Hindi/
   Gujarati/Marathi files are machine-quality, not reviewed by native
   speakers — wording roughness there is expected, not a bug to report).

---

## Flow 6 — Invite a team member who already has an account

This needs a second account to invite. In your second browser
profile/incognito window:

1. Go through **Flow 1** again with a *different* email (e.g.
   `raj@example.com`) to create a second, throwaway account. It'll create its
   own separate business — that's expected and fine, you're about to invite
   this email into your *real* business instead.

Back in your main window, logged in as the owner:

2. Tap avatar → Settings → **"Team & permissions."**
3. ✅ **Expected:** you see one card — yourself, labeled **Owner**, "Access to
   all branches."
4. Tap **"Invite a member."**
5. Enter the second account's email (`raj@example.com`).
6. Tap a role: **Manager** or **Staff** (Admin also works, but doesn't need
   branch selection — see the hint text that appears under the role picker
   for what each role means).
7. If you picked Manager/Staff, a **"Which branches can they access?"**
   section appears — tap at least one branch. (The submit button stays
   disabled until you do; a Manager/Staff invite with zero branches would be
   pointless.)
8. Tap **"Send invite."**
9. ✅ **Expected:** back on the Team screen, a new card appears for
   `raj@example.com` with the role you picked and the branch(es) you granted
   — no "Pending" label, since they already had an account.
10. In your second browser profile, log out and log back in (or just refresh
    if still logged in).
11. ✅ **Expected:** their session should still show their *own* solo
    business, not yours — this is a known, documented limitation (see
    Known Limitations at the end), not something to report as a new bug.

---

## Flow 7 — Invite someone who has *no* account yet (the new flow)

This is the flow that didn't exist before — an owner can now invite by email
even if that person has never signed up.

1. As the owner, on the **Team** screen, tap **"Invite a member."**
2. Enter an email that has never been used in this app, e.g.
   `new.hire@example.com`.
3. Pick a role, e.g. **Staff**, and tap a branch.
4. Tap **"Send invite."**
5. Go back to the **Team** screen.
6. ✅ **Expected:** a **dashed-border card** appears for `new.hire@example.com`
   with a **"Pending"** badge and the role you picked — this person hasn't
   signed up yet.

Now, in your second browser profile (logged out, or a fresh incognito
window):

7. Go to **Signup**.
8. Type the exact invited email, `new.hire@example.com`, in the email field
   and pause for about half a second.
9. ✅ **Expected:** a blue banner appears under the email field: *"You've
   been invited to join Chai Junction as Staff."* The entire **"Business
   details"** card (business name, industry, country, currency, timezone)
   **disappears** — you don't need it anymore.
10. Fill in just your name and password (and confirm password).
11. ✅ **Expected:** the submit button now reads **"Join Chai Junction"**
    instead of "Create account & continue."
12. Tap it.
13. ✅ **Expected:** you land on **Home** — showing **Chai Junction** (the
    inviting business), not a new business of your own. Tap your avatar →
    Settings → your role should show **Staff**.

Back in your main (owner) window:

14. Refresh the **Team** screen (navigate away and back, or reopen it).
15. ✅ **Expected:** the dashed "Pending" card for `new.hire@example.com` is
    gone, and a normal (solid) card now appears for them, showing **Staff**
    and the branch you granted.

---

## Flow 8 — Self-service attendance (punch in / punch out)

To punch in as yourself without needing a second account, add *yourself* as
a staff member first:

1. Tap avatar → Settings → **"Staff & payroll."**
2. Tap **"Add staff."**
3. Tap a branch.
4. Name — your own name. Role — e.g. `Owner-Operator` or anything descriptive.
5. Monthly salary — optional, fill it in if you want to test payroll later
   (Flow 9 needs it).
6. Account email — enter **your own login email**. This is what links this
   staff record to your account so you can punch in as yourself.
7. Tap **"Add staff member."**
8. Tap avatar → Settings → **"My attendance."**
9. ✅ **Expected:** a card reading **"Not punched in yet"** with a **"Punch
   in"** button.
10. Tap **"Punch in."** Your browser/device may ask for location permission —
    allow it if asked, but it's not required: branches created through this
    UI have no GPS coordinates set, so there's no geofence to fail.
11. ✅ **Expected:** the card updates to **"Punched in at [time]"** and the
    button now reads **"Punch out"** (the "Punch in" button is gone — the app
    already knows you can't punch in twice today, so it doesn't offer the
    option; there's no separate error state to trigger through normal use).
12. Refresh the page (web) or navigate away to Home and back to My Attendance
    (device).
13. ✅ **Expected:** the state survives the refresh — still "Punched in at
    [time]" with a "Punch out" button, not reset to "Not punched in."
14. Tap **"Punch out."**
15. ✅ **Expected:** the card shows **"Punched in at [time] · out at
    [time]"**, and the button disappears entirely — you're done for today,
    nothing left to tap.
16. Scroll down — today's entry does **not** appear in the month list below
    (that list is deliberately "every day except today," since today's card
    up top already shows it). Come back tomorrow (or check the database) to
    see it listed there.

---

## Flow 9 — Staff & Payroll (manager view)

Continuing from the staff record you created in Flow 8:

1. Tap avatar → Settings → **"Staff & payroll."**
2. ✅ **Expected:** your staff card, showing name, role/branch, an **"App
   access"** badge (since you linked your email) and a **"Salary set"**
   badge (if you filled it in).
3. Tap the card to open its detail.
4. ✅ **Expected:** the month's attendance so far (should show the day you
   punched in/out in Flow 8), a **"Mark a day"** form, and a **"Payroll"**
   section.
5. In **"Mark a day,"** the date defaults to today — change it to an earlier
   date this month (type it as `YYYY-MM-DD`), tap **Absent**, tap **Save**.
6. ✅ **Expected:** that date now appears in the attendance list above with
   an **Absent** badge.
7. In **"Payroll,"** optionally enter a **Deductions** amount, then tap
   **"Generate payslip."**
8. ✅ **Expected:** a **"Past payslips"** section appears showing the current
   month and a net-pay figure.
9. Tap the download icon next to it.
10. ✅ **Expected:** a PDF downloads (web) or the share sheet opens (device)
    with a one-page payslip showing your name, role, days worked, gross pay,
    deductions and net pay.
11. Tap **"Generate payslip"** again (same month).
12. ✅ **Expected:** it succeeds again and **replaces** the same slip rather
    than creating a second one in the list — the numbers update to reflect
    the Absent day you added in step 5/6.

**Try the validation:** in "Mark a day" or "Deductions," type letters instead
of numbers where a number is expected — you should see a red "Enter a valid
number" message and the button should refuse to submit, not crash.

---

## Flow 10 — Things to check while you're at it

- **Pull-down-to-refresh** works on **Home** specifically. Other screens
  (Team, Staff, Attendance) instead auto-refresh whenever you navigate back
  to them — e.g. leave Team and reopen it after inviting someone, rather than
  pulling down on Team itself.
- **RBAC**: log in as the Manager/Staff account you created in Flow 6/7 and
  confirm the **"Team & permissions"** entry is gone from Settings (only
  Owner/Admin see it), and if it's a Staff-role login, **"Staff & payroll"**
  is gone too (only Owner/Admin/Manager see that one).
- **Branch scoping**: if you granted a Manager/Staff account access to only
  one branch, confirm they see only that branch on Home, and can't reach
  another branch's data even by nothing more than using the app normally.

---

## Known limitations (not bugs — don't file these)

- **Currency formatting** is a plain thousands-separator (`₹12,345`), not
  proper Indian lakh/crore grouping or full locale-aware formatting yet.
- **Multi-membership**: if someone already has their *own* business (from
  signing up independently) and is *separately* invited into a second one
  later, the app has no way to switch between the two — it always shows the
  first one. Signing up *directly from* an invite (Flow 7) avoids this
  entirely, since no extra business gets created in that case.
- **No revoke**: once you invite someone or grant branch access, there's no
  UI yet to take it back — only to add more.
- **No geofence UI**: branches created through the app never get GPS
  coordinates, so punch-in geofencing (an API-only capability right now)
  never actually triggers in manual testing.
- **Reports and Alerts tabs** intentionally show a "planned" notice — they're
  Phase 4/5 work, not started yet.
- **Backend tests share the dev database**: `npm test` in `backend/` reads the
  same `DATABASE_URL` as `npm run dev`, so a test run leaves its fixture
  businesses and users in the database you are clicking through.
- **The "ask a question" bar on Home** is intentionally inactive — Phase 2
  (the query engine) is blocked on an LLM provider being connected.
