# Manual Testing Guide — BizIQ

Click-by-click walkthroughs for every user-facing flow currently built. Follow
them in order the first time — several later flows (Team, Staff & Payroll)
assume branches and data already exist from earlier steps.

This covers the app as it exists today: Phases 0–1 (auth, branches, CSV
ingestion), Team & permissions (inviting, revoking, and switching between
businesses), and Attendance, Payroll & Salary Slips. Every message the server
sends is translated too, which Flow 18 checks. Reports is intentionally
unfinished — you'll see a "planned" notice there, not a bug. The AI "ask a
question" bar is gone from Home entirely (requirement 7), hidden behind a flag
until Phase 2's query engine exists. Alerts (Phase 5) has no tab at all; the Staff tab took its
slot.

---

## 0. Before you start

You run both servers yourself — nothing here starts them for you.

1. **Backend**: `cd backend`, then `npm run dev`. Confirm it printed
   `Server running on port 4000`.

   The automated suite (`npm test`) runs against a **separate** database and
   cannot touch the one you click through here. Once after cloning, and again
   whenever a new migration lands, run `npm run test:setup` to create and
   migrate it. If `.env.test` is missing, `npm test` refuses to run rather than
   falling back to your development database.
2. **Frontend**: `cd frontend`, then `npm run web` (fastest for clicking
   through in a browser) or `npm run android` if you want to test on a
   device/emulator.
3. **On a physical phone**, the app has to be able to reach the API — this is
   the usual cause of a login that fails with "cannot reach the BizIQ server".
   Pick whichever matches how the phone is connected, and make sure
   `frontend/.env`'s `EXPO_PUBLIC_API_URL` agrees:
   - **USB cable** (works even on mobile data, and needs no firewall rule):
     set the URL to `http://localhost:4000/api`. `npm start` and
     `npm run android` set the forward up for you. If the app loads fine but
     every request fails with "Cannot reach the BizIQ server", the forward was
     lost — replugging the device or restarting adb drops it, and Expo only
     restores its own Metro forward, not this one. Fix it with
     **`npm run adb:reverse`** (no restart needed; it is an OS-level port
     forward, not a JS change).
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
   branches," and the Branches stat tile went up by one — **without** closing
   and reopening the app. Every screen reads one shared branch list, so it
   should also be in the branch pickers on Products, Counter and Supply
   straight away, and in the Settings branch count.
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

   There is *no* business switcher here, and that is correct: it only appears
   for an account that belongs to more than one business — see Flow 17.
   - **"My attendance"** card (everyone sees this)
   - **"Workweek & holidays"** card (owners/admins only) — see Flow 11
   - **"Team & permissions"** card (owners/admins only)

   Staff & payroll used to live here too. It is now its own **Staff tab**,
   because it is used daily rather than configured once — see Flow 13.
   - A language **dropdown**, showing the language you are in
   - **"Log out"**

   The business id used to sit at the bottom of the business card. It is gone:
   it is a UUID and there was nothing anyone could do with it.
3. Tap the language dropdown.
4. ✅ **Expected:** a sheet slides up from the bottom with all four languages,
   the current one ticked. Press the Android back button — it closes and
   nothing changes. Tap outside it — the same.
5. Open it again and choose a different language.
6. ✅ **Expected:** the sheet closes and the whole app's text switches
   immediately (try Home, Settings, Upload — everything should be translated,
   not just this screen). Switch back to English when you're done, or continue
   testing in another language if you want to spot-check translations (the
   Hindi/Gujarati/Marathi files are machine-quality, not reviewed by native
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

## Flow 11 — Set up the workweek and holidays

Do this **before** Flow 12–14: it decides the payroll divisor, and nothing
about pay makes sense until it is right.

1. **Settings → "Workweek & holidays"** (owner/admin only).
2. The weekday chips show which days are the weekly off. **Sunday is on by
   default.** Tap Saturday as well if the business closes both days.
   - ✅ **Expected:** the change saves immediately — there is no Save button.
   - Try turning all seven on: the last one refuses. A business with no working
     days would leave payroll dividing by zero.
3. Under **"Days with no record"**, leave it on **"Count as present"** unless
   you genuinely punch every day. This is what makes payroll exception-based:
   you mark absences, and silence means the person worked.
4. **Add a holiday** — pick a date, name it (e.g. `Ganesh Chaturthi`), tap Add.
   - ✅ **Expected:** it appears in the list below with an "All branches" chip.
   - Add the same date twice: the second is refused.

**Why this matters:** working days = calendar days − week-offs − holidays.
Week-offs and holidays are **paid** — they are excluded from the divisor, so
missing one costs nothing, and someone present every working day earns exactly
their salary. Before this existed, pay was divided by calendar days and a
person with Sundays off could only ever earn about 87% of their salary.

---

## Flow 12 — Punch in from the Home screen

1. Open the app as someone who **is** a staff member (Flow 7's invited person,
   once an owner has created a `StaffMember` row linked to their email).
2. ✅ **Expected:** a **Today** card sits directly under the greeting, showing
   today's date and "Not punched in yet", with a **Punch in** button.
   - An owner with no staff record sees **no card at all** — not an empty one.
3. Tap **Punch in**. Allow location if asked.
   - ✅ **Expected:** the card flips to "Punched in at HH:MM" and the button
     becomes **Punch out**.
   - If the branch has a geofence and you are outside it, the punch is refused
     with the distance in the message.
4. Tap **Punch out**. The button disappears; the card reads "In at … · out at …".
5. **On a weekly off day**, the card says "Weekly off — enjoy your day" rather
   than nagging you to punch. The button is still there if you do work.
6. Tap the card body → the full **My attendance** history opens.

---

## Flow 13 — The Staff tab (owner/manager)

The bottom tabs are now **Home · Staff · Reports · Settings** — Staff replaced
the empty Alerts placeholder.

1. Open the **Staff** tab as the owner.
2. **Today's attendance** — ✅ **Expected:** *every* active staff member of the
   branch is listed, including anyone who has not punched, shown as "Not
   marked". The summary strip counts Present / Absent / Unmarked.
   - This is the fix for the old roster, which returned only people who already
     had a record — so "who hasn't punched in yet?" was unanswerable.
3. **Tap a person's row** → status chips appear inline. Tap **Half day**.
   - ✅ **Expected:** the row's pill updates without leaving the tab. Marking a
     day used to take four taps into the detail screen.
4. On a weekly off or a holiday, the section shows a calm one-line notice
   instead of a wall of "Not marked".
5. Scroll to **Staff** → tap a person → their detail screen opens, now with a
   **This month** summary (working days, present, absent, half days) above the
   day list.
6. Tap the **pencil** icon → **Edit staff member**. Change the phone number,
   Save. Then try **Deactivate** — it asks first, and explains that attendance
   and past payslips are kept.
   - Before this there was no way to change *anything* about a staff member
     after creating them.
7. Back on the detail screen, **Mark a day** now opens a real date picker. Check
   that it will not let you pick a future date, and that changing the month at
   the top moves the date with it.

---

## Flow 14 — Run payroll and share a payslip

**This is the acceptance test for the document rewrite.** Do all of it.

1. **Staff tab → Payroll → "Run payroll for {month}"**.
2. ✅ **Expected:** a preview listing every eligible person with gross,
   deductions and net, plus totals across the top. Anyone without a salary set
   is listed under **skipped** with the reason "No salary set".
   - If the month is still running, a notice says so — remaining days are
     excluded rather than counted as absences.
3. Tap **Generate N payslips**. ✅ **Expected:** the same list, now generated.
4. Open a payslip and tap **share**.
   - ✅ **Expected:** the PDF opens, and **the amounts show a ₹ sign**. The old
     PDF could not render `₹` at all — it printed a blank or a box.
   - ✅ **Expected:** under "Basic salary (pro-rated)" there is a line showing
     the arithmetic, e.g. `₹31,000.00 ÷ 26 working days × 22.5 = ₹26,826.92`.
     Check it by hand — that is the point of it.
   - ✅ **Expected:** the attendance table shows week-offs and holidays as
     **paid**, listed separately from days worked.
5. **Switch the app to Hindi** (Settings → language), then share the same
   payslip again.
   - ✅ **Expected:** the payslip labels render in Devanagari. Repeat in
     Gujarati and Marathi if you like. This is the whole reason the payslip is
     HTML printed by the device rather than a server-generated PDF.
6. Regenerate the same month **without** entering a deduction.
   - ✅ **Expected:** a deduction you entered earlier is still there. It used to
     be silently reset to zero.
7. **Finalize** a payslip, then try to regenerate it. ✅ **Expected:** refused.

---

## Flow 15 — What a STAFF-role person can and cannot see

1. Log in as the STAFF-role user from Flow 7.
2. Open the **Staff** tab.
   - ✅ **Expected:** *their own* attendance and payslips only. No roster, no
     staff list, no "Run payroll".
3. They can share their own payslip.
4. ✅ **Expected:** they cannot reach a colleague's attendance. If you have the
   API to hand, `GET /businesses/:id/staff/<someone else>/attendance` returns
   **403** — even if that person has branch access. This was a real hole: branch
   access is scope over a branch's *data*, not permission to read a colleague's
   HR record.

---

## Flow 15a — The operations roles (CASHIER, WAREHOUSE, DELIVERY_AGENT)

Three roles were added for the Branch Operations track. Most of what they *do*
is not built yet (Tasks 2–9 in [REQUIREMENTS.md](REQUIREMENTS.md)) — what you
can check today is that each one can be created and that its boundaries hold.

**Setup.** As the owner, Settings → Team → Invite, three times. Note that the
branch picker appears for **CASHIER** and **DELIVERY_AGENT** but **not** for
MANAGER or WAREHOUSE, because those two reach every branch.

1. **A cashier sets salary, which used to be owner/admin-only.**
   Log in as the cashier → Staff tab → pick someone at *their* branch → Edit.
   - ✅ **Expected:** the monthly salary field is there and saves.
   - ✅ **Expected:** the same person at a branch the cashier was *not* granted
     is not reachable at all.
2. **A cashier cannot run payroll.** No "Run payroll" card on the Staff tab.
3. **The warehouse desk sees branches but not people.**
   Log in as the warehouse user.
   - ✅ **Expected:** Home lists **every** branch, even though you granted it
     none.
   - ✅ **Expected:** it cannot open anyone's staff record or attendance. Via
     the API, `GET /businesses/:id/branches/<any>/attendance` returns **403**,
     not 500. (A 500 here would mean the guard added for this case is missing.)
4. **A delivery agent sees only themselves.** Staff tab shows their own
   attendance and nothing else — no roster, no colleague.
5. **A manager now reaches every branch.** This *changed*: a manager used to be
   limited to granted branches.
   - ✅ **Expected:** Home lists every branch, and Settings shows the Team and
     Work Calendar cards that used to be owner/admin-only.

---

## Flow 16 — Take access away again

Everything up to here only ever *granted* access. This is the other direction.
Do it as the OWNER, from **Settings → Team & permissions**.

1. Invite an email that has no BizIQ account (as in Flow 7), then, on the
   pending card, tap **Withdraw invite** and confirm.
   - ✅ **Expected:** the card disappears from the list.
2. Now sign up with that same email, supplying business details.
   - ✅ **Expected:** they create their **own** business rather than joining
     yours. A withdrawn invite is genuinely gone, not merely hidden.
3. Back on the Team screen, find the MANAGER from Flow 6. Tap one of their
   branch chips and confirm.
   - ✅ **Expected:** the chip disappears. Log in as that manager: they still
     have access to the business, but that branch is gone from their list.
4. As the OWNER, tap **Remove access** on the manager's card and confirm.
   - ✅ **Expected:** the card stays in the list, struck through and marked
     **Removed**. The row is kept on purpose — it carries the record of every
     attendance day that person marked.
5. Without logging that manager out first, pull to refresh on their device (or
   just navigate).
   - ✅ **Expected:** requests now fail. Access ends on the next request, not
     when their session expires.
6. Check what the app will *not* let you do:
   - ✅ **Expected:** your own card has no **Remove access** action. Nobody can
     revoke themselves, which is also what stops a business losing its only owner.
   - ✅ **Expected:** logged in as an ADMIN, the OWNER's card has no **Remove
     access** action either.
7. Invite the removed manager again, by the same email, as a **STAFF** member.
   - ✅ **Expected:** they are active again immediately, now with the STAFF
     role — not the MANAGER role they had before. Re-adding someone is a fresh
     decision about their access, and re-inviting is the only way back.

---

## Flow 17 — Switch between two businesses

Needs an account that belongs to more than one business. The quickest way to
get one is now Flow 17a below — add a second business to the account you are
already signed in as. (The older route still works: sign up a fresh account
with its own business, then invite that email into your first business.)

1. Log in as that second account and open **Settings**.
   - ✅ **Expected:** a **Business** card listing both businesses by name, with
     the role held in each, and a tick on the current one.
2. Tap the other business.
   - ✅ **Expected:** the tick moves. The Business details below it — name,
     industry, currency, timezone — change to the other business.
3. Go to **Home** and to the **Staff** tab.
   - ✅ **Expected:** branches, sales figures and staff are those of the newly
     selected business. Your role may differ between the two, so what Settings
     and the Staff tab offer can differ as well.
4. Force-close the app and reopen it.
   - ✅ **Expected:** it opens on the business you switched to, not the other one.
5. Log out and log in as an owner who belongs to only one business.
   - ✅ **Expected:** no Business card in Settings at all. The switcher does not
     appear when there is nothing to switch to.
6. As the other business's owner, remove this account's access (Flow 16), then
   return to this device and reopen the app.
   - ✅ **Expected:** it falls back to the business they still belong to rather
     than getting stuck on the one they were removed from.

---

## Flow 17a — Add a second business to the same account

Requirement 16: one account, several businesses, rather than one account each.

1. Signed in as an **owner**, open **Settings**.
   - ✅ **Expected:** an **Add another business** row. It is there even if you
     own only one business — that is the point of it.
   - ✅ **Expected:** log in as an **admin, manager, cashier, warehouse user or
     delivery agent** and the row is **not** there. Starting a business is the
     owner's act; an admin runs the business they were given.
   - ✅ **Expected:** an owner who is also a cashier in someone else's business
     sees it while switched to their own and not while switched to the other.
     Settings means "this business". Switch back to add a third.
2. Tap it.
   - ✅ **Expected:** a form with the same fields signup asked for, already
     filled in with the current business's industry, country, currency and
     timezone. Only the name is blank.
3. Enter a name and tap **Create business**.
   - ✅ **Expected:** the sheet closes and the app is now acting under the new
     business. Settings shows its name, and Home shows **no branches** — it is
     brand new, not a copy of the first.
4. Open **Settings** again.
   - ✅ **Expected:** the **Business** card has appeared, listing both, with the
     tick on the new one. You are OWNER of both.
5. Switch back to the first business.
   - ✅ **Expected:** its branches, sales and staff return. Nothing you did in
     the new business is visible here.
6. Add a branch to one of them, then switch to the other.
   - ✅ **Expected:** the branch belongs only to the business it was created in.
7. Try to create a business with a blank name, or type a nonsense timezone like
   `Mars/Olympus`.
   - ✅ **Expected:** it is refused with a message naming the field, and no
     half-made business appears in the switcher.

---

## Flow 17b — Products, and what each branch charges

Requirement 4: the catalog on Home after login, and each branch able to add its
own products and set its own prices. Needs at least two branches.

1. As an owner, open the app.
   - ✅ **Expected:** **Your products** appears on Home, above the branch list.
     With nothing added yet it offers to add the first one.
   - ✅ **Expected:** the Home tab's icon is a house, not a speech bubble, and
     there is no "ask" bar at the bottom of the screen (requirement 7).
2. Open the **Products** tab → **Add**.
   - ✅ **Expected:** a scope choice — *The whole business* or *One branch only* —
     each explaining what it means.
3. Add a product to **the whole business** (say Masala Chai, sold by `cup`,
   sells for 20).
   - ✅ **Expected:** it appears in the Products tab, and on Home.
4. Switch the Products tab to your other branch.
   - ✅ **Expected:** Masala Chai is there too, at the same 20.
5. Open Masala Chai → **Price at one branch**. Set 25 for the first branch and
   save.
   - ✅ **Expected:** the Products tab shows **25** with a *Branch price* label
     at that branch, and still **20** at the other. This is the whole point of
     the override.
6. Open it again, clear both price fields and save.
   - ✅ **Expected:** back to 20 at both.
7. Add a product with **One branch only**, pointed at your first branch.
   - ✅ **Expected:** it is labelled **Branch only**, appears at that branch, and
     does **not** appear when you switch the Products tab to the other branch.
8. Open any product → **Withdraw from sale**.
   - ✅ **Expected:** it disappears from the catalog at every branch, and is not
     deleted — putting it back on sale restores it.

---

## Flow 17c — What each role's app actually looks like

The tab bar and the screens behind it are now decided by role. Use the accounts
from Flow 15a.

1. Log in as the **cashier**.
   - ✅ **Expected:** tabs **Home · Products · Staff · Settings**. No Reports.
   - ✅ **Expected:** Home leads with the catalog for their branch.
   - ✅ **Expected:** in Products they can add a product for *their* branch, and
     the whole-business option is not offered at all — not offered-and-refused.
2. Log in as the **warehouse** user or the **delivery agent**.
   - ✅ **Expected:** tabs **Home · Staff · Settings** — no Products, no Reports.
   - ✅ **Expected:** Home says plainly that their screens are still being
     built, rather than showing an empty page. Their tools arrive in Task 5.
3. Log in as an **owner or manager**.
   - ✅ **Expected:** all five tabs, and Home shows punch, catalog, the sales
     tiles, the branch list and the upload card.
   - ✅ **Expected:** Home does **not** offer "Order raw material" or "Your
     deliveries". An owner holds every capability in the app, but a branch
     orders and an agent delivers — neither is the owner's job. What they get
     instead is **Raw material catalog**, which is where prices are set.
   - ✅ **Expected:** the cashier still has "Order raw material", and the
     delivery agent still has "Your deliveries". Same capabilities, different
     jobs.
4. With an account in two businesses (Flow 17a), switch business in Settings
   where your role differs between the two.
   - ✅ **Expected:** the tab bar changes to match the role in the business you
     switched to. Anything half-typed in a form is discarded — that is
     deliberate, since forms belong to the business you were in.
5. Have an owner change that person's role on another device, then background
   this app and bring it back.
   - ✅ **Expected:** the tabs update to the new role without a force-close.

---

## Flow 17d — The counter: tokens, the running total, and editing

Requirement 1. Log in as the **cashier** (Flow 15a) — they get a **Counter**
tab. An owner or manager reaches the same screen from Home instead, since the
tab bar only has room for five; opened that way it carries an **✕** in the
corner, which the cashier's tab does not (there would be nothing to close).

Needs at least one product with a price at that branch (Flow 17b).

1. Open **Counter**.
   - ✅ **Expected:** today's takings, the token count and how many are still
     open across the top; a grid of products below; a bar at the bottom.
   - ✅ **Expected:** every product tile is wide enough to read — a name over at
     most two lines and the price beneath it. Three across on a normal phone,
     two on a small one, more on a tablet. Nothing reading as a vertical column
     of single letters.
2. Tap a product with nothing open.
   - ✅ **Expected:** a token is issued **immediately** and the item goes on it.
     The bottom bar shows the token number and the total. You should not have
     had to press "New order" first.
   - ✅ **Expected:** that product's tile turns blue and shows **1**.
3. Tap two more products, and use the + / − next to a line.
   - ✅ **Expected:** the total changes with every tap, and each tile's badge
     counts up with it. Pressing − down to zero takes the line off entirely and
     clears that tile's badge.
   - ✅ **Expected:** put a dozen different items on one token — the bottom bar
     stops growing and scrolls instead, so the product grid stays reachable.
4. Press **Hand over**.
   - ✅ **Expected:** the token moves to *Today's tokens* marked "Handed over",
     and the bottom bar goes back to "New order".
5. Tap that handed-over token in the list, then add another item to it.
   - ✅ **Expected:** it works. Closing an order hands it over; it does **not**
     freeze it. This is the "they can edit it" half of requirement 1.
6. Ring up a few more tokens.
   - ✅ **Expected:** the numbers go up by one each time and never repeat.
7. Go to **Home** (or Reports later) and look at the sales figure.
   - ✅ **Expected:** it has gone up by exactly what you rang up. Counter sales
     and uploaded CSV sales land in the same place.
8. Press and hold a token → **Void**.
   - ✅ **Expected:** it is marked Voided, the day's takings drop by its amount,
     and that token number is never handed out again. The row stays in the list
     but greys out with its amount struck through — a void is information, not
     a deletion.
9. Switch to your other branch at the top.
   - ✅ **Expected:** its tokens number independently — a quiet branch is still
     on low numbers while a busy one is high.
   - ✅ **Expected:** with three branches, the odd one sits across its own row
     rather than leaving a half-width gap beside it.
10. Switch the app to Gujarati or Hindi (Settings → language) and come back.
    - ✅ **Expected:** the three tiles across the top still line their numbers up
      with each other even where a label needs two lines, and no product tile
      has collapsed. Indic labels run longer than the English ones, so this is
      where a layout that only just fits stops fitting.

---

## Flow 17e — Closing the day

The floor that stops an edit quietly rewriting a number you have already been
shown.

1. With at least one token still **Open**, try to close the day.
   - ✅ **Expected:** refused, telling you how many are still open.
2. Hand over or void everything, then close the day.
   - ✅ **Expected:** it closes, and a **Day closed** badge appears.
3. Try to edit any of that day's tokens, or start a new one.
   - ✅ **Expected:** both refused, saying the day has been closed. **New order**
     is visibly greyed out rather than failing only once you press it.
4. Reopen the day.
   - ✅ **Expected:** editing works again. Closing by mistake has to be
     recoverable, or the guard becomes a trap.

---

## Flow 17f — Stock the raw-material catalog

Requirement 5's first half. Log in as the **warehouse** person (Flow 15a) — they
get a **Desk** tab. An owner or admin does this from Home → *Order raw material*.

The catalog is **business-wide**, not per branch: one warehouse, one list, one
price. That is the opposite of Products (Flow 17b), and deliberate — a branch
sells its own menu but does not keep a private list of flour.

1. Open the catalog and press **Add an item**.
   - ✅ **Expected:** name, unit, category and price. Only name and unit are
     required.
2. Add three: `Flour / kg / 45`, `Milk / litre / 60`, and one with **no price** at
   all, say `Saffron / gram`.
   - ✅ **Expected:** all three save. The unpriced one is listed with "No price
     yet" rather than ₹0.
3. Try to add `flour` again, in lower case.
   - ✅ **Expected:** refused — the catalog already has one. Case does not make it
     a different sack.
4. Open Flour and press **Stop supplying this**.
   - ✅ **Expected:** marked withdrawn. It stays in the desk's list so it can be
     brought back, and disappears from what a cashier can order.
5. Bring it back with **Supply it again**.
   - ✅ **Expected:** orderable once more. Withdrawing is never a delete: every
     past order still names what was on it.

---

## Flow 17g — A branch orders raw material

Requirement 5. Log in as the **cashier** — they get a **Supply** tab. Needs
Flow 17f done first.

1. Open **Supply** and tap **+** beside Flour, then beside Milk.
   - ✅ **Expected:** each tile's chip shows what is now on the order, and a bar
     appears at the bottom with the count and the running total.
2. Tap **+** on Flour again.
   - ✅ **Expected:** the quantity goes to 2 — one line, not two. A picker should
     never have to add two rows of flour together.
3. Try to add the unpriced item.
   - ✅ **Expected:** refused, naming it. An unpriced item is un-orderable rather
     than free.
4. Press **Review order**, then type `20` into the Flour quantity.
   - ✅ **Expected:** the line total and the order total follow. Quantities are
     typed here rather than tapped up in the catalog, because raw material is
     ordered in twenties.
5. Press **−** on Milk until it reaches zero.
   - ✅ **Expected:** the line comes off entirely.
6. Choose **Cash on delivery** and press **Place order**.
   - ✅ **Expected:** it becomes an order with a number, and the screen moves to
     its detail. Payment reads "Cash on delivery" — nothing is outstanding, that
     is simply how it will be paid.
7. Go back to Supply and add something again.
   - ✅ **Expected:** a **fresh** cart. The old one is an order now.
8. Start another order, choose **Paid online**, and try to place it with the
   reference box empty.
   - ✅ **Expected:** refused. A reference the warehouse can check against its own
     records is the whole content of "paid online" in a system that deliberately
     never takes the money.
9. Type a reference and place it.
   - ✅ **Expected:** payment shows **Paid** — claimed, not settled. The warehouse
     confirms it in Flow 17h.

---

## Flow 17h — The warehouse desk

Requirement 3: "one person can see all the branches' incoming supply orders."
Log in as the **warehouse** person. Ideally place orders from two different
branches first (Flow 17g, once as each branch's cashier).

1. Open **Desk**.
   - ✅ **Expected:** orders from **every** branch, oldest first, each saying which
     branch it came from. A queue read newest-first starves the order the branch
     is already on the phone about.
   - ✅ **Expected:** no carts. A branch still adding things is not an order, and a
     queue where some rows are not real work stops being trusted.
2. Open the online-paid order and press **Found it** under the payment.
   - ✅ **Expected:** payment becomes **Verified**, and the history records who
     checked it.
3. Open the COD order and try the same.
   - ✅ **Expected:** refused — there is nothing to check yet. Cash on delivery is
     paid on delivery.
4. Press **Accept** and choose **+60 min**.
   - ✅ **Expected:** accepted, and an expected time appears.
5. Press **Mark packed**, then **Dispatch**.
   - ✅ **Expected:** each step moves one place. There is no way to skip one: the
     status machine refuses it on the server, not just in the buttons.
   - ✅ **Expected:** **Dispatch** asks who is taking it before it goes — see
     Flow 17k, which is that panel on its own.
6. On another placed order, press **Cannot supply**, choose *Out of stock*, add a
   note, and submit.
   - ✅ **Expected:** cancelled, with the reason and your note on its history. This
     is the desk's verb; the branch's own **Cancel order** is a different act and
     is recorded differently.
7. As the **cashier**, open that order.
   - ✅ **Expected:** they see the rejection and the reason, in their own language.
     The reason travels as a code, so it reads in Gujarati for a Gujarati device
     even though the warehouse person typed nothing in Gujarati.

---

## Flow 17i — Delays, delivery, and what the cashier sees

Requirements 9, 11 and 12.

1. As the **warehouse**, open an accepted order and press **Report a delay**.
   Enter `30`, choose *Out of stock*, and submit.
   - ✅ **Expected:** the order's history gains "+30 min — Out of stock", and if a
     time was promised it moves by exactly thirty minutes.
2. As the **cashier**, open **Supply orders** from Home (or the order from your
   tracking list).
   - ✅ **Expected:** the delay shows on the card without opening it, and the full
     history is on the detail. This is requirement 9's whole point — the branch
     finds out without ringing anyone.
3. As the **delivery agent** (Flow 15a), open **Deliveries**. For this step,
   dispatch the order with **Nobody yet** chosen in the panel.
   - ✅ **Expected:** the dispatched order is there even though nobody was named:
     an unassigned dispatch goes to every agent covering that branch, which is
     how it gets picked up. Naming one is Flow 17k.
4. Press **Report a delay**, choose *Traffic*, submit.
   - ✅ **Expected:** it lands on the same history as the warehouse's delay.
     Requirement 9 has two ends and both write to one stream.
5. Press **Mark delivered** on a **cash on delivery** order.
   - ✅ **Expected:** it asks first — *"Have you taken ₹… from the … cashier?"* —
     naming the amount and the branch. The goods arriving is not evidence the
     money did, and only you at the counter know.
6. Press **Not yet**.
   - ✅ **Expected:** nothing happens. The order stays dispatched and unpaid,
     which is where it actually is and where somebody can still chase it.
7. Press **Mark delivered** again and answer **Yes, I have the money**.
   - ✅ **Expected:** delivered, payment becomes **Paid**, and the history gains
     its own line — *Cash taken on delivery* — saying who took it.
8. Do the same on an **online** order.
   - ✅ **Expected:** no question, because nothing is outstanding. Its payment
     state is left exactly as the warehouse left it: delivering something is not
     evidence that its payment cleared.
9. Try to report a delay on the delivered order now.
   - ✅ **Expected:** refused. A delivered order cannot be late.
10. As the **cashier**, place a new order and immediately press **Cancel order**.
    - ✅ **Expected:** withdrawn — the warehouse has not taken it on yet.
11. Have the warehouse **Accept** another one, then try to cancel it as the cashier.
    - ✅ **Expected:** refused, telling you to ask the warehouse to reject it
      instead. Somebody has started picking it.

---

## Flow 17j — The delivery agent punches from the road

Requirement 20. A geofence assumes a fixed place of work; a delivery agent has
none, so the radius does not apply to them — and the trade is that their
location stops being optional.

Needs a branch with a geofence (Flow 19) and a **delivery agent** who also has a
staff record at some branch, so they have attendance at all.

1. Invite a delivery agent (Flow 15a).
   - ✅ **Expected:** the invite screen does **not** ask which branches. They are
     not tied to one — they deliver to all of them.
2. As that agent, open Home and punch in while nowhere near the branch.
   - ✅ **Expected:** it works. A cashier standing in the same spot is refused
     (Flow 19), and that is the intended difference.
3. Turn the phone's location off and try to punch out.
   - ✅ **Expected:** refused, saying your punches record where you were. The
     exemption is not "no location" — it is "location instead of a radius".
4. Turn location back on and punch out.
   - ✅ **Expected:** it works.
5. As the **admin or manager**, open Staff → that agent → their attendance.
   - ✅ **Expected:** the day shows the in and out times, and a **Punched here**
     chip. Tapping it opens the spot in a map.
6. Look at a day someone was marked present by hand rather than punching.
   - ✅ **Expected:** no times and no chip — there is nothing to show, and the row
     stays as it was.
7. As the agent, open **Deliveries** with an order dispatched to a branch nobody
   assigned them to.
   - ✅ **Expected:** it is in their queue. They carry to every branch.
8. As the agent, try to open a branch roster or a colleague's record.
   - ✅ **Expected:** refused. All-branch scope covers **data**, never people —
     the same line the warehouse desk sits on.

---

## Flow 17k — Giving the run to an agent, and telling them where to go

Requirement 21. Two halves of one job: somebody has to be named, and the person
named has to be able to find the place.

Needs two delivery agents (Flow 15a, twice) and a branch with an address. Set
the address first: **Settings → the branch → Branch settings → Delivery
address**. Type a street line *and* a landmark on a second line, add the PIN
code, and save.

1. As the **warehouse**, take an order to **packed** (Flow 17h) and press
   **Dispatch**.
   - ✅ **Expected:** a panel asking *Who is taking it?*, listing your delivery
     agents — and **nobody else**. The owner, you at the desk, and every cashier
     are absent: they can all technically close a delivery, but carrying is not
     their job.
   - ✅ **Expected:** each row says whether they are on duty and how much they
     are already carrying, and the freest one is already selected. One press
     from here.
2. Look at an agent who has not punched in today.
   - ✅ **Expected:** "Not punched in today", sorted below the ones who have —
     but still selectable. Availability is a caption, not a lock; you know
     things the app does not.
3. Have one agent punch in (Flow 17j) and reopen the panel.
   - ✅ **Expected:** they now say **On duty since HH:MM** and have moved to the
     top. That is the attendance module answering, not a second idea of "free".
4. Choose an agent and press **Dispatch**.
   - ✅ **Expected:** dispatched, the order header says **Given to *name***, and
     the history gains a row saying the same with a time.
5. Press **Change the agent** and pick the other one.
   - ✅ **Expected:** it moves. The order appears in the new agent's
     **Deliveries** and disappears from the first agent's — a run belongs to one
     person at a time.
6. Press **Change the agent** and pick the *same* person again.
   - ✅ **Expected:** nothing new on the history. A timeline saying a run was
     given to Ravi and then given to Ravi is one nobody reads twice.
7. As the **delivery agent** who now has it, open the order.
   - ✅ **Expected:** a **Deliver to** card near the top with the branch name,
     the street line exactly as it was typed — including the second line — and
     the city and PIN code beneath.
   - ✅ **Expected:** an **Open in maps** chip. Tapping it opens the branch in
     whichever map app the phone has: at its coordinates if the branch has them
     (Flow 19), at the written address otherwise.
8. Open an order for a branch whose address was never filled in.
   - ✅ **Expected:** "No address saved for this branch", and no map chip.
     Nothing fails — the agent has the branch name and can ring the shop.
9. As the **cashier** who placed it, open the same order.
   - ✅ **Expected:** the same **Deliver to** card. This is the one place the
     address a rider will be sent to is visible, which is how a wrong one gets
     noticed before somebody is standing in the wrong street.
10. As the cashier, try to find **Change the agent**.
    - ✅ **Expected:** it is not there. Who carries it is the warehouse's call.

---

## Flow 17l — A warehouse is a location, and who a staff member is

Requirement 23. Adding a staff member used to demand a branch, and a warehouse
employee had no true answer — so there was nowhere to file them and no way for
them to punch in.

1. As the **owner**, Home → **Branches** → **Add branch**.
   - ✅ **Expected:** the form opens by asking **what this place is** — Branch
     (sells and orders) or Warehouse (supplies the branches).
2. Choose **Warehouse**, name it, give it a code, press **Use my current
   location**, set a radius, and save.
   - ✅ **Expected:** created. It appears in the branch list marked as a
     warehouse, so the list and the "branches" count in Settings agree with
     each other — the count is the selling network, and the warehouse is not
     part of it.
3. Open the **Counter** and the **supply catalog** and look at their branch
   pickers.
   - ✅ **Expected:** the warehouse is **not** offered in either. It has no till
     and it does not order raw material from itself. (The server refuses both
     as well, so this is a tidy screen rather than the only defence.)
4. Staff → **Add staff**.
   - ✅ **Expected:** the first card is **"Who are they?"**, and the **account
     email is its first field** — before the location question, not after it.
     That order is the whole fix: the email is what decides whether "which
     branch do they work at" is even the right question.
5. Type the email of the person you invited as a **delivery agent**
   (Flow 15a) — the case that exposed this.
   - ✅ **Expected:** a line appears saying they are already on the team as
     Delivery agent, and the **job title fills in as "Delivery agent"**. Type
     over it and your text wins; clear the email and the suggestion goes.
   - ✅ **Expected:** the location question becomes **"Where is their base?"**
     with a sentence saying it only decides where attendance and payslips are
     filed — and the **warehouse is already selected**. A delivery agent works
     at none of the branches, so being asked to pick one was the bug.
6. Do the same with the **warehouse** person's email.
   - ✅ **Expected:** identical behaviour. Both reach every branch, and the
     screen asks the matrix rather than naming either role.
7. Type a **cashier's** email instead.
   - ✅ **Expected:** it names them, and the question stays "which branch do
     they work at" with nothing preselected. A branch-scoped person is never
     guessed at: being filed at the wrong shop silently is worse than a tap.
8. Do the same as a **cashier** rather than the owner.
   - ✅ **Expected:** no recognition line at all — reading the team needs a
     permission a cashier does not have — and the screen behaves as it always
     did.
9. Save the delivery agent, then log in as them and **punch in from anywhere**.
   - ✅ **Expected:** it works, with no geofence and the location recorded
     (Flow 17j). Their attendance and payslip are filed against the warehouse.
     Without the staff record made in step 5 there is no attendance at all —
     that chain is what "so they will do punch-in punch-out" needs.
10. As the warehouse person, punch in while at the warehouse.
    - ✅ **Expected:** it works, against the warehouse's own radius.
11. Try to change the warehouse back to a branch in **Branch settings**.
    - ✅ **Expected:** allowed. A location created as the wrong kind would
      otherwise be stuck as one forever.

---

## Flow 17m — Asking before something cannot be undone

1. As a **cashier**, place a supply order and press **Cancel order**.
   - ✅ **Expected:** it asks first, and **nothing happens** if you back out.
     Withdrawing cannot be undone — placing it again means rebuilding the cart.
2. As the **warehouse**, open the raw-material catalog, edit an item and press
   **Stop supplying this**.
   - ✅ **Expected:** it asks. Press the same button again afterwards to restore
     it.
   - ✅ **Expected:** restoring does **not** ask. A question in front of an undo
     is only friction.
3. Do the same with **Withdraw** on a product (Flow 17b), **Void** on a token
   (Flow 17d), removing a team member (Flow 16) and deactivating a staff member.
   - ✅ **Expected:** every one asks, in the same shape and the same language.
4. On any of those dialogs, press the Android **back button** rather than either
   choice.
   - ✅ **Expected:** it closes and nothing happens — and the button you pressed
     is usable again rather than stuck spinning.

---

## Flow 18 — Errors in your own language

The app has always been translated; the *messages from the server* were not, so
a wrong password read "Invalid email or password" no matter which language was
selected. Switch to Hindi, Gujarati or Marathi first (Settings → language), then
provoke each of these and read what comes back.

1. **Log out and log in with the wrong password.**
   - ✅ **Expected:** the message is in the selected language, not English.
2. **Sign up with an email that already has an account.**
   - ✅ **Expected:** translated, and it names the actual problem rather than a
     generic failure.
3. **Add a branch with the name left blank.**
   - ✅ **Expected:** the field error is translated, *and it names the field by
     its label* ("Name", "नाम") rather than the API's internal field name.
4. **Upload a CSV with a bad row** (the template's own sample, with one
   quantity emptied out — Flow 4).
   - ✅ **Expected:** the row problems under the result are translated. The
     column name inside them (`quantity`, `occurred_at`) stays in English on
     purpose — it is the literal heading in your file, which is what you have to
     go and fix.
5. **Try to remove your own access** from Team & permissions.
   - ✅ **Expected:** the app does not offer the button at all. If you call the
     API directly, the refusal comes back with a code the app can translate.
6. **Punch in from outside a branch's geofence** (Flow 8, needs a radius set).
   - ✅ **Expected:** the distance and the allowed radius appear as numbers
     inside a translated sentence — not an English sentence with numbers in it.

**If a message comes back in English** in a non-English language, that is the
one real bug this flow is looking for: it means the code has no entry in that
locale file. `cd frontend && npm run lint:errors` finds it mechanically, and CI
runs the same check.

---

## Flow 19 — Branch settings and the punch-in geofence

Until now a branch's timezone and geofence were write-once: the Add Branch form
never captured coordinates, and nothing in the app called the endpoint that
could change them afterwards. Both are now reachable.

1. On **Home**, tap any branch in the list.
   - ✅ **Expected:** a Branch settings sheet opens. Branches with a radius set
     show a small location pin in the list; ones without do not.
2. Tap **Use my current location** and allow the permission.
   - ✅ **Expected:** latitude and longitude fill in to six decimal places.
   - If you decline the permission, ✅ **Expected:** a message saying so —
     not a button that silently does nothing.
3. Enter a radius of, say, `75` and save.
   - ✅ **Expected:** the sheet closes and the pin appears against that branch.
4. Reopen it and tap **Turn off geofencing**, then save.
   - ✅ **Expected:** the radius clears, *and the coordinates stay*. The branch
     still knows where it is; it has just stopped enforcing a distance.
5. Try setting a radius on a branch that has no location yet.
   - ✅ **Expected:** the Save button stays disabled and the form says to set
     the location first. A radius with nothing to measure from would never
     enforce anything.
6. Set a deliberately wrong **timezone** (e.g. `Mars/Olympus_Mons`) and save.
   - ✅ **Expected:** refused. This one matters more than it looks: the
     timezone decides which calendar day a punch near midnight belongs to, and
     therefore which month it is paid in.
7. Now create a **new** branch (Home → Add branch). Below the branch details
   there is an optional geofence section.
   - ✅ **Expected:** you can set the location and radius during creation, and
     leaving them empty is fine — that is an ordinary branch with no geofence.
8. Log in as a MANAGER who has access to that branch and open it from Home.
   - ✅ **Expected:** saving is refused. Branch settings are owner/admin only,
     because the radius and timezone feed payroll.

With a geofence set, Flow 8's punch-in is worth re-running from outside the
radius — see Flow 18 step 6 for what that message should look like.

---

## Known limitations (not bugs — don't file these)

- **No overtime, leave balances or statutory deductions**: hours from
  punch-in/out are stored but do not affect pay; `LEAVE` is unpaid with no
  entitlement tracking; and deductions are one manually-entered amount — there
  is no PF/ESI/TDS breakdown and no salary advances.
- **No reinstate button**: removing someone's access is undone by inviting the
  same email again (Flow 16), not by a button on the removed row. That is
  deliberate — re-adding someone means choosing their role and branches afresh —
  but it does mean the Team screen accumulates struck-through rows with no way
  to hide them.
- **Removed rows are never cleaned up**: a membership revoked years ago still
  appears in the team list, because the row carries the audit trail of the
  attendance days that person marked.
- **Reports and Alerts tabs** intentionally show a "planned" notice — they're
  Phase 4/5 work, not started yet.
- **Nothing notifies anyone yet.** Every supply-order step is recorded and
  visible the next time someone opens the screen, but no push goes out — that is
  Task 7 (Firebase). So a warehouse person has to look at the Desk to see a new
  order, and a cashier has to open the order to find a delay.
- **An agent is not told they have been given a run.** Dispatch names somebody
  now (Flow 17k), and the run appears in their Deliveries queue — but nothing
  pushes. They have to open the app. That is Task 7 again.
- **A branch created before this build has no delivery address**, so an order to
  it shows "No address saved for this branch" until somebody fills one in under
  Settings → branch → Branch settings. Nothing fails; the agent simply has the
  branch name and no street.
- **Cash stops being tracked once the agent has it.** A cash-on-delivery order
  records that the agent took the money from the branch (Flow 17i), which is
  what makes it Paid. Nothing records the agent then handing it in at the
  warehouse — there is no cash-in-hand figure per agent and no hand-over step.
  If that matters, it is a feature, not a bug report.
- **A warehouse location is not in the reports.** It is a place with staff,
  attendance and payslips, and it is deliberately left out of the branch
  pickers for selling and ordering — which also means it is not a row in
  anything that compares branches. That is right for sales and will need
  deciding again when Task 8 works out net profit, since a warehouse has costs.
- **"Available" only means punched in.** An agent who does not use punch-in, or
  has no staff record, shows as "Attendance not tracked" forever. They are still
  selectable — availability is a caption, not a lock — but the desk gets no help
  from it at a business that does not run attendance.
- **Expenses are the remaining gap for a cashier** (Task 6). The catalog,
  counter billing, supply ordering, and their branch's staff and pay all work
  today.
- **The "ask a question" bar and the AI notice are gone from Home**, along with
  the chat-bubble Home tab icon — requirement 7. They are hidden behind a flag,
  not deleted, and come back when the query engine does (Phase 2).
- **A manager's or delivery agent's branch grants no longer do anything.**
  Requirement 14 made the manager business-wide and requirement 20 did the same
  for the delivery agent, who delivers to every branch. The Team screen still lets you remove a manager's branch
  access and the request succeeds, but it changes nothing about what they can
  reach. The invite screen already stops asking for branches for that role; the
  Team screen's removal affordance is the remaining loose end.
- **Salary changes overwrite with no history**: editing a staff member's monthly
  salary replaces the old figure outright. Regenerating an *unfinalized* payslip
  for a past month will therefore use the new salary — finalize a slip to lock it.
- **Some text from the server stays English by design**: CSV column names
  inside upload row errors (they are the literal headings in your file), the
  payslip document's own labels, and the occasional message that comes from a
  third-party library rather than from BizIQ.
