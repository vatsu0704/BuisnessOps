# Manual Testing Guide — HisabKitab

Click-by-click walkthroughs for every user-facing flow currently built. Follow
them in order the first time — several later flows (Team, Staff & Payroll)
assume branches and data already exist from earlier steps.

This covers the app as it exists today: Phases 0–1 (auth, branches, CSV
ingestion), Team & permissions (inviting, revoking, and switching between
businesses), and Attendance, Payroll & Salary Slips. Every message the server
sends is translated too, which Flow 18 checks. Reports is now the real branch ×
month grid with net profit (Flow 17r), and compares every business one account
holds (Flow 17s); the day and the month export to a spreadsheet and a printable
summary (Flow 17t). A branch has one cashier and a cashier has one branch, swapped
with a confirmation that names who is displaced, and every refusal now says what the
rule is rather than that a rule exists (Flow 17u). The AI "ask a
question" bar is gone from Home entirely (requirement 7), hidden behind a flag
until Phase 2's query engine exists. Alerts (Phase 5) has no tab at all; the Staff tab took its
slot.

---

## 0. Before you start

You run both servers yourself — nothing here starts them for you.

1. **Backend**: `cd backend`, then `npm run dev`. Confirm it printed
   `Server running on port 4000`.

   If it prints **"Refusing to start"** instead and exits, read the bullet it
   gives you: `DATABASE_URL` or `JWT_SECRET` is missing from `backend/.env`.
   That check is deliberate — the server used to start without a `JWT_SECRET`
   and only fail at the first sign-in, as a 500 that read like a broken
   database. `.env.example` shows how to generate a secret.

   The automated suite (`npm test`) runs against a **separate** database and
   cannot touch the one you click through here. Once after cloning, and again
   whenever a new migration lands, run `npm run test:setup` to create and
   migrate it. If `.env.test` is missing, `npm test` refuses to run rather than
   falling back to your development database.
2. **Frontend**: `cd frontend`, then `npm run web` (fastest for clicking
   through in a browser) or `npm run android` if you want to test on a
   device/emulator.
3. **On a physical phone**, the app has to be able to reach the API — this is
   the usual cause of a login that fails with "cannot reach the HisabKitab server".
   Pick whichever matches how the phone is connected, and make sure
   `frontend/.env`'s `EXPO_PUBLIC_API_URL` agrees:
   - **USB cable** (works even on mobile data, and needs no firewall rule):
     set the URL to `http://localhost:4000/api`. `npm start` and
     `npm run android` set the forward up for you. If the app loads fine but
     every request fails with "Cannot reach the HisabKitab server", the forward was
     lost — replugging the device or restarting adb drops it, and Expo only
     restores its own Metro forward, not this one. Fix it with
     **`npm run adb:reverse`** (no restart needed; it is an OS-level port
     forward, not a JS change).
   - **Same Wi-Fi as this PC**: set the URL to this PC's LAN IP, e.g.
     `http://192.168.1.98:4000/api`. Windows Firewall must allow inbound
     connections for the exact `node.exe` running the backend.

   - **A release APK against the hosted API**
     (`https://buisnessops.onrender.com/api`): nothing has to be running on this
     PC, and no cable or firewall rule is involved. The free instance sleeps
     after a quiet spell and takes about half a minute to wake, so the first
     sign-in then is slow rather than broken — the app starts waking it the
     moment it opens, and sign-in, sign-up and session restore wait 45 seconds
     before giving up while everything after them still fails fast at 15.

   `EXPO_PUBLIC_*` values are baked in when Metro starts — and, for a release
   APK, when `assembleRelease` bundles — so after editing `.env` restart Metro
   with the cache cleared (`npx expo start -c`), or rebuild the APK. Nothing
   re-reads `.env` at runtime.
4. Open the app (the web build opens automatically in your browser; for
   `npm run android` open it on the device/emulator).
5. If the database has no account you know the password for, start at Flow 1 —
   there is no demo login to use.
6. For flows that read history — Reports (17r, 17s), the month-end export (17t),
   payroll — load seven months of data first with
   `backend/scripts/seed-test-data.sql`. It lands every month on a fixed net
   profit, and gives every role orders waiting at each stage.
   [TEST_DATA_SEED.md](TEST_DATA_SEED.md) says how to run it, what each login
   will see, and how to remove it again.

Two browser profiles are genuinely useful for this app (owner in one, a
teammate in another) — e.g. a normal window plus an Incognito/private window,
or two different browsers. Flows 7 and 8 call this out explicitly.

---

## Flow 0 — Launch: the name, the icon and the splash

The product is **HisabKitab**. Its launcher label, icon and system splash are
compiled into the APK, so **a build from before the rename still shows "BizIQ"
and the old indigo icon** — rebuild first (`npx expo prebuild -p android`, then
`npm run android`). The web build has no launcher; steps 3–5 apply to it too.

1. Find the app on the phone's home screen or in the app drawer.
   - ✅ **Expected:** it is labelled **HisabKitab**, and its icon is the HK mark —
     two dark stems crossed by a blue ribbon, with a blue arm — on white.
2. Force-stop it (App info → **Force stop**), then open it.
   - ✅ **Expected:** the system's own splash is white with the mark in the
     middle — never black, never the old indigo, never the whole launcher tile
     cropped into a circle. The clock and battery in the status bar are dark, so
     they stay readable on the white.
3. Watch the app's own splash take over.
   - ✅ **Expected, in this order:** the left stem, then the right stem, rise into
     place; the blue ribbon sweeps across them from left to right; the arm of the
     K flicks out; then the whole logo lifts a little as **HisabKitab** — "Hisab"
     in black, "Kitab" in blue — and the tagline **"Your Business. All in One."**
     fade in beneath it. After about two seconds it fades into the first screen.
   - Change the language (step 4) and relaunch: the tagline follows it (Gujarati:
     *તમારો વ્યવસાય. બધું એક જ જગ્યાએ.*). The name does not — a brand name is the
     same in every language.
   - With **Remove animations** on (Settings → Accessibility), the logo and the
     name appear whole instead of drawing themselves in.
4. On **Login**:
   - ✅ **Expected:** the header shows the mark and **HisabKitab** in the same two
     colours, with the language chip at the right. The heading reads **"Welcome
     to HisabKitab"** with the name in blue. Tap the language chip: in Hindi it
     reads *"HisabKitab में आपका स्वागत है"* — the name first, as Gujarati and
     Marathi also put it. The button reads **"Sign in to HisabKitab"**.
   - On a phone 360dp wide or narrower, the Gujarati and Marathi button label
     wraps onto two lines. That is the label fitting, not overflowing.
5. Tap **"New to HisabKitab?"** to open sign-up.
   - ✅ **Expected:** the same mark and name in the header, beside a back arrow.
     On a 320dp-wide phone the name stacks — "Hisab" above "Kitab" — rather than
     being cut off or pushing the language chip off screen.

Home's top bar is checked in Flow 1, once there is an account to reach it with.

---

## Flow 1 — Register as a business owner

1. On the **Login** screen, tap **"New to HisabKitab? → Register your business and
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
4. ✅ **Expected:** you land on **Home**, greeted by name and your business
   name, and the **first** thing under the greeting is the stat tiles for
   Sales / Orders / Branches (all zero — nothing uploaded yet), then **Your
   branches**, then **Open the counter**. The numbers lead because they are
   what Home is read for; everything below them is somewhere to go.
   - ✅ **Expected, in the top bar:** the HK mark draws itself in, then
     **HisabKitab** and, after it, the language chip, the bell and your avatar
     settle into place one after another. The branch count (**0 branches** here)
     sits beside your business name under the greeting, not in the top bar. On a
     320dp-wide phone the name in the top bar stacks onto two lines and every
     control stays on screen; from 360dp it is one line, in all four languages.

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
4. Enter the same email/password, tap **"Sign in to HisabKitab."**
5. ✅ **Expected:** back on **Home**, same business, same data.
6. Now get the password **wrong** three or four times on purpose.
   - ✅ **Expected:** "Invalid email or password" each time, and nothing else
     changes — you stay on the Login screen and are not signed out of anything.
     After ten wrong attempts in fifteen minutes you get "Too many attempts.
     Please wait a few minutes and try again" instead, in your own language.
     A correct sign-in does not count towards that total.

---

## Flow 2a — A session that ends while you are using the app

A token lasts seven days, and tab screens never unmount — so a session dying
underneath somebody is a certainty, not an edge case. It used to leave every
screen showing "Invalid or expired token" with no way back except finding
Settings and logging out by hand.

You need a second device or browser profile signed in as the owner for step 2.

1. Sign in as a **cashier** and leave them on the **Counter** tab.
2. As the **owner**, revoke that cashier's membership (Flow 16) — or, to test
   the account switch instead, set their `User.status` to `DISABLED` in Prisma
   Studio.
3. On the cashier's device, pull to refresh, or move to another tab.
   - ✅ **Expected:** the app returns to the **Login** screen by itself.
   - ✅ **Expected:** their stored session is gone — force-quit and reopen, and
     it still shows Login rather than restoring.
4. If you disabled the account, try signing in again as them.
   - ✅ **Expected:** "This account has been disabled. Ask the business owner to
     restore it." — not "invalid password", which would send them hunting for a
     typo that is not there.
5. Set the status back to `ACTIVE` and sign in.
   - ✅ **Expected:** straight back in, everything as it was.

---

## Flow 3 — Add a branch

1. On **Home**, tap the **"No branches yet"** card (or, if you already have
   one, tap **"+ Add branch"** in the "Your branches" card).
2. Fill in:
   - **What is this place?** — leave it on *Branch*
   - **Who pays for raw material?** — choose **FM — franchise** for now. Nothing is
     chosen for you, and the button stays disabled until one is: it decides whether
     this branch's cashier ever pays for an order (Flow 17x and Flow 17y are the two
     answers).
   - Branch name — e.g. `Andheri West`
   - Branch code — e.g. `MUM-01` (this must be unique within your business)
   - City / Region — optional
   - Currency / Timezone — prefilled from your business
3. Tap **"Create branch."**
4. ✅ **Expected:** you're back on Home, the branch now appears under "Your
   branches" — its line says **FM — franchise** beside the code — and the Branches stat tile and the count beside your business name
   both went up by one — **without** closing and reopening the app. Every screen reads one shared branch list, so it
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
2. Tap **"How to fill in the template"** under the download card.
3. ✅ **Expected:** it opens in place (the chevron flips up) and lists the five
   required columns, then the five optional ones, each with what it means and an
   example, then a short "Good to know" box. Column names stay in English in
   every language — they are the headings in the file. Tap it again to close it.
4. Tap **"Download template"** — a CSV downloads (or opens a share sheet on a
   device). Open it: the columns are
   `transaction_external_id, occurred_at, product_name, quantity, unit_price,
   payment_method, tax_amount, discount_amount, sku, unit`, and every sample
   row's bill number starts with `EXAMPLE-`.
5. Back on the Upload screen, tap the branch you want this data attributed to
   (under "Which branch is this data for?").
6. Tap **"Choose a CSV or Excel file"**, pick the template **unedited**, and
   tap **"Upload and import."**
7. ✅ **Expected:** **"Nothing to import yet"**, saying the file only has the
   template's example rows. No counts, and Home's numbers do not move — the
   samples never reach real reports.
8. Now edit the file the way an owner would: add a few rows **below** the
   samples with your own bill numbers (say `INV-1`, `INV-2`), dates and
   amounts. Try the forms people actually type — `01/09/2026 8:30 PM`,
   `₹1,200`, `upi` in lower case. Open and save it in Excel or Google Sheets
   if you have one; its own date and price formatting is fine.
9. Upload it again.
10. ✅ **Expected:** a result card with **Created**, **Updated** and
    **Skipped** counts, and below them "4 example rows were left out" plus a
    line saying which way round a date like 01/09/2026 was read (day first,
    for an Indian file). A deliberately broken row — a `quantity` of `0`, a
    `tax_amount` of `abc`, a date like `31/02/2026` — is listed by its line
    number under "Rows that were skipped", and every other row still imports.
11. Upload the **same** file once more.
12. ✅ **Expected:** the `INV-` rows count as **Updated**, not Created — a
    re-upload replaces those orders rather than doubling them. (A row with no
    bill number cannot be recognised, so it would be added again.)
13. Go back to **Home**.
14. ✅ **Expected:** the **Sales** and **Orders** stat tiles now show real
    numbers matching what you uploaded (formatted like `₹1,000`, not
    locale-aware yet — see Known Limitations). An evening sale should count on
    the day it happened in the branch's own time zone, not the next day.

**Try the file-level errors:** rename the `quantity` heading to `qty` and upload
— one message names the missing column instead of every row failing. Headings
typed as `Product Name` or `Unit Price` are fine: case and spaces are ignored.

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
   - ✅ **Expected:** under **Status**, four chips — Present, Absent, Half day,
     Leave — each as wide as its own label, wrapping onto a second line rather
     than squeezing. No label breaks mid-word in any of the four languages.
   - ✅ **Expected:** the chosen chip takes that status's own colour — green for
     Present, red for Absent, amber for Half day — which is the colour the day
     then wears in the list above.
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
   - ✅ **Expected:** the card flips to "Punched in at 9:12 AM" and the button
     becomes **Punch out**. Every clock time in the app is 12-hour with AM/PM —
     never 24-hour, in any of the four languages.
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
3. **Tap a person's row** → the same four status chips appear inline. Tap
   **Half day**.
   - ✅ **Expected:** the row's pill updates without leaving the tab, in the
     colour of the chip you pressed. Marking a day used to take four taps into
     the detail screen.
   - ✅ **Expected:** the chip already matching that person's marked status is
     shown as chosen, so you can see what you are changing.
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

1. Invite an email that has no HisabKitab account (as in Flow 7), then, on the
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
   - ✅ **Expected:** Home leads with their branch's numbers, then the counter,
     then **Today's expenses**, then the catalog for their branch. No **Your
     branches** card — they do not edit branches, and no **Branches to chase**
     card — their own branch is the only one they can see.
   - ✅ **Expected:** in Products they can add a product for *their* branch, and
     the whole-business option is not offered at all — not offered-and-refused.
2. Log in as the **warehouse** user or the **delivery agent**.
   - ✅ **Expected:** tabs **Home · Staff · Settings** — no Products, no Reports.
   - ✅ **Expected:** the warehouse user gets **Branches to chase** on Home
     (requirement 10) and the delivery agent does not. Chasing branches for
     their daily expenses is the back office's job, and carrying orders is not.
3. Log in as an **owner or manager**.
   - ✅ **Expected:** all five tabs, and Home runs sales tiles → branch list →
     counter → catalog, with the upload card at the foot.
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
6. Choose **Pay on delivery** and press **Place order**.
   - ✅ **Expected:** it becomes an order with a number, and the screen moves to
     its detail. Payment reads "Pay on delivery" — nothing is outstanding, that
     is simply how it will be paid.
7. Go back to Supply and add something again.
   - ✅ **Expected:** a **fresh** cart. The old one is an order now.
8. Start another order and look at **How are you paying?**
   - ✅ **Expected:** if the warehouse's UPI ID has not been set up yet (Flow 17v),
     there is no choice — the card says the order will be paid on delivery, and
     why. A "Pay now" that did nothing when tapped would be worse than saying so.
9. With the UPI ID set up, choose **Pay now**.
   - ✅ **Expected:** a QR appears with the order's exact amount, and **Place order**
     stays disabled. Scan it with another phone, or press **Pay with UPI app** to
     pay from this one — the amount is already filled in. Nothing asks for a
     reference.
10. Press **Payment done**, then **Place order**.
    - ✅ **Expected:** payment shows **Payment sent** — sent, not yet confirmed. The
      warehouse confirms it in Flow 17h.

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
2. Open the order paid before ordering and press **Received** under the payment.
   - ✅ **Expected:** payment becomes **Paid**, and the history records who
     confirmed it. (**Not received** asks first, then sends it back to the branch to
     pay again.)
3. Open the pay-on-delivery order.
   - ✅ **Expected:** no **Received** to press — there is nothing to confirm yet. It
     is paid when it arrives.
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
   - ✅ **Expected:** every time down the right-hand side of **What has happened**
     reads as `4:35 PM`, as does the **Expected by** pill above it. Switch the
     language and the figures stay 12-hour.
3. As the **delivery agent** (Flow 15a), open **Deliveries**. For this step,
   dispatch the order with **Nobody yet** chosen in the panel.
   - ✅ **Expected:** the dispatched order is there even though nobody was named:
     an unassigned dispatch goes to every agent covering that branch, which is
     how it gets picked up. Naming one is Flow 17k.
4. Press **Report a delay**, choose *Traffic*, submit.
   - ✅ **Expected:** it lands on the same history as the warehouse's delay.
     Requirement 9 has two ends and both write to one stream.
5. Press **Mark delivered** on a **pay on delivery** order.
   - ✅ **Expected:** it asks first — *"Take ₹… from the … cashier — in cash, or by
     them scanning your QR"* — naming the amount and the branch. The goods arriving
     is not evidence the money did, and only you at the counter know.
6. Press **Not yet**.
   - ✅ **Expected:** nothing happens. The order stays dispatched and unpaid,
     which is where it actually is and where somebody can still chase it.
7. Press **Mark delivered** again and answer **Cash taken**.
   - ✅ **Expected:** delivered, payment becomes **Payment sent** — the cash is with
     you, not yet with the warehouse — and the history gains its own line, *Cash
     taken on delivery*, saying who took it. Paying by the agent's QR is Flow 17x.
8. Do the same on an order paid before ordering.
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
   - ✅ **Expected:** **no location picker at all** — the heading becomes
     **"Where is their base?"** and under it one line saying they work across the
     whole business and naming where attendance and payslips will be filed (your
     warehouse, or the oldest location if there is none). A delivery agent works
     at none of the branches, so being asked to pick one was the bug.
6. Do the same with the **warehouse** person's email.
   - ✅ **Expected:** **only warehouses are listed — no shops at all.** The desk
     accepts, packs and dispatches goods, so it is based where the goods are.
     Filing them at a shop would also put them on that shop's roster, where its
     cashier can read and change their salary.
   - Now try it in a business that has **no warehouse location** (Shriman
     amrutulya, if you seeded it). ✅ **Expected:** no options and no
     preselected shop, a line explaining that this business has no warehouse
     yet, and an **Add a warehouse** button that opens Add branch. **Add staff**
     stays disabled until one exists. Before this, the single shop was silently
     selected for them.
7. Type the email of a **manager or admin**.
   - ✅ **Expected:** the same hidden picker and the same line as the delivery
     agent in step 5. They run the business rather than a place, so there is
     nothing to choose; the line is there so the outcome is not hidden.
8. Type a **cashier's** email instead.
   - ✅ **Expected:** it names them, and the question stays "which branch do
     they work at" with nothing preselected. A branch-scoped person is never
     guessed at: being filed at the wrong shop silently is worse than a tap.
9. Do the same as a **cashier** rather than the owner.
   - ✅ **Expected:** no recognition line at all — reading the team needs a
     permission a cashier does not have — and the screen behaves as it always
     did.
10. Open an existing **warehouse** staff member in **Staff → edit** and look at
    the branch picker.
    - ✅ **Expected:** only warehouses again. The rule holds on the way back
      too, and the server refuses a shop with a message naming the rule — so
      try it with curl if you want to see it: the app never offers the control.
    - Now edit the **delivery agent** or the **admin**. ✅ **Expected:** the full
      picker, unlike Add staff. The two screens differ on purpose: onboarding
      should not ask a question with no meaningful answer, while editing is
      where a base that needs moving gets moved.
11. Save the delivery agent, then log in as them and **punch in from anywhere**.
    - ✅ **Expected:** it works, with no geofence and the location recorded
      (Flow 17j). Their attendance and payslip are filed against whichever base
      you chose. Without the staff record made in step 5 there is no attendance
      at all — that chain is what "so they will do punch-in punch-out" needs.
12. As the warehouse person, punch in while at the warehouse.
    - ✅ **Expected:** it works, against the warehouse's own radius.
13. Try to change the warehouse back to a branch in **Branch settings**.
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
4. **Upload a CSV with a bad row** (the template with its `EXAMPLE-` prefixes
   removed — sample rows are never imported, so they cannot fail either — and
   one quantity emptied out; see Flow 4).
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

## Flow 17n — Expenses: what went out against what came in

Requirement 10. Log in as the **cashier** (Flow 15a). Ring up a token or two in
Flow 17d first, or "Sold" will read zero and the comparison has nothing to show.

1. On **Home**, tap **Today's expenses**.
   - ✅ **Expected:** a **Spent** and a **Sold** tile side by side, and
     **Difference** on its own full-width line below them. The difference is the
     conclusion drawn from the two figures, not a third number of the same kind,
     and it turns red when the branch is down on the day.
2. Tap **Log an expense**.
   - ✅ **Expected:** eight categories as chips — Milk, Gas, Electricity, Rent,
     Repairs, Transport, Petty cash, Other — each as wide as its own label,
     wrapping onto more rows rather than squeezing. No label breaks mid-word in
     any of the four languages.
   - ✅ **Expected:** there is **no raw-material or stock category**, on purpose.
     A supply order is already recorded as a cost; logging it again by hand would
     subtract it twice from net profit.
3. Choose **Milk**, enter `2000`, note "two cans", leave the date on today, pick
   **Cash**, and save.
   - ✅ **Expected:** back on the expense screen, **Spent** has moved by ₹2,000,
     **Difference** has moved the other way by the same amount, and a "Milk"
     chip showing ₹2,000 appears under the tiles. That chip is requirement 10's
     "today I took ₹2,000 of milk".
4. Try to save an expense of `0`, and one of `-50`.
   - ✅ **Expected:** refused both times. Zero is a half-typed form; a negative
     is a refund, which this does not model.
5. Set the date to some day **next year** and save.
   - ✅ **Expected:** refused — that day has not happened at this branch yet.
     The mistake it usually catches is a mistyped year, and an expense filed
     into the future never appears in any day anybody looks at.
6. Tap **Add a category** in the picker, type `Vegetables`, and add it.
   - ✅ **Expected:** it appears as a chip and is **already chosen** — somebody
     who just typed it wants this expense to be that. Adding it a second time is
     refused by name.
7. Log a second expense against **Gas**, then scroll to **This month**.
   - ✅ **Expected:** the month total, the category breakdown biggest-first, and
     a line per day that has any spending. Step the month back — an empty month
     says so rather than showing a total of zero.
8. Press the bin on one of today's entries.
   - ✅ **Expected:** it asks first, naming the amount and the category, and
     backing out changes nothing. There is no day-close floor on expenses: a gas
     bill that arrives a week late is the normal case, not the exception.

---

## Flow 17o — The back office rings the branches that have not logged

Requirement 10's last line. Needs two branches, with the cashier of only one of
them having logged something today (Flow 17n).

1. Log in as the **warehouse** user and look at **Home**.
   - ✅ **Expected:** a **Branches to chase** card directly under the numbers,
     saying how many branches have logged no expense today and naming them.
   - ✅ **Expected:** it is a **list, not a link**. The action here is a phone
     call, and the only thing needed to make it is the name.
2. Have the other branch's cashier log an expense, then pull Home down to
   refresh.
   - ✅ **Expected:** that branch drops off the list. The answer is computed
     when the card loads, so it is right at the moment it is read — not as of
     whenever some job last ran.
3. Once every branch has logged, look at the card again.
   - ✅ **Expected:** it turns green, says so, and lists what each branch spent
     instead — so it is still worth reading on a day when nobody needs ringing.
4. Tap a branch row.
   - ✅ **Expected:** that branch's expense screen opens, and there is **no
     "Log an expense" button on it**. The desk chases branches; it does not
     spend their money. Reading and recording are separate capabilities, and
     this is the difference showing up on screen.
5. As the **cashier**, check Home.
   - ✅ **Expected:** no **Branches to chase** card. Their own branch is the
     only one they can see, and a one-row list of yourself answers nothing.
6. With branches in **two different timezones**, check the card near midnight.
   - ✅ **Expected:** each branch is judged against **its own** local date. A
     business spanning timezones has no single "today", and ringing a branch
     whose day has not started is the failure this avoids.

---

## Flow 17p — Notifications

Requirements 2 and 8. **`Docs/FIREBASE_SETUP.md` first** — without it, everything
below still works except the push itself: the rows are written, the bell counts
them and the centre lists them. That is a supported mode, not a broken one, so
run this flow either way.

1. As any role, look at **Home**'s top bar.
   - ✅ **Expected:** a bell between the language chip and your avatar. No
     badge yet.
2. As the **owner**, mark a staff member **absent** — one whose staff record
   carries the email of a real app account (Flow 13).
3. Log in as **that worker** on another device or browser profile.
   - ✅ **Expected:** the bell shows a red **1**. Open it: *"You were marked
     absent for 20 Sep at Andheri West."*
   - ✅ **Expected with Firebase set up:** it also arrived as a notification on
     the phone, in the language **that phone's app** is set to, with the HK mark
     as its small icon in the status bar (a white silhouette — Android draws a
     notification icon in one colour) rather than a plain square.
4. Mark somebody who has a staff record but **no app account**.
   - ✅ **Expected:** marking succeeds exactly as before. Nobody is notified and
     nothing fails — requirement 2 says this in as many words.
5. Tap the notification in the centre.
   - ✅ **Expected:** it opens **My attendance**, the row loses its tint, and
     the badge drops by one.
6. **Change the app language** and reopen the centre.
   - ✅ **Expected:** the whole history re-renders in the new language, including
     notifications received days ago. They are stored as a code and its values,
     not as a sentence. An Android notification already on the lock screen keeps
     the language it arrived in, which is correct — it was written when it was
     sent.
7. As the **cashier**, place a supply order (Flow 17g).
   - ✅ **Expected:** the **warehouse** user's bell goes up; the cashier's does
     not. You are not told about your own actions.
   - ✅ **Expected:** the **delivery agent** hears nothing about it. Who is told
     is decided by capability — everyone holding `supplyOrder:fulfil` — and
     carrying an order is not fulfilling one.
8. As the **warehouse**, accept it and post a **+30 minute** delay.
   - ✅ **Expected:** the cashier gets both, and the delay names the minutes.
     This is requirement 9 finally arriving without anyone opening a screen.
9. Dispatch it, naming an agent (Flow 17k).
   - ✅ **Expected:** **the agent is told** — *"Order #214 to Andheri West is
     yours to carry."* Until this task, the run appeared in their queue and
     nothing announced it.
10. Tap **Mark all read** in the centre.
    - ✅ **Expected:** the badge clears and stays cleared after a refresh.

---

## Flow 17q — Turning notifications down

Requirement 8's last line.

1. Open **Settings** and scroll to **What to send me**.
   - ✅ **Expected:** a line saying whether **this device** will receive
     notifications at all, above the switches. If Android's permission was
     refused it says so and tells you to fix it in the phone's settings —
     Android only ever asks once, so an in-app button could not re-prompt.
2. Turn **Order updates** off. Have a cashier place an order.
   - ✅ **Expected:** no push, and no new row in the centre either. Muting stops
     it being recorded, not just delivered.
3. Turn it back on and place another.
   - ✅ **Expected:** it comes through again.
4. Look at **Attendance**.
   - ✅ **Expected:** it has no switch — it reads **Always on**, with a sentence
     saying why. Requirement 2 exists so a worker finds out they were marked
     absent; a switch that hid that would defeat the requirement it was built
     for, and one that looked operable and refused would be worse.
5. Switch business (Flow 17) and open Settings again.
   - ✅ **Expected:** the same switches. A preference belongs to the person, not
     to the business or the phone.
6. **Log out.**
   - ✅ **Expected:** the logout completes normally. This device is unregistered
     server-side, so the next person to sign in on it does not inherit the
     previous account's notifications.

---

## Flow 17r — Reports: every branch, month by month, with net profit

Requirements 13 and 15. **Sign in as the owner, admin or manager** — the Reports
tab is theirs. A cashier does not get the tab; the endpoint behind it would scope
them to their own branch if they did, which the backend tests cover.

Do Flows 17a–17q first, or at least ring up a counter sale (17d), log an expense
(17n), place a supply order (17g) and generate a payslip (Flow 14). Reports adds
up what those created; with none of them there is nothing to read.

1. Tap the **Reports** tab.
   - ✅ **Expected:** the title, then a row of **three chips — 3 / 6 / 12
     months** — with 6 selected. Each label sits on one line in all four
     languages; none breaks mid-word.
   - ✅ **Expected:** a horizontal strip of month chips ("Sep 2026"), the most
     recent selected, scrolled to the right-hand end. Swipe it — it scrolls, and
     no chip is clipped.
2. Look at the **Net profit** card at the top.
   - ✅ **Expected:** one large figure, red if it is negative, and under it four
     boxes **two to a row**: Customer sales, Expenses, Wages, Moved internally.
     Four across one row would give each about 76dp and break every label — if
     you see that, it is a bug.
   - ✅ **Expected:** if wages have not been finalised for the month, a line
     saying so. Profit computed from unrun payroll is too flattering, and the
     card says as much rather than looking confident.
3. **Check the arithmetic by hand.** This is requirement 13's actual acceptance
   criterion, so it is worth doing once properly.
   - Customer sales − Expenses − Wages should equal the Net profit shown.
   - ✅ **Expected:** it does, exactly. Note that **"Moved internally" is not
     subtracted** here.
4. Read the sentence at the bottom of the card, if there is one.
   - ✅ **Expected:** it appears only when a branch has bought material from your
     own warehouse, and it reads like "Your branches together made −₹42,000. Add
     back the ₹30,000 they paid your own warehouse for material — money that never
     left the business — and the total is −₹12,000."
   - Now add up the **net profit of every branch card below**, then add the
     internal transfer. ✅ **Expected:** you get the business total on this card,
     to the rupee. That difference is deliberate and this sentence is why: the
     money left the shop and did not leave the business.
5. Look at **Needs attention**.
   - ✅ **Expected:** either "No branch fell against the month before", or the
     branches that did, **worst first**, each with a red downward pill showing
     how far it fell. A branch that moved less than 2% is not listed — a section
     that flags everything is a section nobody reads.
6. Scroll to the **branch cards**.
   - ✅ **Expected:** one card per branch, **best first**, with any warehouse
     last. Each shows the branch name, a trend pill, the month's net profit, four
     figures two-to-a-row, and a row of small bars.
   - ✅ **Expected:** the bars grow **upward in green for a profit and downward
     in red for a loss**, from a line in the middle. A loss drawn as a short
     upward bar would read as a small profit.
7. Tap a bar in one branch's row.
   - ✅ **Expected:** the month strip at the top moves to that month and **every
     card on the screen changes together**, because that is the column of the
     grid you just asked for. The cards re-sort, because the ranking is for the
     month in focus.
8. Find your **warehouse** card.
   - ✅ **Expected:** a grey **"Cost centre"** pill, **no sales figure and no raw
     material figure at all** — just Expenses and Wages — and a net profit that is
     simply minus what it spent. A warehouse has no till, so a "₹0 of sales" row
     would be reporting the model rather than the business.
9. Switch the range to **12 months**, then back to **3**.
   - ✅ **Expected:** the month strip grows and shrinks, re-scrolls to the most
     recent month, and the figures change with it. Twelve bars still fit inside a
     card without overlapping.
10. Change the app language to Gujarati and come back.
    - ✅ **Expected:** every label, chip and sentence is translated, and nothing
      wraps mid-word. The reconciliation sentence puts its three amounts in the
      right places — they travel as parameters, not baked into the sentence.
11. Pull down to refresh.
    - ✅ **Expected:** a spinner at the top, the figures stay on screen while it
      loads, and they update. Now turn the backend off and pull again: ✅ an error
      appears **beside** the figures rather than replacing them. A screen that was
      reading correctly a moment ago should not empty itself.
12. Ring up a counter sale (Flow 17d), then return to Reports.
    - ✅ **Expected:** the figure has already moved. Reports re-reads whenever the
      tab regains focus, so there is nothing to press.

---

## Flow 17s — Comparing every business one account holds

Requirements 13 and 16. **You need two businesses** where you are owner, admin or
manager — Flow 17 creates the second one.

1. On **Reports**, look above the month strip.
   - ✅ **Expected:** a second row of two chips, **"This business" / "All
     businesses"**. With only one business this row is absent, and that is
     correct — there is nothing to compare.
2. Tap **All businesses**.
   - ✅ **Expected:** the month strip and the branch cards disappear. In their
     place: a combined total across every business, then one card per business
     with its own net profit, sales, expenses, wages and internal transfer.
   - ✅ **Expected:** **no branch rows anywhere.** Requirement 13 asks for
     "amount only"; the branches of whichever business turns out to need
     attention are one business-switch away.
3. Check the range still says what it said.
   - ✅ **Expected:** changing 3 / 6 / 12 changes both views. Switching scope must
     never silently change the period being compared.
4. Sign in as a **cashier** who belongs to one of those businesses and open
   Reports.
   - ✅ **Expected:** there is no Reports tab at all. Five tabs is the budget
     (see `TabNavigator`), and a cashier's five are Home, Counter, Supply, Staff
     and Settings.
5. If your two businesses use **different currencies**, look at the top card.
   - ✅ **Expected:** no combined figure, and a line explaining that the
     currencies differ. Each business still shows its own total. A number that
     added ₹ to د.إ would be worse than no number.

---

## Flow 17t — Exporting the day and the month

Requirement 17. **Two places to try it**, because two different people want it: the
branch expense screen exports *today at this branch*, and Reports exports *the month
in focus across every branch*. A cashier gets the first and not the second, which is
correct — they hold `export:dayEnd` but have no Reports tab.

You need something entered first. Do Flow 17d (a counter sale), 17g (a supply order)
and 17n (an expense) if you have not.

### The day, from the expense screen

1. Open **Expenses** (from Home, or the Staff/branch route) and scroll to the
   bottom.
   - ✅ **Expected:** an **Export** card saying how many entries today has — e.g.
     "6 entries for Today." Two rows under it: **Spreadsheet** and **Printable
     summary**, each with a sentence saying what the file is.
   - ✅ **Expected:** each row is a full-width row, *not* two buttons side by side.
     Switch to Gujarati and check again — both labels and both hints stay on one
     line.
2. On a branch where nothing has been logged today, look at the same card.
   - ✅ **Expected:** "Nothing was entered for Today, so there is nothing to
     export", and **both rows greyed out and unpressable.** Handing over an empty
     spreadsheet would be worse than refusing.
3. Tap **Spreadsheet**.
   - ✅ **Expected:** a spinner on that row, then the Android share sheet offering
     `day-end-<date>-branch.xlsx`. Save it to Drive or Files.
4. Open the file in Excel, Google Sheets or WPS.
   - ✅ **Expected:** five sheets — Summary, Counter orders, Supply orders,
     Expenses, Attendance — with their names **in the app's language**.
   - ✅ **Expected, and this is the one that matters:** select the Amount column and
     the spreadsheet gives you a **sum**. If the amounts arrive as text ("₹250.00"
     left-aligned, no sum), that is a bug — the whole point of a spreadsheet over a
     PDF is being able to total it.
   - ✅ **Expected:** dates read `2026-09-27`, not `27/09/2026` or `09/27/2026`. An
     ISO string means the same thing in every locale; a date serial does not.
   - ✅ **Expected:** the **Summary** sheet's last row is a Total, and its Counter
     sales figure equals the one the app showed.
5. Tap **Printable summary**.
   - ✅ **Expected:** the Android print preview opens, then the share sheet offers
     `day-end-<date>.pdf`. The page leads with the totals, then lists each record
     type, and is entirely in the app's language.
   - ✅ **Expected:** a "Cash movement" figure with a line under it saying it is
     *not* net profit. It is sales less expenses and material; net profit subtracts
     wages too, and that is Reports.

### The month, from Reports

6. Open **Reports**, pick a month in the strip, and scroll past the branch cards'
   start.
   - ✅ **Expected:** the same Export card, now saying how many entries that month
     has across every branch, and exporting `month-end-<month>-all-branches.xlsx`.
7. Open that spreadsheet.
   - ✅ **Expected:** a **sixth sheet, Payslips**, which the day export does not
     have. Each row is a person, their days worked, gross, deductions and net pay.
   - ✅ **Expected:** every sheet has a **Branch** column, and one row per record —
     not a sheet per branch. That is what lets you pivot it.
8. Switch the range chips and pick a different month, then export again.
   - ✅ **Expected:** the count and the file change with the month. Any past month
     works — losing a file is meant to be recoverable.

### The double-count warning

9. This is the check that closes the last open question in `REQUIREMENTS.md` §5.
   At one branch, on one day: place a supply order for exactly **₹5,000** (Flow
   17g), then add an expense of exactly **₹5,000** under a **category you created
   yourself** — Expenses → Log an expense → add a category called e.g. "Flour".
10. Go back to the Export card for that day.
    - ✅ **Expected:** an amber **"Worth checking first"** panel naming the amount,
      your category, the date and the order number, and saying that if it was the
      same payment it is counted twice. It appears *before* you export, not inside
      the file.
    - ✅ **Expected:** the same sentence appears in the printable summary under
      "Worth checking".
11. Now log ₹5,000 against **Gas** — a seeded category — on a day with a ₹5,000
    supply order.
    - ✅ **Expected:** **no warning.** The seeded eight are known not to be raw
      material, so that is a coincidence rather than a double entry. A warning here
      would be a false alarm, and false alarms teach people to ignore the panel.

### Permissions

12. Sign in as a **staff** member and look for any of this.
    - ✅ **Expected:** no Export card anywhere. `STAFF` holds neither export
      capability, and the endpoints refuse all three representations — the
      spreadsheet and the document too, not only the JSON.
13. As a **cashier**, open the Expenses export and check the file.
    - ✅ **Expected:** only your own branch is in it, even though the request asks
      for the whole business. The capability says whether you may export; your
      branch access says what.

---

## Flow 17u — One cashier per branch, and refusals that explain themselves

Requirements 18 and 19. **You need three branches and two spare email addresses**
for this one. Sign in as the owner or an admin.

### Inviting a cashier

1. **Team → Invite someone**, enter an address, and choose **Cashier**.
   - ✅ **Expected:** the branch section is a **stacked list with a tick**, not a
     row of tick-boxes, and a line above it saying a cashier works at exactly one
     branch. Every other branch-scoped role still gets the old multi-select grid —
     switch to **Delivery agent** and back to check.
   - ✅ **Expected:** each branch row says who its cashier is, or "No cashier yet",
     **before** you choose. That is the point: you should not have to pick and be
     refused to find out.
2. Tap a second branch.
   - ✅ **Expected:** the first one un-ticks. One branch, always.
3. Pick a **free** branch and send it.
   - ✅ **Expected:** it goes through. Back on Team, that person's card shows one
     branch as a solid pill with "One branch, and one cashier on it." under it —
     and **no × to remove it**, because removing a cashier's only branch from here
     would be a worse version of moving them.

### The swap

4. Invite a **second** cashier and pick the branch the first one now holds.
   - ✅ **Expected:** a confirmation naming the person, not an error — "Hari is the
     cashier for Shop A. Moving it to … leaves Hari with no branch."
   - ✅ **Expected:** cancelling changes nothing at all. Check Team: the first
     cashier still has the branch and the second was never created.
5. Do it again and confirm.
   - ✅ **Expected:** the branch moves in one step. The new cashier has it; the old
     one's card now says **"No branch yet — give them one before they can open a
     till."** in amber.
   - ✅ **Expected:** the displaced person is *not* removed. Their row is not
     struck through and they can still sign in — they just reach nothing.

### Moving somebody

6. On a cashier's card, tap **Change branch**, and pick a branch **another** cashier
   holds.
   - ✅ **Expected:** a confirmation with **two sentences** — the one it displaces,
     and the branch this person is leaving behind with no cashier. Confirm, and
     check Team: exactly one cashier on each, and one branch now empty.
7. Tap **Change branch** and pick the branch they already have.
   - ✅ **Expected:** nothing happens and no error. Re-assigning the branch somebody
     already holds is a no-op, not a conflict with themselves. Their own branch
     reads **"Their branch"** rather than showing them as the blocker.
8. Remove a cashier's branch from the server side if you want to see the empty
   state: **Change branch** cannot produce it, which is deliberate.

### A cashier with no branch

9. Sign in **as the displaced cashier** from step 5.
   - ✅ **Expected:** Home says **"You have not been given a branch"** and explains
     that the account and role are fine but nothing is attached yet, and to ask an
     owner or admin. It does **not** show "Add your first branch" — that card used
     to appear here and led to a screen whose save returns 403.
   - ✅ **Expected:** you do not also get the "Your tools are still being built"
     notice. One notice, the one that is true.

### The conflict report

10. This one needs a state the app cannot create, so make it in Prisma Studio
    (`npm run prisma:studio` in `backend/`): add a second `branch_access` row so two
    ACTIVE cashiers hold one branch.
    - ✅ **Expected:** Team shows an amber **"Needs a decision"** panel naming the
      branch, the count and both people, and saying nothing has been changed for
      you.
    - ✅ **Expected:** it has **no fix button**. Deciding who keeps a branch is not
      something the app can guess, so the fix is **Change branch** on the row it
      names. Use it, and the panel disappears.

### Refusals that say what the rule is (requirement 19)

11. Sign in as a **staff** member and try to reach something they cannot — the
    simplest is to let a screen make a request that is refused.
    - ✅ **Expected:** the message names the rule and who can lift it — "Only Owner,
      Admin, Manager or Cashier can record what a branch spent." — not "Your role
      does not allow this."
    - ✅ **Expected:** switch the language and the sentence is fully translated,
      including the role names. The server sends no prose here at all: it sends the
      capability, and the app builds the sentence from the matrix it already
      mirrors.
12. As a **cashier**, ask for a branch that is not yours (a deep link, or another
    branch's id).
    - ✅ **Expected:** "You can only work in the branches you have been assigned to.
      Ask an admin to assign this one." — the rule and the next step, rather than
      the bare fact that a boundary exists.

---

## Flow 17v — Payment QR codes: where branches' money goes

Requirement 26. Every payment QR in the app is made from a UPI ID set here, with the
order's exact amount in it — there is no image to upload. Do this as the **owner**
first; Flow 17z repeats it as the accountant.

1. **Settings → Payment QR codes.**
   - ✅ **Expected:** a short explanation, a **Warehouse** section and a **Vendors**
     section.
2. Under **Warehouse**, type something that is not a UPI ID — `hello`.
   - ✅ **Expected:** "That is not a UPI ID" under the field, and **Save** stays
     disabled.
3. Type a real one — the UPI ID printed under any UPI QR, e.g. `yourname@okaxis` —
   and a name such as `HisabKitab Warehouse`. Press **Save**.
   - ✅ **Expected:** **Saved**, a test QR appears, and a line says who last
     changed it and when.
4. Scan the test QR with your own UPI app — **do not pay**.
   - ✅ **Expected:** it opens on the name you typed with **no amount filled in**,
     so nothing can be paid by accident. This is how you check the ID is right.
5. Log in as the **warehouse desk** and look for the same screen.
   - ✅ **Expected:** not in Settings at all. Whoever ships the goods must not also
     be able to change where the money for them goes.

---

## Flow 17w — Vendors, and who supplies what

Requirement 25. A vendor delivers straight to a branch — water, ice, milk — and does
not use the app. As the **warehouse desk**:

1. **Supply** (the catalog) → **Vendors** → **Add vendor**. Name `Shree Water`,
   WhatsApp number `98765 43210`. Save.
   - ✅ **Expected:** it is listed with a **QR not set** badge — the desk adds
     vendors but cannot say where they are paid.
2. Add a second vendor called `shree water`.
   - ✅ **Expected:** refused — it is the same supplier written differently.
3. In the catalog, **Add an item**: `Water can`, unit `can`, price `30`, and under
   **Supplied by** choose **Shree Water**.
   - ✅ **Expected:** the catalog now has headings — **From the warehouse** and
     **From Shree Water** — with the water can under the second. A business with no
     vendor items never sees these headings.
4. As the **owner**, **Settings → Payment QR codes → Vendors → Shree Water**, set a
   UPI ID.
   - ✅ **Expected:** the badge becomes **QR set**, here and on the desk's Vendors list.
5. As the desk, open Shree Water and **Stop using this vendor**.
   - ✅ **Expected:** it asks first. Afterwards the water can cannot be ordered, and
     the vendor is dimmed. **Use this vendor again** brings it back without asking.

---

## Flow 17x — A franchise (FM) branch pays for itself

Requirements 24–26. Use a branch created as **FM — franchise** (Flow 3), its cashier,
and the delivery agent. Flows 17v and 17w first.

1. As the cashier, add **Flour** and a **Water can** and open the cart.
   - ✅ **Expected:** two groups — **From the warehouse** and **From Shree Water**,
     each with a subtotal — and a line under the total: *This becomes 2 orders, one
     for each supplier.*
2. Choose **Pay now**.
   - ✅ **Expected:** **two** QR cards, one per supplier, each for exactly its own
     subtotal, and **Place order** disabled until both say **Marked as paid**.
     *Not yet* takes a tick back.
3. Press **Payment done** on both, then **Place order**.
   - ✅ **Expected:** you land on Supply orders with two new orders. The warehouse
     one reads **Payment sent** — the warehouse still has to confirm it — and the
     water one reads **Paid** at once, because a vendor cannot confirm anything.
4. As the **warehouse desk**, open **Desk**.
   - ✅ **Expected:** the flour order is there; the water order is **not** — a
     franchise branch orders from its vendor itself.
5. As the cashier, open the water order and press **Send on WhatsApp**.
   - ✅ **Expected:** WhatsApp opens on Shree Water's number with the order written
     out — branch, address, lines, total — in the app's language.
6. Place another warehouse-only order with **Pay on delivery**, and have the desk
   accept, pack and dispatch it. As the **agent**, press **Mark delivered**, then
   **Show the QR**.
   - ✅ **Expected:** the warehouse's QR, for the order's amount, on the agent's
     phone. The cashier scans it with theirs and pays; the agent presses **They have
     paid — mark delivered**. Payment reads **Payment sent**, and the history says
     *Paid by UPI on delivery*.
7. As the desk, open that order and press **Not received**.
   - ✅ **Expected:** it asks first. Afterwards the cashier's order shows **Pay ₹…**
     at the bottom; paying from there makes it **Payment sent** again. There is no
     cash option there — the warehouse's cash goes through the agent.
8. Place a water-only order with **Pay on delivery**. As the cashier, press
   **Received**.
   - ✅ **Expected:** *Have you paid Shree Water the ₹…?* with **Paid in cash**,
     **Pay by UPI now** and **Received — I will pay later**.
9. Choose **Received — I will pay later**.
   - ✅ **Expected:** the order reads **Received**, payment **To pay**, and a **Pay
     ₹…** button stays on it until somebody does.

---

## Flow 17y — A company-operated (FOCO) branch pays for nothing

Requirement 24. Add a branch as **FOCO — company operated**, invite a cashier to it.

1. As that cashier, cart **Flour** and a **Water can** and open the cart.
   - ✅ **Expected:** no payment question at all — a card says *Accounts pays for this
     order … once it arrives*.
2. Place it.
   - ✅ **Expected:** two orders, both reading **Accounts pays**.
3. As the **desk**, open **Desk**.
   - ✅ **Expected:** **both** orders are there — for a company branch the desk is who
     sends the water order on. Open the water order: the main button is **Mark as sent
     to the vendor**, and **Send on WhatsApp** is beside it.
4. Press **Mark as sent to the vendor**.
   - ✅ **Expected:** it reads **Sent to the vendor**, and the cashier is told so —
     not that the warehouse "accepted" it.
5. Accept, pack and dispatch the flour. As the **agent**, press **Mark delivered**.
   - ✅ **Expected:** **no question** — nothing is owed at the counter. Delivered.
6. As the cashier, open the water order and press **Received**.
   - ✅ **Expected:** received straight away, with no question about paying anyone.
7. As the owner, open **Branch settings** for this branch and change it to **FM**.
   - ✅ **Expected:** the two orders above still read **Accounts pays** — an order is
     paid the way it was placed. Change it back to FOCO for Flow 17z.

---

## Flow 17z — The Accountant

Requirement 27. Invite someone as **Accountant** (Flow 6).

1. On the invite screen, choose **Accountant**.
   - ✅ **Expected:** no branch picker — the role reaches every branch — and a line
     saying what they can and cannot see.
2. Log in as them.
   - ✅ **Expected:** tabs **Home · Payments · Staff · Reports · Settings**. Home shows
     the business's sales, the expense chase list, and **Payments to make**.
3. Open **Payments**, **To pay**.
   - ✅ **Expected:** the FOCO orders from Flow 17y, grouped by **who is paid** — From
     the warehouse, and Shree Water — each heading with *₹… ready · N orders*. An
     order not yet delivered is dimmed, says *On its way — pay once it arrives*, and
     cannot be ticked.
4. Tick the delivered flour order, then tick the water order.
   - ✅ **Expected:** ticking the water order **clears** the flour one. One payment pays
     one UPI ID.
5. Press **Select all that arrived** under the warehouse heading, then **Pay these**.
   - ✅ **Expected:** one QR for the whole total, the order numbers in its note, and a
     list of what it covers. Press **Pay with UPI app** to pay from this phone.
6. Press **Payment done**.
   - ✅ **Expected:** it asks first — *Only once the UPI payment has gone through …* —
     then *Paid ₹… for N orders*, the orders leave the list, and as the FOCO cashier
     they read **Paid by accounts**.
7. **To confirm.**
   - ✅ **Expected:** the FM payments still waiting from Flow 17x. **Received** asks
     first, then takes one off the list.
8. **Notifications** (with a phone signed in as the accountant).
   - ✅ **Expected:** when the agent delivers a FOCO order — *Order #… from … has
     arrived — ₹… to pay*; when an FM branch pays the warehouse — *… has paid ₹… for
     order #…*. The owner gets neither.
9. Try what they should not reach.
   - ✅ **Expected:** **Reports** opens. Team, the counter, the cart, the desk and
     adding a vendor are nowhere in their app — and the API refuses each of them
     if asked directly.

---

## Known limitations (not bugs — don't file these)

- **No password reset and no way to change a password.** Signup, sign-in and
  sign-out are the whole of account management; somebody who forgets their
  password has to be given a new one in the database by hand. Email addresses
  are not verified either. This is the largest remaining gap before a real
  launch.
- **Signing in is rate-limited to 10 failed attempts per 15 minutes, and signing
  up to 5 attempts**, both per IP address. A whole shop shares one connection,
  so several people fumbling passwords together can meet it — the wait clears
  it, and a successful sign-in does not count against the limit. Nothing else in
  the API is limited.
- **A disabled account is turned away immediately, everywhere.** Setting
  `User.status = 'DISABLED'` takes effect on the next request rather than when
  their token expires, and the message says the account was disabled rather than
  that the password was wrong. There is no screen for this yet: it is a database
  change.
- **No payment is detected automatically.** A UPI QR is paid in the payer's own UPI
  app and the payer taps *Payment done*; the warehouse's desk or the accountant then
  taps *Received*. Nothing in the app sees the money arrive — that would need a payment
  gateway, and no gateway could see a vendor's own account anyway.
- **"Pay with UPI app" can be refused for a personal UPI ID.** Some UPI apps will not
  open a payment link to an individual's ID. A business UPI ID avoids it, and scanning
  the QR from another phone always works.
- **One payment choice per franchise cart.** Pay now or on delivery applies to every
  supplier in the cart; to pay the warehouse now and a vendor on delivery, place them
  as two carts.
- **A paid order that is then cancelled is not refunded through the app.** A branch can
  still cancel an order while it is only placed, even after paying for it — the refund
  is arranged outside the app.
- **One UPI ID for the warehouse per business.** A business with two warehouses has
  both paid into the same account.
- **A vendor does not use the app.** "Sent to the vendor" is the sender's own tap after
  WhatsApp, and "Received" is the branch's — neither is the vendor saying so.
- **Supply-order lists return the 200 most recent matching orders.** That is
  months of history for a normal branch; older orders are still in the database
  and still counted in Reports, but the Supply and Warehouse screens stop
  scrolling there. Proper pagination is the follow-up.

- **A cashier's branch can be taken away but not from the Team screen.** "Change
  branch" moves a cashier between branches; it cannot leave them with none, because
  the useful action from that screen is always a move. Leaving somebody branchless is
  supported by the API (it is where a displaced cashier lands) and shows as a clear
  notice on their Home, but reaching it deliberately means removing their membership
  and re-inviting them.
- **Memberships that already break the one-cashier rule are reported, not fixed.**
  A branch with two cashiers, or a cashier with two branches, appears in Team's
  "Needs a decision" panel and stays there until somebody moves one. That is the
  decision: nothing but a person knows which cashier is the one still turning up.
- **An invite can promise a branch that is gone by the time it is claimed.** If the
  branch is taken in the interval, the person joins as a cashier with **no branch**
  rather than the invite failing or the current holder being displaced silently. It
  shows in the conflict panel.
- **A refusal names roles, not people.** "Only Owner, Admin or Manager can …" says
  which roles can lift a restriction, not which colleague to go and find — the app
  is not going to list your admins to a staff member. R18's refusals are the
  exception, and name the cashier being displaced, because the admin reading them can
  already see the whole team.
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
- **The printable export summary caps each section at 60 rows.** Past that it prints
  the totals and a line saying how many rows were left out; the spreadsheet always
  has every one. A forty-page PDF of counter tokens is not a summary, and silently
  truncating would make the page disagree with the file for no visible reason.
- **A POS export's own headings are not recognised.** The upload ignores case and
  spaces in a heading, but not a different name: a Petpooja export's `Invoice No`
  or `Item Name` has to be renamed to `transaction_external_id` or `product_name`
  first, and the upload names the missing column when one is. Guessing that
  `Price` means `unit_price` rather than a line total would quietly produce wrong
  sales, so no aliases are applied.
- **Returns and refunds are not imported.** A `quantity` must be more than 0, so a
  POS export's negative return lines are reported as skipped rows rather than
  booked as sales.
- **A file whose dates never pass the 12th is read day first.** 01/09/2026 means 1
  September unless another date in the same file only works month first (say
  09/13/2026). The result card says which reading was used, so a wrong guess is
  visible — writing dates as `2026-09-01` avoids the question entirely.
- **The export is .xlsx only, not CSV.** Every spreadsheet app opens .xlsx and it
  carries several sheets, which a single CSV cannot. If somebody needs CSV they can
  save it from Excel.
- **Nothing exports on a schedule or by email.** There is no cron and no queue in
  this project (see the note in `REQUIREMENTS.md`), so an export happens when a
  person asks for it. That is also why it works for any past date.
- **The day export has no payroll.** A payslip is a monthly document; there is no
  one day's payslip, and a pro-rated fragment would be a figure nobody could check.
  The month export has a Payslips sheet.
- **The double-count flag only catches an exact amount match.** An expense logged
  under a custom category for precisely the same rupees as a supply order on the
  same branch and day is flagged. A payment split across two expense rows, or
  rounded, or logged a day later, is not — the flag is deliberately evidence rather
  than a guess, so it is quiet rather than noisy. It never looks at the seeded
  categories at all.
- **Spreadsheet timestamps are in the branch's timezone**, which is correct but worth
  knowing if you compare a file from a Kolkata branch with one from elsewhere: the
  clock differs between them by design, because each is the clock the people there
  were working to.
- **The Alerts tab** intentionally shows a "planned" notice — Phase 5 work, not
  started. Reports is no longer one of these: it is the branch × month grid with
  net profit (Flow 17r). Its old "planned" strings are still on disk, because
  Phase 5's benchmarking notice will want them.
- **Notifications need Firebase set up to leave the device** (`Docs/FIREBASE_SETUP.md`).
  Without it the rows are still written and the in-app centre still lists them —
  that is a supported mode, and the whole test suite runs in it — but nothing
  reaches a lock screen.
- **iOS gets no pushes.** HisabKitab ships as an Android development build; iOS needs
  its own Firebase app registration, a `GoogleService-Info.plist` and an APNs
  key before any of this reaches an iPhone.
- **A notification is never re-sent.** If the push fails, the row stays and the
  person sees it the next time they open the app. There is no retry queue and no
  scheduler to run one — see the note on scheduling in `REQUIREMENTS.md`.
- **A branch created before this build has no delivery address**, so an order to
  it shows "No address saved for this branch" until somebody fills one in under
  Settings → branch → Branch settings. Nothing fails; the agent simply has the
  branch name and no street.
- **Cash stops being tracked once the agent has it.** A cash-on-delivery order
  records that the agent took the money from the branch (Flow 17i), which is
  what makes it Paid. Nothing records the agent then handing it in at the
  warehouse — there is no cash-in-hand figure per agent and no hand-over step.
  If that matters, it is a feature, not a bug report.
- **A warehouse is a row in Reports, marked "Cost centre", and shows no sales.**
  Decided in Task 8: it has an electricity bill and a wage bill, so leaving it
  out would overstate profit by everything it spends — but it has no till, so
  printing "Customer sales ₹0" would be reporting a fact about the data model as
  if it were a fact about the business. It therefore shows what it spends and
  nothing it cannot earn. It is still deliberately absent from the branch pickers
  for selling and ordering.
- **"Available" only means punched in.** An agent who does not use punch-in, or
  has no staff record, shows as "Attendance not tracked" forever. They are still
  selectable — availability is a caption, not a lock — but the desk gets no help
  from it at a business that does not run attendance.
- **An expense cannot be edited from the app, only removed and logged again.**
  The endpoint takes a correction (`PATCH /expenses/:id`) and the backend tests
  cover it; the screen offers the bin and not a pencil. Removing and re-adding
  reaches the same place in two taps more.
- **The warehouse is counted in "branches to chase".** It is a location with an
  electricity bill, so it can log expenses and is expected to — but it has no
  till, so opening its expense screen shows a **Sold** of zero and a difference
  that is simply its spending. That is right for cash movement, and Reports now
  labels the same location a **cost centre** and omits the sales figure rather
  than printing a zero — see Flow 17r.
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
  third-party library rather than from HisabKitab.
