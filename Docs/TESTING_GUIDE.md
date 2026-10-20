# Manual Testing Guide — KitnaPay

Click-by-click walkthroughs for every user-facing flow currently built. Follow
them in order the first time — several later flows (Team, Staff & Payroll)
assume branches and data already exist from earlier steps.

This covers the app as it exists today: Phases 0–1 (auth, branches, CSV
ingestion), Team & permissions (inviting, revoking, and switching between
businesses), and Attendance, Payroll & Salary Slips. Every message the server
sends is translated too, which Flow 18 checks. Reports is now the real branch ×
month grid with total profit (Flow 17r), and compares every business one account
holds (Flow 17s); the day and the month export to a spreadsheet and a printable
summary (Flow 17t). A branch has one cashier and a cashier has one branch, swapped
with a confirmation that names who is displaced, and every refusal now says what the
rule is rather than that a rule exists (Flow 17u). The AI "ask a
question" bar is gone from Home entirely (requirement 7), hidden behind a flag
until Phase 2's query engine exists. Alerts (Phase 5) has no tab at all; the Staff tab took its
slot. For the app stores, the privacy policy is reachable from Settings and sign-up
(Flow 20) and anybody can delete their own account (Flow 21); the app runs on Expo
SDK 54 and draws edge-to-edge on Android (Flow 0, Flow 10). A separate **web
app** in `web/` has sign-in, sign-up, Home with today's figures and the quick actions
(Flow W1), Settings with the business switcher (Flow W2), the notification bell and
centre (Flow W3), branches and the work calendar (Flow W5), products and sales upload
(Flow W6), Reports by day and by month with the kinds of cost and the month-end
export (Flow W7), expenses with the day-end export (Flow W9), the counter —
offline, with its receipt printer (Flow W12) — and the team, staff, attendance and
payroll (Flow W8), supply — the catalog, the cart, the desk, deliveries and the
order page (Flow W10) — and supply money: Payments, Payment QR codes and Vendors
(Flow W11). That is every page the app has; only browser notifications (W13) are
still to come.

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

   **The app is on Expo SDK 54 (React Native 0.81) since October 2026.** A
   development build installed before that cannot run today's JavaScript — it
   opens to a red error screen. Run `npm run android` once to build and install a
   new one; after that, `npm start` is enough again. Node 20.19.4 or newer is
   needed (`node -v`). The new build installs over the old one, because the
   debug signing key did not change.
3. **On a physical phone**, the app has to be able to reach the API — this is
   the usual cause of a login that fails with "cannot reach the KitnaPay server".
   Pick whichever matches how the phone is connected, and make sure
   `frontend/.env`'s `EXPO_PUBLIC_API_URL` agrees:
   - **USB cable** (works even on mobile data, and needs no firewall rule):
     set the URL to `http://localhost:4000/api`. `npm start` and
     `npm run android` set the forward up for you. If the app loads fine but
     every request fails with "Cannot reach the KitnaPay server", the forward was
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

7. **For the web app (Flow W1)**: `cd web`, `npm install` once, then `npm run dev`,
   and open `http://localhost:5173`. It calls `http://localhost:4000/api` unless
   `web/.env` sets `VITE_API_URL`. It is a different app from the mobile app's
   `npm run web` (step 2), which is the phone app drawn in a browser.

Two browser profiles are genuinely useful for this app (owner in one, a
teammate in another) — e.g. a normal window plus an Incognito/private window,
or two different browsers. Flows 7 and 8 call this out explicitly.

---

## Flow 0 — Launch: the name, the icon and the splash

The product is **KitnaPay**. Its launcher label, icon and system splash are
compiled into the APK, so **a build from before the rename still shows "HisabKitab"
and the old indigo icon** — rebuild first (`npx expo prebuild -p android`, then
`npm run android`). The web build has no launcher; steps 3–5 apply to it too.

1. Find the app on the phone's home screen or in the app drawer.
   - ✅ **Expected:** it is labelled **KitnaPay**, and its icon is the HK mark —
     two dark stems crossed by a blue ribbon, with a blue arm — on white.
2. Force-stop it (App info → **Force stop**), then open it.
   - ✅ **Expected:** the system's own splash is white with the whole mark in the
     middle — never black, never the old indigo, never the whole launcher tile
     cropped into a circle, and no corner of the mark clipped. The clock and
     battery in the status bar are dark, so they stay readable on the white, and
     there is no separate coloured strip behind them: since SDK 54 the app draws
     edge-to-edge, under the status bar.
3. Watch the app's own splash take over.
   - ✅ **Expected:** the mark does not jump in size or position at the moment the
     app's splash replaces the system's — both draw it about 140dp wide. A visible
     jump means `splashMarkWidth` and app.json's splash `imageWidth` have drifted
     apart (see CLAUDE.md, *Native Android builds*).
   - ✅ **Expected, in this order:** the left stem, then the right stem, rise into
     place; the blue ribbon sweeps across them from left to right; the arm of the
     K flicks out; then the whole logo lifts a little as **KitnaPay** — "Hisab"
     in black, "Kitab" in blue — and the tagline **"Your Business. All in One."**
     fade in beneath it. After about two seconds it fades into the first screen.
   - Change the language (step 4) and relaunch: the tagline follows it (Gujarati:
     *તમારો વ્યવસાય. બધું એક જ જગ્યાએ.*). The name does not — a brand name is the
     same in every language.
   - With **Remove animations** on (Settings → Accessibility), the logo and the
     name appear whole instead of drawing themselves in.
4. On **Login**:
   - ✅ **Expected:** the header shows the mark and **KitnaPay** in the same two
     colours, with the language chip at the right. The heading reads **"Welcome
     to KitnaPay"** with the name in blue. Tap the language chip: in Hindi it
     reads *"KitnaPay में आपका स्वागत है"* — the name first, as Gujarati and
     Marathi also put it. The button reads **"Sign in to KitnaPay"**.
   - On a phone 360dp wide or narrower, the Gujarati and Marathi button label
     wraps onto two lines. That is the label fitting, not overflowing.
5. Tap **"New to KitnaPay?"** to open sign-up.
   - ✅ **Expected:** the same mark and name in the header, beside a back arrow.
     On a 320dp-wide phone the name stacks — "Hisab" above "Kitab" — rather than
     being cut off or pushing the language chip off screen.

Home's top bar is checked in Flow 1, once there is an account to reach it with.

---

## Flow 1 — Register as a business owner

1. On the **Login** screen, tap **"New to KitnaPay? → Register your business and
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
     **KitnaPay** and, after it, the language chip, the bell and your avatar
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
4. Enter the same email/password, tap **"Sign in to KitnaPay."**
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
   - **"Privacy policy"** card — opens the public page in the browser (Flow 20)
   - **"Log out"**, a red outlined button
   - Under it, a small underlined **"Delete account"** link — quieter than Log
     out on purpose, so a thumb reaching for one does not land on the other
     (Flow 21)

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
- **Edge-to-edge** (Android, since SDK 54): the app now draws under the status
  bar and the navigation bar, and Android 16 allows no way out of it. Switch the
  phone between **gesture navigation** and **3-button navigation** (Settings →
  System → Navigation mode) and, in each, check that nothing sits under the bar
  at the bottom: the tab bar, the supply cart's total and Place-order tray, the
  counter's running total, and every form's submit button with the keyboard both
  open and closed. Nothing at the top should hide under the clock either.
  Check the screens that are a **tab for one role and a modal for another** both
  ways — the counter, the supply catalog and cart, Products, Payments: as a
  cashier's tab, and as an owner's modal from Home. In a tab there should be no
  extra gap above the tab bar; as a modal the last thing on screen should clear
  the navigation bar.

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

1. Invite an email that has no KitnaPay account (as in Flow 7), then, on the
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
   - ✅ **Expected:** tabs **Home · Products · Staff · Settings**. No Reports tab —
     five tabs is the budget, and the business-wide view is not theirs.
   - ✅ **Expected:** Home leads with **Today's sales · Bills · Today's
     expenses** for their branch, then **Quick actions** — **Billing** across the
     top with today's takings on it, then Items, Expenses, **Reports**, Order
     supplies and Supply orders — then **Recent bills**, then the catalog for
     their branch. No **Your branches** card and no **Branches to chase** card.
   - ✅ **Expected:** the **Reports** tile opens their own branch's report
     (changed 2026-10-19). One branch card, **no** net-profit card for the
     business above it, **no** "All branches" choice on the Per day view and no
     "All businesses" choice — a cashier reads their shop, not the chain. The
     branch's wage bill is part of its fixed costs, as it is for a manager.
   - ✅ **Expected:** in Products they can add a product for *their* branch, and
     the whole-business option is not offered at all — not offered-and-refused.
2. Log in as the **warehouse** user or the **delivery agent**.
   - ✅ **Expected:** tabs **Home · Staff · Settings** — no Products, no Reports.
   - ✅ **Expected:** the warehouse user gets **Branches to chase** on Home
     (requirement 10) and the delivery agent does not. Chasing branches for
     their daily expenses is the back office's job, and carrying orders is not.
   - ✅ **Expected:** quick actions to match — the desk gets Expenses, Raw
     material, Supply orders and Order desk; the agent gets Supply orders and
     Deliveries. Neither gets Billing or Payment history.
3. Log in as an **owner or manager**.
   - ✅ **Expected:** all five tabs, and Home runs today's figures (every
     branch) → quick actions → recent bills → the payments card → the branch
     list → the catalog.
   - ✅ **Expected:** the quick actions do **not** include "Order supplies" or
     "Deliveries". An owner holds every capability in the app, but a branch
     orders and an agent delivers — neither is the owner's job. What they get
     instead is **Raw material**, which is where prices are set, plus Reports,
     Order desk, Payment history and Upload sales.
   - ✅ **Expected:** the cashier still has "Order supplies", and the delivery
     agent still has "Deliveries". Same capabilities, different jobs.
4. With an account in two businesses (Flow 17a), switch business in Settings
   where your role differs between the two.
   - ✅ **Expected:** the tab bar changes to match the role in the business you
     switched to. Anything half-typed in a form is discarded — that is
     deliberate, since forms belong to the business you were in.
5. Have an owner change that person's role on another device, then background
   this app and bring it back.
   - ✅ **Expected:** the tabs update to the new role without a force-close.

---

## Flow 17d — The counter: ring up, take the money, get the token

Requirements 1 and 29. Log in as the **cashier** (Flow 15a) — they get a
**Counter** tab. An owner or manager reaches the same screen from Home instead,
since the tab bar only has room for five; opened that way it carries an **✕** in
the corner, which the cashier's tab does not (there would be nothing to close).

Needs at least one product with a price at that branch (Flow 17b). For the UPI
half, set the counter's UPI ID first (Flow 17ad); without one the counter takes
cash only and says why.

1. Open **Counter**.
   - ✅ **Expected:** across the top, **Today's sales**, **Bills** and — for
     somebody who may read expenses, which includes the cashier — **Today's
     expenses**, with **Log an expense** under them. A grid of products below;
     the bill tray at the bottom says "Tap a product to start a bill".
   - ✅ **Expected:** every product tile is wide enough to read — a name over at
     most two lines and the price beneath it. Three across on a normal phone,
     two on a small one, more on a tablet. Nothing reading as a vertical column
     of single letters.
2. Tap a product, then two more, and use the + / − beside a line.
   - ✅ **Expected:** each tap is **instant** — nothing waits on the network. The
     tile turns blue and counts up; the tray shows the lines, the item count and
     the total, with **Charge ₹…** on its own row under the total.
   - ✅ **Expected:** − on a line of one shows a bin and takes the line off.
     **Clear** empties the bill. A dozen different items make the lines scroll
     inside the tray, so the product grid stays reachable.
   - ✅ **Expected:** no token number yet — a token belongs to a paid bill.
3. Press **Charge ₹…**. The payment sheet opens on **UPI**.
   - ✅ **Expected:** the amount, large; a QR for exactly that amount, naming the
     business (or the shop, Flow 17ad); "Ask the customer to scan this with their
     UPI app". **No** "Pay with UPI app" button — at the counter it is the
     customer's phone that pays.
   - ✅ **Expected:** scanning it with a real UPI app shows the business's name
     and the exact amount, with a note like `SYA #42` (the branch code and the
     token this bill will get).
4. Press **Payment done**.
   - ✅ **Expected:** a large green tick and **Token 42** (the next number), "The
     bill is saved on this phone". With a printer set up and **Print the token
     automatically** on (Flow 17ac), it prints and says **Token printed**.
   - ✅ **Expected:** **Next bill** closes the sheet; the bill is in **Today's
     bills** with its token, total, item count, time and a **UPI** pill, and the
     figures at the top have gone up by exactly its amount.
5. Ring up another bill, **Charge**, switch to **Cash**, and tap **₹100**.
   - ✅ **Expected:** **Change to give back** shows ₹100 minus the bill. **Exact
     amount** shows no change. **Payment done** issues the next token with a
     **Cash** pill.
6. Ring up a few more.
   - ✅ **Expected:** token numbers go up by one each time and never repeat.
7. Go to **Home** (or Reports) and look at the sales figure.
   - ✅ **Expected:** it has gone up by exactly what you took. Counter sales and
     uploaded CSV sales land in the same place.
8. Tap a bill in **Today's bills**.
   - ✅ **Expected:** a sheet with its lines, total, payment pill, **Print
     again** (with a printer set up) and **Void this bill**. There is no way to
     edit it — a paid bill is voided and rung up again, so the customer's slip
     always matches the record.
9. **Void this bill**.
   - ✅ **Expected:** it asks first. Confirming marks it Voided, the day's sales
     drop by its amount, and the row stays in the list greyed out with the amount
     struck through. The token number is never used again.
10. Switch to your other branch at the top.
    - ✅ **Expected:** its tokens number independently, and the bill being rung
      up is cleared rather than carried across.
11. Switch the app to Gujarati (Settings → language) and come back, on a small
    phone (or 320dp).
    - ✅ **Expected:** the three tiles still line up even where a label wraps; the
      tray's total and **Charge** button stack rather than squeeze; the payment
      sheet's UPI / Cash choice, the cash chips (which wrap) and **Payment done**
      all fit; nothing is cut off. Check it with gesture navigation **and**
      3-button navigation — the sheet's last button must sit above the bar.

---

## Flow 17ab — Billing with no internet

Requirement 30. On the cashier's phone, with the counter opened online at least
once (that is when it saves the menu and the branch's details).

1. Turn on **airplane mode**. Ring up a bill, **Charge**, **Cash**, **Payment
   done**.
   - ✅ **Expected:** it works exactly as online — token, print and all. A line
     under the header says **Offline — 1 bill saved on this phone, sent when the
     connection is back**, and the bill shows a small cloud icon.
   - ✅ **Expected:** **UPI** still shows the QR — it is built on the phone. (The
     customer's own phone needs a connection to pay it; that is theirs.)
2. Take two more bills. Then **force-close the app** and open it again, still in
   airplane mode.
   - ✅ **Expected:** the app opens on the counter, **not** the sign-in screen,
     with all three bills and the menu still there.
3. Turn airplane mode off.
   - ✅ **Expected:** within a few seconds (at most a minute) the line under the
     header disappears, the cloud icons go, and the bills appear in Reports and on
     the owner's Home. Each one counted **once**.
4. Two phones at one branch: sign in as the cashier on one and the owner on the
   other, both in airplane mode, and take one bill on each. Both print the same
   token number. Reconnect both.
   - ✅ **Expected:** both bills are recorded. The one that synced second is
     renumbered — its row shows the new number, and its bill sheet says
     **Printed as 7** — so the slip in the customer's hand still matches.
5. Take a bill offline, sign out, sign back in (online).
   - ✅ **Expected:** the bill is still there and is sent. Signing out never
     throws away bills that were not sent.
6. Close a day that has a bill on a phone that has not synced yet (close it from
   another device, Flow 17e), then reconnect that phone.
   - ✅ **Expected:** a red **1 bill needs attention** card with the reason —
     "This day has been closed…" — and **Reopen that day** (for someone who may),
     **Send again** and **Remove from this phone** (which asks first). The bill is
     never dropped on its own.
7. Let the business's plan run out (Flow 17aa) with bills unsent.
   - ✅ **Expected:** the counter says no new bills can be taken; the bills
     already taken stay on the phone ("…kept on this phone — the server is not
     taking new bills") and go once the plan is renewed.

---

## Flow 17ac — The receipt printer

Requirement 31. A Bluetooth thermal receipt printer (58mm or 80mm), and the
**Android** app built after the printer module was added — an older APK says
"This copy of the app was built before printing was added".

1. Switch the printer on and pair it in the **phone's** Bluetooth settings (PIN
   usually 0000 or 1234).
2. **Settings → Receipt printer** (or the printer icon on the counter).
   - ✅ **Expected:** Android asks for **Nearby devices** once. The paired printer
     is listed; choose it.
   - ✅ **Expected:** **Paper** 58 mm / 80 mm, **Print the token automatically**,
     **Print a test slip**, and a preview of a token at the bottom that fits the
     screen at both widths, even on a 320dp phone.
3. **Print a test slip.**
   - ✅ **Expected:** a slip with a ruler that fits **exactly one line**, three
     sizes of text, and the paper **cut** below the last line.
4. Take a bill (Flow 17d).
   - ✅ **Expected:** the token prints by itself within a couple of seconds: the
     business name large, the branch, its address and phone (Flow 17ad), **TOKEN**
     and the number very large, the date and time in 12-hour form, each item with
     its quantity, rate and amount, the total, **Paid: UPI** or **Paid: Cash**, and
     "Thank you! Visit again". A long product name wraps instead of being cut.
5. Tap the bill → **Print again**.
   - ✅ **Expected:** the same slip, marked **\*\*\* COPY \*\*\***.
6. Switch the printer off and take a bill.
   - ✅ **Expected:** the bill is saved and the token shown; the sheet says it
     could not reach the printer and offers **Print again**. Printing never
     decides whether a sale happened.
7. Name a product in Gujarati and give it a code (SKU); name another in Gujarati
   with no code. Ring both up.
   - ✅ **Expected:** the first prints as its code, the second as "Item 2" — never
     a row of question marks. The edit screen for a product like that says so.

---

## Flow 17ad — Where counter customers pay, and the shop's phone

Requirements 31 and 32. As the **owner**.

1. **Settings → Payment QR codes.**
   - ✅ **Expected:** a **Counter** section first: the business's counter UPI ID,
     then every shop listed under it as "Uses the business's UPI ID". On the
     Starter plan the Warehouse and Vendors sections are not there at all.
2. Set the counter UPI ID (e.g. `yourname@okaxis`) and save.
   - ✅ **Expected:** the test QR shows the business's name. The cashier's counter
     now offers UPI (Flow 17d).
3. Open one shop and give it its own UPI ID — a franchise shop's, say.
   - ✅ **Expected:** that shop's counter QR pays the shop's ID and name; the others
     still pay the business's. **Remove UPI ID** on the shop asks first and puts it
     back on the business's.
4. As the cashier, open **Settings**.
   - ✅ **Expected:** no Payment QR codes — where money goes is not the cashier's to
     change.
5. **Settings → branch → Branch settings**, fill in **Phone number** and save.
   - ✅ **Expected:** the next token printed carries it under the address.

---

## Flow 17e — Closing the day

The floor that stops an edit quietly rewriting a number you have already been
shown.

1. With at least one token still **Open**, try to close the day.
   - ✅ **Expected:** refused, telling you how many are still open.
2. Hand over or void everything, then close the day.
   - ✅ **Expected:** it closes, and a **Day closed** badge appears.
3. Try to take a new bill, or void one of that day's.
   - ✅ **Expected:** both refused, saying the day has been closed. The counter's
     tray says so above a greyed-out **Charge** rather than failing only once you
     press it. A bill taken offline for that day is held in "needs attention"
     (Flow 17ab).
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

## Flow 17r — Reports: every branch, month by month, with total profit

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
2. Look at the **Total profit** card at the top (Per month is selected).
   - ✅ **Expected:** one large figure, red if it is negative, and under it boxes
     **two to a row**: Total business, Variable expenses ("incl. vendors ₹…" when
     there were any), Fixed expenses ("incl. wages ₹…"), Daily expenses, Total cost,
     and Moved internally only when something was. Four across one row would give
     each about 76dp and break every label — if you see that, it is a bug.
   - ✅ **Expected:** if wages have not been finalised for the month, a line
     saying so. Profit computed from unrun payroll is too flattering, and the
     card says as much rather than looking confident.
3. **Check the arithmetic by hand.** This is requirement 13's actual acceptance
   criterion, so it is worth doing once properly.
   - Variable + Fixed + Daily should equal Total cost, and Total business − Total
     cost should equal the Total profit shown.
   - ✅ **Expected:** both do, exactly. Note that **"Moved internally" is not
     subtracted** here, and is not inside Variable either.
4. Read the sentence at the bottom of the card, if there is one.
   - ✅ **Expected:** it appears only when a branch has bought material from your
     own warehouse, and it reads like "Your branches together made −₹42,000. Add
     back the ₹30,000 they paid your own warehouse for material — money that never
     left the business — and the total is −₹12,000."
   - Now add up the **Total profit of every branch card below**, then add the
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
     last. Each shows the branch name, a trend pill, the month's Total profit, then
     Total business, Variable, Fixed, Daily and Total cost two-to-a-row, and a row
     of small bars.
   - ✅ **Expected:** the bars grow **upward in green for a profit and downward
     in red for a loss**, from a line in the middle. A loss drawn as a short
     upward bar would read as a small profit.
7. Tap a bar in one branch's row.
   - ✅ **Expected:** the month strip at the top moves to that month and **every
     card on the screen changes together**, because that is the column of the
     grid you just asked for. The cards re-sort, because the ranking is for the
     month in focus.
8. Find your **warehouse** card.
   - ✅ **Expected:** a grey **"Cost centre"** pill, **no Total business figure and
     no raw-material caption at all** — just Variable, Fixed, Daily and Total cost —
     and a Total profit that is simply minus its Total cost. A warehouse has no till, so a "₹0 of sales" row
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
     with its own Total profit and the month card's breakdown for the whole range —
     Total business, Variable (vendors inside it), Fixed (wages inside it), Daily,
     Total cost, and Moved internally only when its branches paid its own warehouse.
     Total business − Total cost is the Total profit on every card.
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
   and a name such as `KitnaPay Warehouse`. Press **Save**.
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

## Flow 17aa — Plans: the trial, a paid plan, the limits, and running out

Requirement 28. You need the backend's database to change the plan by hand, as the
operator will — `backend/scripts/set-plan.js` — and a SQL tool (or Prisma Studio) to move a
date into the past. Use a business you own with at least two trading branches.

**The quick way, in development: `backend/scripts/dev-plan.sql`.** Set five lines at the
top — the email of somebody in the business, which of their businesses, the state
(`show`, `trial`, `trial_ending`, `paid`, `no_end`, `grace`, `read_only`, `cancelled`),
the plan and the branches paid for — and run the whole file in pgAdmin or DBeaver. It
prints where every business of that email now stands, and refuses to run against any
database but `buisnessops`. Each step below can be done with it instead of `set-plan.js`
or a hand-written `UPDATE`; reopen the app after each run.

1. Sign up a **new** account, or add a second business from Settings.
   - ✅ **Expected:** Settings shows **Your plan** with *Franchise · Free trial*. Open it:
     *Free trial until* a date 30 days away, *N in use. No limit during the free trial*,
     and the three plans, Franchise marked **Current**. No price and no way to pay
     anywhere in the app. An admin of the same business sees no **Your plan** entry.
2. Find the business's id (`--show` needs it; Prisma Studio, `businesses`), then in
   `backend/`:

       node scripts/set-plan.js --business <id> --show
       node scripts/set-plan.js --business <id> --plan STARTER --branches 1 --until 2027-10-13 --actor you

   - ✅ **Expected:** the second command refuses — the business has more trading
     branches in use than 1, and the script never picks which shop to shut.
3. Run it again with `--branches 2 --interval YEARLY --amount 11976 --reference UTR123`,
   then close and reopen the app — the plan travels with the session, which is loaded when the app starts.
   - ✅ **Expected:** Settings reads *Starter · Paid*; the Plan screen *Paid until 13
     October 2027*, *Billed yearly*, *2 in use, of 2 paid for*. On Home the supply cards,
     *Payments* and the cross-branch Reports are gone. In Prisma Studio, `billing_events`
     has a `PLAN_SET` row with your name, the amount and UTR123.
4. **Add branch.**
   - ✅ **Expected:** *Who pays for raw material?* offers only the FM row, already chosen,
     with a line saying company-operated branches are part of Franchise. Fill it in and
     save: refused — *Every branch this business's plan pays for is in use (2) …*. Choose
     **Warehouse** instead and save: it is created (warehouses are free).
5. **Team → Invite.**
   - ✅ **Expected:** Admin, Manager, Cashier and Staff only, and *Other roles come with a
     higher plan.* under them.
6. Put the business on Growth (`--plan GROWTH --branches 3 …`) and reopen the app.
   - ✅ **Expected:** supply orders, the desk and cross-branch Reports are back. **Vendors**
     lists the ones you have, with no *Add vendor* button and a line saying adding vendors
     is part of Franchise; an existing vendor can still be opened and edited. On a raw
     material, *Supplied by* offers the warehouse and the item's own vendor only.
7. Run out the plan: in SQL, `UPDATE subscriptions SET "currentPeriodEnd" = now() - interval '2 days' WHERE "businessId" = '<id>';`
   and reopen the app.
   - ✅ **Expected:** as the owner, a yellow banner on Home — *This business's plan ended
     on … It becomes read-only on …* — with **See plan**; the Plan screen's pill says
     **Ended**. Everything still saves. A cashier sees no banner.
8. Push it past grace: `… - interval '8 days' …`, and reopen the app.
   - ✅ **Expected:** a red banner for everyone — *This business's plan has ended …
     nothing new can be saved* — with **See plan** for the owner only. Ring up a counter
     order or log an expense: refused with the same sentence. Reports, the day-end export
     and every list still open. **Team → remove someone** still works, and so does
     clearing notifications.
9. Restore it: `node scripts/set-plan.js --business <id> --plan FRANCHISE --branches 5 --until 2027-10-13 --actor you`.
   - ✅ **Expected:** everything is back once the app is reopened.

**On the web** (`npm run dev` in `web/`): the same Plan page is at **Settings → Your
plan**, and also says whom to write to about changing the plan (the `SUPPORT_EMAIL` the
server is configured with). With the business on Starter, open `/reports` directly:
*Part of the Growth plan* rather than *Not part of your role*.

---

## Flow 17af — Home: today, quick actions and recent bills

Requirement 33.

1. As the cashier, take two bills (Flow 17d) and log an expense, then go Home.
   - ✅ **Expected:** **Today's sales**, **Bills** and **Today's expenses** match
     what you just did. The **Billing** tile says "Today ₹… · 2 bills".
   - ✅ **Expected:** **Recent bills** lists them, newest first, with token, items,
     time, amount and how it was paid; **See all** opens the counter.
2. Turn on airplane mode and take a bill, then go Home.
   - ✅ **Expected:** a line under **Recent bills** says one bill is waiting to be
     sent. Reconnect: it goes, and the figures catch up on the next visit.
3. Tap each quick action.
   - ✅ **Expected:** every tile opens its screen — none leads to a refusal.
     **Billing** switches to the cashier's Counter tab; for an owner it opens the
     counter over Home.
4. As an owner on the **Starter** plan (Flow 17aa), tap **Reports**.
   - ✅ **Expected:** Reports opens with a close button, showing the branch figures
     (there is no Reports tab on Starter, so this tile is the way in).
5. On a 320dp phone, and on a tablet, in Gujarati.
   - ✅ **Expected:** two tiles across on the small phone, three on a normal one,
     four on a tablet; every label wraps whole words rather than being cut or
     shrunk; the three figures line up; the Billing tile's caption wraps under its
     label.

---

## Flow 17ag — Reports by day, and kinds of cost

Requirement 34. Owner, with a month of sales, expenses in several categories, a supply
order and a payslip (as for Flow 17r).

1. **Reports → Per day.**
   - ✅ **Expected:** this month with **‹ ›**; for an owner of several branches, wrapping
     chips **All branches** and one per branch. A card with the month's Total profit,
     Total business and the three costs, and the note that rent, electricity and wages
     are shared over the month's days. Then one row per day so far, newest first, each
     with Business, Cost and Profit (green, or red for a loss).
2. Tap a day.
   - ✅ **Expected:** it opens to Variable, Fixed ("shared over the month"), Daily and
     Total cost for that day. A day with no sales still carries its share of fixed cost,
     so it shows a small loss — that is the point of spreading it.
3. Add up the days' profit for a finished month.
   - ✅ **Expected:** it equals that month's Total profit under **Per month**, to the rupee.
4. **How costs are grouped** (under the Per day / Per month choice), or Settings → **Kinds
   of cost**.
   - ✅ **Expected:** what Variable, Fixed and Daily mean; raw material always Variable and
     wages always Fixed; each category with a Variable / Fixed / Daily choice. Milk and
     Gas start Variable, Rent and Electricity Fixed, the rest Daily.
5. Move **Gas** to Fixed, then look at Per month again.
   - ✅ **Expected:** the gas amount moves from Variable to Fixed; Total cost and Total
     profit do not change. Move it back.
6. As the cashier, open Settings.
   - ✅ **Expected:** no Kinds of cost, and no Reports tile on Home — today's figures only.
7. At 320dp in Gujarati: the Per day / Per month choice, the branch chips (they wrap), a
   day row's three figures (they wrap rather than squeeze), and each category's three
   choices under its name.

---

## Flow 17ae — Payment history

Requirement 35. Needs some paid supply orders (Flows 17x, 17y).

1. As the **accountant**, open **Payments → History**.
   - ✅ **Expected:** this month, with **‹ ›** to move between months; **All / FOCO /
     FM**; **Paid by accounts** and **Paid by franchise branches** with their order
     counts; and the orders, newest payment first.
   - ✅ **Expected:** each order shows its number and branch, whom it paid, the
     amount, FOCO or FM, its payment status, and every payment on it — "Paid by
     accounts · Pay accountant · 14 Oct 2026 03:10 PM", with the reference beneath
     when one was typed. Tapping it opens the order.
2. Choose **FOCO**, then **FM**.
   - ✅ **Expected:** the list and the totals narrow to that kind of branch. An FM
     payment sent but not yet confirmed shows "still waiting to be confirmed".
3. Place a FOCO order and do not pay it.
   - ✅ **Expected:** it is not in History — only orders money moved on are.
4. As the **owner**, open the Payments card on Home → **History**.
   - ✅ **Expected:** the same history. As the **warehouse desk**, there is no
     History tab; asking the server directly is refused with "Only Owner, Admin,
     Manager or Accountant can read the history of supply-order payments".
5. At 320dp in Gujarati.
   - ✅ **Expected:** the three tabs and the three filters each fit their row; the
     two total tiles line up; event lines wrap rather than run off.

---

## Flow 20 — The privacy policy

Both app stores require a privacy policy that is reachable from inside the app,
not only from the store listing. It is a public page the backend serves at
`/privacy`, beside the API rather than under `/api`.

1. **Settings → Privacy policy.**
   - ✅ **Expected:** the phone's browser opens the API server's `/privacy` page
     (with `.env` on `localhost` over `adb reverse`, the phone's browser reaches it
     through the same tunnel). It shows the KitnaPay name, **Privacy policy**, a
     *Last updated* date, and sections on what is collected, why, who sees it, how
     long it is kept, deleting your account, and your rights.
   - Until the company is registered it also shows a yellow box: **Operator
     details are being finalised.** That is correct, not a missing page.
2. Log out, open **sign-up**, and look under the **Register** button.
   - ✅ **Expected:** *By creating an account you agree to the* **Privacy policy**,
     with the last words underlined in blue; tapping them opens the same page.
     Switch language: in Hindi, Gujarati and Marathi the link sits wherever that
     language puts the policy's name in the sentence, not tacked onto the end.
3. In `backend/.env`, set `LEGAL_NAME`, `LEGAL_ADDRESS` and `SUPPORT_EMAIL`
   (an address can break lines with `\n`), restart the backend, and reload the page.
   - ✅ **Expected:** the yellow box is gone, and **Contact** names the company, its
     address on separate lines, and the email as a link. Open `/delete-account` too:
     it now tells someone without the app to write to that address.

The page is English in every language — see *Known limitations*.

---

## Flow 21 — Delete your account

Both app stores require this too. **Use throwaway accounts** — what this deletes
cannot be brought back. Each case starts at **Settings → Delete account**.

1. **The screen, before anything happens.**
   - ✅ **Expected:** a title, *This cannot be undone*, and a card **What will be
     deleted**: your name, phone, password, notifications and settings. For an
     owner, it then lists **the businesses you own** by name, with a blue tip to
     download what you need first (**Reports → Export**) and a note that a business
     with other active members will be refused. For anyone who works in somebody
     else's business, a second card **What stays** names those businesses and says
     the attendance and payslips stay with them. At the bottom: a password field, a
     solid red **Delete my account** button (greyed out until you type), and a
     *Read exactly what is deleted* link that opens `/delete-account`.
2. **A wrong password.** Type anything else, press **Delete my account**, confirm.
   - ✅ **Expected:** it asks first — *Delete your account?* — then a red banner:
     *That password is not right, so your account was not deleted.* You are still
     signed in, and nothing has changed.
3. **An owner with a team.** As the owner from Flow 6, whose business still has an
   active member, enter the right password and confirm.
   - ✅ **Expected:** refused, naming the business: *<Business> still has 1 other
     active member(s). Remove them from the team first, then delete your account.*
     Still signed in; the business and its team untouched.
4. **Somebody who works in a business.** Sign in as the Staff account from Flow 7,
   delete it with the right password.
   - ✅ **Expected:** signed out to the Login screen at once. Signing in with that
     email and password now says *Invalid email or password*.
   - As the owner: on **Team** their row reads **Deleted account**, struck through
     as removed, with no email under it; on the **Staff** tab their staff record and
     the days they worked are still there — the business's own record of paying
     them.
5. **An owner alone.** Register a new owner (Flow 1) with a fresh email, add a
   branch, then delete the account.
   - ✅ **Expected:** the confirmation says the account **and the businesses you
     own** will be deleted, with all their records. After it, signed out. Signing
     in fails. **Registering again with the same email works**, and starts a new,
     empty business — the old one is gone with everything in it.
6. **Signed in somewhere else at the time.** If the account in 4 or 5 was also
   open in a second browser or phone, use anything there.
   - ✅ **Expected:** that session ends on its next request and returns to Login —
     a deleted account is refused everywhere at once, not when its token expires.
7. **Without the app:** open `/delete-account` in any browser.
   - ✅ **Expected:** the steps in the app, what is and is not deleted, and — once
     `SUPPORT_EMAIL` is set (Flow 20, step 3) — the address to write to.

---

## Flow W1 — The web app: sign in, register, Home

Needs the backend running and the web app started (section 0, step 7). Use an
account from Flow 1, or the seed data's logins.

1. Open `http://localhost:5173/`.
   - ✅ **Expected:** you are sent to `/login`. On a laptop-width window the page
     is two columns — *Welcome to KitnaPay* with the blue hero card on the left,
     the sign-in card on the right. The mark draws itself in the top-left corner.
   - Narrow the window below about 960px: it becomes the app's single column, in
     the app's order. At phone width nothing scrolls sideways.
2. Open the **EN** chip in the top-right corner and pick **ગુજરાતી**.
   - ✅ **Expected:** the whole page changes language at once, the name stays
     "KitnaPay" and the chip shows **ગુજ**. Reload: it is still Gujarati. Switch
     back to English.
3. Sign in with a wrong password.
   - ✅ **Expected:** the card shakes once and says the email or password is wrong
     (in the chosen language). Typing in either field clears it.
4. Sign in properly.
   - ✅ **Expected:** Home. A sidebar on the left lists only what your role can
     open, grouped *Overview / Branch / Supply / People*, with **Settings** at the
     foot; the top bar names the business and your role. Home greets you by first
     name, shows the business and its branch count, then the app's Home in the app's
     order: **Today's sales**, **Bills** and **Today's expenses** across your
     branches, **Quick actions** — the large blue **Billing** tile with today's
     takings and bill count, then a tile per thing your role does (Items, Expenses,
     Reports, Raw material, Orders, Desk, Payment history, Upload…) — **Recent
     bills**, your branches and the first branch's products. On a window 1100px or
     wider the quick actions sit in a column on the right. Figures use Indian
     grouping (₹18,450).
5. Click any sidebar entry other than Home — **Counter**, say.
   - ✅ **Expected:** a card titled with that page's name and a **Coming to the
     web** badge, saying the page works in the mobile app and is on its way here,
     with **Back to Home**. That is correct for now, not a broken page.
6. Sign in as a cashier, an accountant and a delivery agent (a second browser
   profile helps).
   - ✅ **Expected:** the sidebar and Home match what that role has in the app.
     The **cashier** sees today's three figures for their own shop, the Billing tile,
     Items and Expenses, and the shop's recent bills — **no Reports** tile and no
     profit anywhere. The **accountant** sees today's figures and a **Payment
     history** tile, no Billing tile and no recent bills. The **delivery agent** sees
     Orders and Deliveries tiles and no figures. Type `/desk` into the address bar
     as a cashier: **Not part of your role**, not the desk. Every tile opens its page,
     never *Not part of your role*.
7. Narrow the window to phone width.
   - ✅ **Expected:** the sidebar folds away behind a menu button; it opens over a
     dimmed page and closes with ✕, Escape, a click outside, or following a link.
     Today's sales take the first row of figures, bills and expenses the second; the
     quick actions follow straight after, two tiles across at 320px, their labels
     wrapping in Gujarati rather than being cut.
8. With Home open, ring up a sale or add a branch from the phone, then switch
   back to the browser tab.
   - ✅ **Expected:** the figures and the branch list catch up on their own — the
     page refreshes when its tab comes back into view. The ↻ button beside the
     greeting does the same on demand.
9. Open the avatar in the top-right corner and choose **Log out**.
   - ✅ **Expected:** back to sign-in. The browser's back button does not return to
     Home.
10. Click **New to KitnaPay?** and fill in sign-up. Type an email that has a
    pending invite (Flow 7).
    - ✅ **Expected:** the same rules as the app's sign-up — the password strength
      bar, *Passwords do not match yet*, and for the invited email a blue line
      naming the business and role, the business section gone, and the button
      reading **Join <business>**. The timezone starts as this computer's
      (`Asia/Kolkata` in India). **Privacy policy** under the button is a link and
      opens the policy in a new tab.

## Flow W2 — The web app: Settings, switching business, adding one, deleting an account

Use an owner who belongs to two businesses (Flow 17a makes one). Web app running
(section 0, step 7).

1. Open **Settings** from the foot of the sidebar.
   - ✅ **Expected:** on a laptop-width window, two columns: your name and email,
     *Account* (email, role), *Business* with both businesses as a list, **Add
     another business**, and the business's details on the left; **My attendance**,
     **Workweek & holidays**, **Team & permissions**, **Payment QR codes**, the
     **Language** list, **Privacy policy**, **Log out** and a quiet **Delete account**
     link on the right. Narrower, one column in that order.
2. Pick the other business in the *Business* card.
   - ✅ **Expected:** the tick moves, the top bar names the new business, and Home's
     figures and branches are the new business's when you go back to it — never the
     old one's for a moment. Switch back.
3. Click the business name in the top bar (laptop width).
   - ✅ **Expected:** a menu of both businesses with your role in each; choosing one
     switches exactly as step 2 did. Someone in one business sees the name and role
     there, with no menu.
4. In the *Language* card choose **हिन्दी**.
   - ✅ **Expected:** the whole app changes at once; reload and it stays. Sign in on
     the phone with the same account — it follows, unless the phone has its own
     choice. Switch back to English.
5. **Add another business** → fill in a name → **Create business**.
   - ✅ **Expected:** industry, country, currency and timezone start as the current
     business's. After creating, you are back on Settings acting under the new
     business, and it is in the switcher.
6. Sign in as a cashier and open Settings.
   - ✅ **Expected:** no **Add another business**, no Team, Workweek or Payment QR
     codes — only what a cashier can open.
7. **Delete account** (use a throwaway account): type a wrong password and press the
   red button, then confirm.
   - ✅ **Expected:** a dialog asks first, naming the businesses that go with an
     owner's account; **Cancel** leaves everything as it was. With the wrong password
     the page says so and nothing is deleted. With the right one you are signed out
     and cannot sign in again.
8. **Log out** from Settings.
   - ✅ **Expected:** back at sign-in.

## Flow W3 — The web app: the bell and the notification centre

Needs some notifications in the business — the seed data has them, or place and
move a supply order from the phone (Flow 17g–17h).

1. Sign in on the web as the branch's cashier.
   - ✅ **Expected:** a bell in the top bar, with a red count of unread
     notifications once there are any (9+ above nine).
2. Click the bell.
   - ✅ **Expected:** the notification centre: newest first, unread ones tinted with a
     blue dot, each sentence in the chosen language with its date and time, and
     **Mark all read** while anything is unread. Switch language: the whole history
     re-renders in it.
3. Click an unread notification about an order.
   - ✅ **Expected:** its dot goes at once and it opens that order's page. One the
     role can no longer open goes to Home instead.
4. Leave the tab open on any page, and from the phone have the warehouse accept an
   order. Within a minute — or at once when you switch back to the tab:
   - ✅ **Expected:** the bell's count rises without a reload.
5. **Settings → What to send me.**
   - ✅ **Expected:** a note that the browser does not pop notifications up yet, then
     one switch per kind — **Attendance** reads *Always on* with no switch. Turning
     one off saves at once and stays off after a reload, and on the phone.

---

## Flow W5 — The web app: branches and the work calendar

The web's version of Flows 3, 11 and 19. Sign in as the owner. Location needs
`localhost` or HTTPS — the browser offers it nowhere else.

1. On **Home → Branches**, click **Add branch**.
   - ✅ **Expected:** the form, with **Branch** chosen and neither payment model
     chosen; **Create branch** stays grey until one is. Choose **Warehouse**: the
     payment question goes away.
2. Fill in a name and a code, type `150` as the radius and leave the coordinates
   empty.
   - ✅ **Expected:** red under the radius — *set the branch location first* — and
     the button stays grey. Type `0`: *must be greater than zero*.
3. Click **Use my current location** and allow it.
   - ✅ **Expected:** latitude and longitude fill in to six decimal places, and
     **See it on the map** appears; it opens that point in a new tab.
   - Block location for the site instead (the icon beside the address): a sentence
     saying the browser is blocking it and how to allow it.
4. Create the branch.
   - ✅ **Expected:** back on Home, the new branch is in the list at once, with a pin
     if it has a radius.
5. Click the branch.
   - ✅ **Expected:** its name as the page title, *Branch settings* under it, and the
     saved values in every field. **Turn off geofencing** empties the radius and
     leaves the coordinates; save, reopen — the radius is gone, the point is not.
6. Change the timezone to `Mars/Olympus_Mons` and save.
   - ✅ **Expected:** refused, in the chosen language, beside the Save button.
7. Open `/branches/nothing-here`.
   - ✅ **Expected:** *That branch no longer exists*, with the way back to Home.
8. **Settings → Workweek & holidays.**
   - ✅ **Expected:** Sunday chosen as the weekly off. Click Saturday: it saves at
     once, and holds after a reload. Choose six days: the seventh greys out and the
     sentence under the chips says why.
9. Add a holiday with a date and a name.
   - ✅ **Expected:** it joins the list with an *All branches* pill. Click its bin:
     a question naming it and its date; **Remove** takes it off the list.
10. Sign in as a cashier and open `/branches/new` and `/work-calendar`.
    - ✅ **Expected:** *Not part of your role* on both.

---

## Flow W6 — The web app: products and sales upload

The web's version of Flows 4 and 17b. Sign in as the owner, in a business with at
least two branches.

1. **Products** in the sidebar.
   - ✅ **Expected:** the first branch's catalog, grouped by category, with a tile per
     branch above it. Click another branch: its catalog, its prices, and its id in the
     address — reload and it stays.
2. Type part of a product's name, then its code.
   - ✅ **Expected:** the list narrows as you type; nonsense says nothing matches.
3. **Add** → name `Kesar Lassi`, sold by `glass`, sells for `60`, *One branch only*,
   the branch you were on → **Add product**.
   - ✅ **Expected:** back on Products with it listed and a *Branch only* pill. Type
     `abc` as a price first: *Enter a number* under that field and the button stays grey.
4. Open **Cold Coffee** (or any business-wide product).
   - ✅ **Expected:** its name as the title. Under *Price at one branch*, the fields
     show what the chosen branch charges now, or are empty when it charges the business
     price. Set `130` / `40` → **Save branch price** → *Branch price saved.* Products
     shows ₹130 with *Branch price* for that branch only.
5. Empty both fields → **Use the business price**.
   - ✅ **Expected:** *Back to the business price.*, and the branch charges the default
     again.
6. **Withdraw from sale**.
   - ✅ **Expected:** a question first; after it, a *Withdrawn* pill and the button
     reads **Put back on sale** — which does not ask.
7. Back on Products, switch on **Show withdrawn**.
   - ✅ **Expected:** the product appears again, faded, with a *Withdrawn* pill; open it
     and put it back on sale. (The app cannot find it again once you leave it.)
8. **Upload sales data** → **Download template**.
   - ✅ **Expected:** `kitnapay-sales-template.csv` is saved. **How to fill in the
     template** opens the column guide in the chosen language.
9. Choose a branch, drop the untouched template on the file box, **Upload and import**.
   - ✅ **Expected:** *Nothing to import yet* — the template's example rows are never
     imported.
10. Add a few rows of your own under the examples (one with quantity `0`), upload again.
    - ✅ **Expected:** created / updated / skipped counts, a note that the example rows
      were left out and how dates were read, and the bad row named in the chosen
      language. Home's sales figure has moved.
11. Drop a `.pdf` on the file box.
    - ✅ **Expected:** refused on the page, before anything is sent.
12. Sign in as a cashier.
    - ✅ **Expected:** Products shows their branch with no branch tiles; **Add** offers
      no *Who sells this* choice. **Upload sales data** says *Not part of your role*.

---

## Flow W7 — The web app: Reports and the month-end export

The web's version of Flows 17r–17t. Sign in as the owner of a business with several
months of figures — the seed data (`Docs/TEST_DATA_SEED.md`) is made for this.

1. **Reports** in the sidebar.
   - ✅ **Expected:** *6 months* chosen, the month strip ending on this month, the
     business's Total profit with its breakdown, *Needs attention*, the export card, and
     one card per branch, best first with the warehouse last as a *Cost centre*.
2. On a window 1000px or wider, look below the summary.
   - ✅ **Expected:** *Total profit, branch by month* — a row per branch, a column per
     month, this month marked, and the whole period at the end. Narrow the window: the
     table goes and the cards stay.
3. Click an earlier month — in the strip, a table heading, or a bar on any card.
   - ✅ **Expected:** every card, the Total profit and the export count move to that
     month. When the branches paid your own warehouse that month, the sentence under
     the Total profit adds the month's branch figures and the transfer up to **the
     Total profit shown above it** — on the phone too, since each month now carries
     its own reconciliation.
4. Choose *12 months*, then *3 months*.
   - ✅ **Expected:** the strip, the cards and the table follow; nothing from the
     previous range shows for a moment.
5. **Export → Spreadsheet**.
   - ✅ **Expected:** `month-end-2026-10-all-branches.xlsx` (with the month chosen) is
     downloaded and opens in Excel, its headings in the page's language.
6. **Export → Printable summary**.
   - ✅ **Expected:** the browser's print dialog with the month's summary; *Save as
     PDF* saves it. A month with nothing entered says so and offers neither.
7. With an account in two businesses, choose **All businesses**.
   - ✅ **Expected:** the combined Total profit across both, then one card each with
     the same breakdown as the month card.
     Businesses in different currencies show no combined figure, and say why.
8. Sign in as a manager, then a cashier.
   - ✅ **Expected:** the manager sees Reports; the cashier has no Reports in the
     sidebar and `/reports` says *Not part of your role*.
9. Back as the owner, choose **Per day** at the top of Reports.
   - ✅ **Expected:** this month, with ‹ › to step back a month (› stops at this
     month), chips for *All branches* and each branch, the month's Total profit with
     Total business, Variable, Fixed, Daily and Total cost, and a line saying fixed
     costs are shared over the month's days. Below it the days that have happened,
     newest first — on a window narrower than about 900px as rows showing Business,
     Cost and Profit that open to the split on a click; wider, as one *Day by day*
     table with every column, Fixed marked *shared over the month*. Range and
     *All businesses* are not offered in this view.
10. Pick one branch, then step back to last month.
    - ✅ **Expected:** the figures are that branch's; last month lists every day,
      and its days add up to the month card above them. **↻** fetches the month
      again.
11. Click **How costs are grouped** (beside the view chips).
    - ✅ **Expected:** *Kinds of cost*: what Variable, Fixed and Daily mean, the two
      rows that are always one kind (raw material variable, wages fixed), and every
      expense category with Variable / Fixed / Daily chips. Settings has the same
      page as **Kinds of cost**.
12. Move *Gas* from Variable to Daily, go back to Reports.
    - ✅ **Expected:** the chip moves at once and stays after a reload; in Reports
      the gas spending has moved from Variable to Daily and Total cost and Total
      profit have not changed. Move it back.
13. Sign in as the accountant and open Kinds of cost from Reports.
    - ✅ **Expected:** the same page with each category's kind as text and a line
      saying only an owner, admin or manager can change it — no chips.

## Flow W9 — The web app: expenses, logging one, and the branches to ring

The web's version of Flow 17n and the day half of Flow 17t. Sign in as the owner;
the seed data has a month of expenses.

1. **Expenses** in the sidebar.
   - ✅ **Expected:** a tile per branch — the warehouse too, since it has bills of its
     own — with the first chosen and its name in the address (`?branch=`). *Today*:
     **Spent** and **Sold**, the **Difference** under them (red when spending is
     more), a chip per category with its amount, and **Log an expense**. *Entries*:
     each with its note, the time and who logged it, and a red bin. *This month*,
     beside them on a wide window: ‹ › (› stops at this month), the month's total
     and count, the category chips, and the day-by-day list; then the day-end
     **Export** card.
2. Choose another branch, then step back a month.
   - ✅ **Expected:** every figure is that branch's, and the month card shows that
     month; nothing from the branch before flashes up. Reload: the same branch.
3. **Log an expense**.
   - ✅ **Expected:** *Which branch?* with the branch you came from chosen, the
     category chips with a dashed **+ Add a category** at the end, How much, Which
     day (today; a later day cannot be picked), a note, and *Paid with* Cash / UPI /
     Not said, Cash chosen. **Save expense** stays grey until a category and an
     amount above 0 are given; typing `0` says the amount must be more than zero.
4. **+ Add a category**, type `Vegetables`, **Add category**.
   - ✅ **Expected:** the dialog closes and *Vegetables* is in the chips, chosen.
     Escape or **Cancel** closes it without adding anything.
5. Enter `300`, **Save expense**.
   - ✅ **Expected:** back on Expenses for that branch with the entry under *Entries*,
     *Spent* up by ₹300 and Home's **Today's expenses** with it.
6. Click the entry's red bin.
   - ✅ **Expected:** *Remove this expense?* naming the amount and the category.
     **Remove** takes it off the day; **Cancel** leaves it.
7. **Export → Spreadsheet**, then **Printable summary**.
   - ✅ **Expected:** today's day-end workbook for that branch downloads; the summary
     opens the print dialog. Both in the page's language.
8. Open **Home**.
   - ✅ **Expected:** under the recent bills, *Branches with nothing logged*: a phone
     icon, how many branches have logged nothing today, and each of them — each
     opens its own Expenses. Once every branch has logged, the card turns green and
     lists what each spent today, in that branch's currency.
9. Sign in as the accountant, then as a cashier.
   - ✅ **Expected:** the accountant reads every figure, and has the *Branches with
     nothing logged* card, but no **Log an expense**, no bins and no export. The cashier logs for their own shop only — no branch
     question on *Log an expense* — and has no *Branches with nothing logged* card.

## Flow W12 — The web counter: billing, offline, and the receipt printer

The web's version of Flows 17ab–17ad. Use **Chrome or Edge** for the printer steps.
For the offline steps the site must be on `https` or `localhost` — `npm run dev`
does not register the offline worker, so use a production build: `cd web`,
`npm run build`, `npx vite preview` (port 4173), and open `http://localhost:4173`.
Sign in as an owner (or a cashier), the backend running, the migrations applied.

1. **Counter** in the sidebar (or the Billing tile on Home).
   - ✅ **Expected:** a tile per shop (the address gets `?branch=`), *Today's sales*,
     *Bills* and — for whoever may read them — *Today's expenses*, **Log an expense**,
     the menu as tiles with prices, today's bills, and on the right (below about
     900px of page, pinned to the foot of the screen) *Tap a product to start a bill*.
2. Click three tiles, one twice.
   - ✅ **Expected:** the bill lists them with − / + (the bin at one), the total on
     its own row and **Charge ₹…** across the width under it. A tile on the bill shows
     how many. Tab to a tile and press Enter: it adds one. **Ctrl + Enter** opens
     the payment.
3. **Charge**, at a shop with a counter UPI ID.
   - ✅ **Expected:** *Take the payment*, the amount, **UPI** chosen, and a QR card
     *Pay <business>* with the UPI ID, the amount and the QR. Scan it with a phone's
     UPI app: it opens with the exact amount and the shop's code and next token in
     the note. Choose **Cash**: *Customer gave* with *Exact amount* and the next
     notes above the total, and the change once one is picked.
4. **Payment done**.
   - ✅ **Expected:** the token in large type — one more than the last of the day —
     *The bill is saved in this browser*, what happened to the printout, and **Next
     bill**, which has the focus. The bill is at the top of today's list, and Home's
     figures include it.
5. At a shop with no counter UPI ID (Payment QR codes in the app).
   - ✅ **Expected:** no UPI choice; a line says only cash can be taken and where the
     owner adds a UPI ID.
6. Open a bill from the list.
   - ✅ **Expected:** its lines and total, how it was paid, **Print again** (once a
     printer is set up) and **Void this bill**, which asks first. A voided bill stays
     in the list, struck through.
7. **Receipt printer** (top right of the counter, or Settings → Receipt printer).
   Pair the PC201 first in the computer's (or phone's) Bluetooth settings.
   - ✅ **Expected:** *How tokens print* — **Straight to the Bluetooth printer**, and
     **Through the print dialog**. Choose Bluetooth, then **Choose the printer**:
     Chrome's own chooser lists the paired printer; pick it. *A Bluetooth printer is
     chosen in this browser*. Pick the paper (58 mm, 32 characters) and **Print a
     test slip**: the ruler fits one line and the paper is cut. The preview on the
     right is the token as it prints, Gujarati product names as *Item 1*.
8. Back on the counter, take a bill with auto-print on.
   - ✅ **Expected:** the token prints by itself as **Payment done** is pressed, and
     the step says *Token printed*. Switch the printer off and take another: the bill
     is still saved, the step says the printer could not be reached, and **Print
     again** works once it is back on.
9. In Firefox (or Chrome with *Through the print dialog*), take a bill.
   - ✅ **Expected:** the print dialog opens with a slip as wide as the roll, and the
     step says *Sent to the print dialog*. Bluetooth is greyed out in Firefox with the
     reason.
10. DevTools → Network → **Offline**. Take two bills.
    - ✅ **Expected:** tokens and printing work as before; the pill says *Offline — 2
      bills saved in this browser…*, and each bill shows a cloud icon. Turn the
      network back on: within seconds the pill goes and the bills lose their icons.
      Each appears once in the day's sales.
11. Close Chrome entirely with the Wi-Fi off, open it, go to the site's `/counter`.
    - ✅ **Expected:** the counter opens — signed in, with its menu, today's figures
      and the bills not yet sent — and bills can be taken. Wi-Fi on: they are sent.
12. Open the counter in two tabs and take a bill in each, one after the other.
    - ✅ **Expected:** consecutive tokens, never the same one twice; each tab's list
      shows both bills.
13. Close the day in the app, then take a bill here offline and reconnect.
    - ✅ **Expected:** *1 bill needs attention* with the reason, **Reopen that day**
      (for an owner or manager), **Send again**, and **Remove from this browser**,
      which asks first.
14. As a cashier whose business's plan has run out (Flow 17aa's last steps).
    - ✅ **Expected:** the bill panel says the plan has ended and **Charge** is greyed
      out; bills already in this browser stay until it is renewed.
15. Narrow the window to 320px in Gujarati.
    - ✅ **Expected:** two menu tiles across, the bill pinned at the foot with its total
      above a full-width Charge, nothing cut or scrolling sideways; the charge dialog's
      QR still fits.

## Flow W8 — The web app: the team, staff, attendance and payroll

The web's version of Flows 6–9, 12–14, 16 and 17u. Sign in as an owner, the backend
running, with at least two shops, a warehouse and a cashier already on one shop (Flow 17u).

1. **Settings → Team**.
   - ✅ **Expected:** *Invite a member* at the top, pending invites (dashed), then each
     member as a card — the owner as *You* with no remove, an admin or manager
     *Access to all branches*, a cashier's one shop with *Change branch*, a staff
     member's shops each with a ×, removed members faded and struck through.
2. On a staff member's shop, click **×**.
   - ✅ **Expected:** a question naming the person and the shop; *Remove* takes it
     off and the card reloads. Cancel leaves it.
3. On a cashier with no shop (or any cashier), **Change branch**, and pick the shop
   that already has a cashier.
   - ✅ **Expected:** the list says who runs each shop before you choose. Choosing the
     taken one asks *Move the branch?*, naming both people (and the shop the first
     cashier leaves empty). Confirm: both cards change. Cancel: nothing changes.
4. **Invite a member** → an email, **Cashier**, the taken shop → **Send invite**.
   - ✅ **Expected:** *That branch already has a cashier*, naming them; confirming sends the invite and
     Team shows it as pending. Choose **Delivery agent** instead: shops as chips, any
     number. On a Starter business only four roles show, with *Other roles come with
     a higher plan*.
5. **Remove access** on a member.
   - ✅ **Expected:** asks first; the card fades as *Removed*. As a manager, there is
     no remove on the owner or an admin.
6. **Staff** in the sidebar.
   - ✅ **Expected:** the shops as tiles (the warehouse with a box), *Today's
     attendance* for the chosen one with Present / Absent / Unmarked and a row per
     person; the staff list with roles and shops; *Payroll* with the month, its
     payslips and *Run payroll for <month>*.
7. Click a roster row and choose **Half day**.
   - ✅ **Expected:** the chips open under the row; the pill changes to *Half day* and
     the counts move.
8. **Add staff** → type the email of the warehouse desk's account.
   - ✅ **Expected:** *<name> is already on the team as Warehouse*, the role filled in,
     and *Where is their base?* offering only the warehouse (chosen, if there is one).
     A delivery agent's email: no choice, a line saying where the record is filed. A
     new name with no email: every location, none chosen. Save → back on Staff with
     them in the list.
9. Open a staff member.
   - ✅ **Expected:** role, shop and salary; the month cursor; *This month* with six
     figures; every day with its status and, for a punched day, the times and
     *Punched here* (opens a map); *Mark a day*, *Payroll — <month>* and *Past
     payslips*. The date in *Mark a day* stays inside the month on screen.
10. Mark a day **Absent** → **Save**; then **Generate payslip**.
    - ✅ **Expected:** the day appears in the list; a draft payslip joins *Past
      payslips*. The print button opens the print dialog with the payslip in the
      page's language (₹ and Gujarati print correctly); *Save as PDF* saves it.
11. **Edit** → change the salary and the shop → **Save changes**; then
    **Deactivate**.
    - ✅ **Expected:** the detail shows the new figures. Deactivate asks first and
      marks them *Inactive* in the list; *Reactivate* does not ask.
12. Staff → **Run payroll for <month>**.
    - ✅ **Expected:** gross, deductions and net; a row per person who will be paid;
      *skipped* with the reason (no salary set, inactive); this month carries *still in
      progress*. **Generate N payslips** → *Generated N payslips*, and Staff's payroll
      card lists them.
13. Sign in as the cashier (Flow 17u) → Home.
    - ✅ **Expected:** *Today* with the date and **Punch in** at the top. In a browser
      that is allowed location, **Punch in** → *Punched in at <time>*, then **Punch
      out**. At a shop with a geofence, from outside it: the server's sentence with the
      distance. With location blocked for the site: the sentence adds how to allow it.
14. **Staff → My attendance** (or Settings → My attendance) as that cashier, and as the
    owner.
    - ✅ **Expected:** the cashier sees today and the month; the owner — with no staff
      record — is told they are not on the staff, and Home has no punch card.
15. Narrow the window to 320px in Gujarati on Team, Staff, a staff member and the
    payroll run.
    - ✅ **Expected:** one column, nothing cut or scrolling sideways; the payroll totals
      one per row.

## Flow W10 — The web app: raw material, the cart, the desk and deliveries

The web's version of Flows 17f–17k, 17w (the item side), 17x and 17y. The backend
running, with a warehouse, a company-operated (FOCO) shop and a franchise (FM) shop,
a cashier on each, a warehouse desk, a delivery agent and an accountant (Flow 17u),
and one vendor with a WhatsApp number (Flow 17w).

1. As the **warehouse desk**, **Supply** in the sidebar.
   - ✅ **Expected:** *Raw material* with *Add an item* and a *Vendors* card; every
     row has a chevron and the whole row opens it; a withdrawn item is faded and
     says *Withdrawn*.
2. **Add an item** → a name, a unit, a category, no price, *Supplied by* the
   vendor → save. Open it again → **Stop supplying this**.
   - ✅ **Expected:** it is listed under *From <vendor>* with *No price yet*.
     Stopping asks first and marks it withdrawn; *Supply it again* does not ask. On a
     Growth business, *Supplied by* offers only the warehouse and the vendor the item
     already has.
3. As the **FOCO cashier**, **Supply** → **+** on two warehouse items and the
   vendor's item, **+** again on one.
   - ✅ **Expected:** the chip shows the count (2 on the second click — one line, not
     two); the bar at the foot shows the items and the total. An unpriced item has no
     **+**.
4. **Review order** → type `20` into a quantity and press Enter; press **−** on
   another until it goes.
   - ✅ **Expected:** the lines grouped *From the warehouse* and *From <vendor>* with
     subtotals; the totals follow; the line comes off at zero. *Accounts pays for
     this order* and nothing to choose. *This becomes 2 orders…* over **Place order**.
5. **Place order**.
   - ✅ **Expected:** *Supply orders*, with both new orders and no cart.
6. As the **FM cashier**, order from the warehouse only → **Review order** →
   **Pay now**.
   - ✅ **Expected:** one QR with the exact amount; **Place order** stays off until
     **Payment done**; *Not yet* takes the tick back. With a vendor whose UPI ID is not
     set, there is no choice — *Pay on delivery*, and why.
7. As the **desk**, **Desk**.
   - ✅ **Expected:** every branch's orders, oldest first, each naming its branch; no
     carts; the status chips narrow it (`?status=` in the address). Wide, each order is
     one line; narrow, a card.
8. Open a placed warehouse order → **Accept** → **+60 min**; **Mark packed**;
   **Dispatch**.
   - ✅ **Expected:** the question opens under the buttons; an *Expected by* pill
     appears. **Dispatch** lists the agents, the freest chosen, with *Nobody yet*
     last; dispatching names them on the order and in *What has happened*.
9. On another, **Cannot supply** → *Out of stock* → a note → submit.
   - ✅ **Expected:** cancelled, the reason and the note on the history.
10. Open the FOCO shop's vendor order.
    - ✅ **Expected:** **Mark as sent to the vendor** and **Send on WhatsApp**, which
      opens WhatsApp (or its web page) addressed to the vendor with the order written
      out in the page's language.
11. As the **delivery agent**, **Deliveries** → the FM shop's pay-on-delivery run →
    **Mark delivered**.
    - ✅ **Expected:** *Payment on delivery* asks how it was taken: **Cash taken**,
      or **Show the QR** for the cashier to scan and *They have paid — mark
      delivered*; *Not yet* closes it. **Report a delay** takes minutes, a reason and
      a note.
12. As the **FM cashier**, open the vendor order → **Received**.
    - ✅ **Expected:** *Have you paid <vendor> the ₹…?* — cash, UPI now, or *Received
      — I will pay later*, which leaves a **Pay ₹…** on the order.
13. As the **accountant**, open the FM order paid before ordering.
    - ✅ **Expected:** **Received** and **Not received**; *Not received* asks first,
      then the cashier sees **Pay ₹…** on it.
14. As a cashier, open a placed order → **Cancel order**.
    - ✅ **Expected:** asks first; cancelled. Each order page's back link returns to
      the list it was opened from.
15. Narrow the window to 320px in Gujarati on the catalog, the cart, the desk and an
    order with a question open.
    - ✅ **Expected:** one column, nothing cut or scrolling sideways; the cart's total
      and *Place order* stacked at the foot; the order's address before its lines.

## Flow W11 — The web app: paying for supply orders, Payment QR codes and vendors

The web's version of Flows 17v, 17w, 17x (the paying half), 17y, 17z and 17ae. The
backend running, with the orders from Flow W10 — some FOCO orders delivered and
unpaid, an FM order paid before ordering — and the accountant, the desk and the owner.

1. As the **accountant**, Home.
   - ✅ **Expected:** *Payments to make* with the figure ready to pay (or how many are
     on their way); no *Payments to confirm* card — the accountant pays, so both lists
     are behind the one card.
2. Click it: **Payments**, on *To pay*.
   - ✅ **Expected:** three tabs as tiles with their counts. Orders grouped *From the
     warehouse*, then each vendor, each with what has arrived and *Select all that
     arrived*; an order on its way is faded with a clock and cannot be ticked.
3. Tick two warehouse orders, then one of a vendor's.
   - ✅ **Expected:** the bar at the foot shows *2 orders selected* and the exact
     total; ticking the vendor's starts over with that one alone.
4. Select the warehouse's arrived orders → **Pay these**.
   - ✅ **Expected:** one QR for the exact total, the order numbers in its note, and
     *This payment covers* beside it on a wide window. **Payment done** asks first;
     confirm → *Paid ₹… for N orders*, and those orders leave the list. **Back**
     returns to the list with nothing paid.
5. **To confirm** → **Received** on the FM order.
   - ✅ **Expected:** asks *Did the money arrive?*; confirming takes it off the list.
6. **History** → step back a month, then **FM**.
   - ✅ **Expected:** the paid totals for the whole month, the waiting line when a
     payment is unconfirmed, and each order with its payments — who, when and the
     reference. FM hides the accounts tile. Clicking an order opens it; its back link
     returns to History.
7. As the **desk**, Home → *Payments to confirm*.
   - ✅ **Expected:** *Payments* with no tab row — the desk only confirms, and has no
     History.
8. As the **owner**, **Settings → Payment QR codes**.
   - ✅ **Expected:** the counter's UPI ID, then each shop as a row saying whether it
     uses the business's or its own; the warehouse; each vendor with *QR set* / *QR
     not set*. Typing `abc` shows *That is not a UPI ID*; a valid one draws the
     preview QR and enables **Save**. Saving says *Saved* and the line under it names
     you and the time. **Remove UPI ID** asks first.
9. Open a shop's row and give it its own UPI ID.
   - ✅ **Expected:** the row then says *Own UPI ID*; the counter at that shop charges
     to it (Flow W12).
10. As the **desk**, Supply → **Vendors** → **Add vendor**: a name and a WhatsApp
    number → **Add vendor**.
    - ✅ **Expected:** back on Vendors with it listed, *QR not set*. Open it: where its
      payments go is said read-only. **Stop using this vendor** asks first and fades
      it; *Use this vendor again* does not ask. On a Growth business there is no *Add
      vendor*, just the plan's sentence; the vendors already there can be edited.
11. Narrow the window to 320px in Gujarati on Payments (with a selection), its paying
    view, History and Payment QR codes with a row open.
    - ✅ **Expected:** one column, nothing cut or scrolling sideways; the selected
      total and *Pay these* stacked at the foot.

---

## Flow 36 — A business with many branches

**Setup:** a business with more than six branches. The quickest way to get one is
to add branches until there are seven; the behaviour changes at exactly that point,
so six and seven are both worth looking at.

1. **Home → Your branches.**
   - ✅ **Expected:** the first five, then **"+N more"** — and it is now a **link**.
     Open it.
2. **Branches** (also reachable from **Settings → Your branches**).
   - ✅ **Expected:** every branch and warehouse, each with its model or kind, code,
     city and region, and a pin on the ones that enforce a punch-in radius. A
     branch you could not reach before — the sixth, the fiftieth — opens its
     settings from here.
   - ✅ **Expected:** a **search box**, because there are more than six. Type part of
     a branch's name, its code, or its city. Typing a word that starts a name
     ("highway") ranks that branch above one that merely mentions it somewhere.
3. **Any screen that asks which branch** — Counter, Expenses, Add expense, Staff,
   Add staff, Products, Add product, Supply catalog, Upload.
   - ✅ **Expected:** with six or fewer branches, the chips or tiles you have always
     seen. With seven or more, a field showing the chosen branch; tapping it opens
     a list with a box to type in.
   - ✅ **Expected:** the **counter keeps its chips up to twelve**. That is deliberate
     — it is used one-handed, at speed, and sometimes offline.
4. **Team → change a cashier's branch**, and **Invite member** with a STAFF role.
   - ✅ **Expected:** the cashier picker says who holds each branch already, and
     still lets you take it (you are asked to confirm the swap afterwards, as
     before). The staff invite picks **several** branches: the field says how many
     are chosen and lists them underneath, each removable where it sits.
5. **Settings → Business.**
   - ✅ **Expected:** if you belong to more than one business, a dropdown rather
     than a stack of rows.
6. **Sign up / Add business / Add branch / Branch settings.**
   - ✅ **Expected:** country, currency and timezone are **dropdowns you can type
     into**, not text boxes. Search "kolkata" and `Asia/Kolkata` comes up; search
     "Bharat" and India does.
   - ⚠️ This one matters beyond tidiness: a typed timezone the server cannot
     recognise used to become UTC silently, which files a shop's evening sales
     against the day before.
7. **Payment QR codes** with more than six shops or vendors.
   - ✅ **Expected:** the list stays whole — you can still see at a glance which
     have a QR and which do not — with a **filter** above it.

## Flow 37 — The counter, a day at a time

**Setup:** a branch with bills on more than one day. Sign in as the **cashier**.

1. On the **Counter**, above today's figures, there is a day with a chevron each
   side.
   - ✅ **Expected:** it opens on **today**, and the forward chevron is dimmed.
     Tomorrow cannot be reached, by chevron or by the calendar.
2. Step **back one day**.
   - ✅ **Expected:** that day's bills and its three figures, now labelled "that
     day". **No product grid, no cart, no Charge** — a day that is over is a
     record, not a till. A **Back to today** button appears.
   - ✅ **Expected:** the sync pill and anything needing attention stay. They are
     about this device's unsent bills, not about the day on screen.
   - ✅ **Expected:** opening a bill still offers **Print again**.
3. **Tap the date** and pick a day from the calendar.
   - ✅ **Expected:** future days are dimmed and cannot be chosen, and the panel
     opens centred under the date between the two chevrons.
4. On a day the shop did not trade.
   - ✅ **Expected:** "No bills on …", not an error.
5. **Turn the connection off** and step back a day.
   - ✅ **Expected:** it says there is no connection and shows only the bills this
     device still holds for that day — **the totals are hidden**, because a figure
     short of the server's is worse than none. **Today still bills normally.**
6. Return to **today** and take a bill.
   - ✅ **Expected:** the token continues from where today left off. (This is the
     one that would break if a past day's figures were ever saved as today's.)

## Flow 38 — Forgetting a password

**Setup:** the migration applied (`npm run migrate:deploy` in `backend/`) and the
backend restarted. **No email account is needed**: with `SMTP_URL` unset the
backend writes the link to its own log instead, which is enough to walk the whole
flow. Set `PUBLIC_WEB_URL` to where the web app is served, or the link will have
no host.

1. On the web's **sign in** page, under the password, there is now **Forgot
   password?**. The phone's sign-in screen has the same link.
2. Open it and enter the email you sign in with.
   - ✅ **Expected:** "Check your email", naming the address back.
   - ✅ **Expected:** enter an address with **no account** — the same answer. That
     is deliberate: anything else would let a stranger ask who banks here.
3. Look in the **backend's terminal** for the `mail_skipped` line and copy the
   link out of it. Open it in a browser.
4. Choose a new password and save.
   - ✅ **Expected:** "Password changed", and a note that the other devices have
     been signed out.
   - ✅ **Expected:** open the **same link again** — refused as not valid. One use.
   - ✅ **Expected:** ask for a second link, then try the **first** one — refused.
     Asking again retires the previous link.
5. **The old sessions are really gone.** Before resetting, leave the phone app
   signed in to that account. After the reset, pull to refresh on the phone.
   - ✅ **Expected:** it signs out. A session token lasts seven days and cannot be
     withdrawn, so this is the whole point of the change.
6. Sign in with the **new** password, on both.
7. **Settings → Change password.**
   - ✅ **Expected:** the wrong current password is refused by name.
   - ✅ **Expected:** the right one changes it and **leaves you signed in here**,
     while any other device signed in to that account is signed out.
8. Ask for six links in a row from one browser.
   - ✅ **Expected:** the sixth is refused for a few minutes. Asking twice within a
     minute for the same address quietly sends only the first.


## Flow 39 — The calendar (web only)

**Setup:** the **web** app, signed in as the owner. The phone app is not part of
this flow — it opens Android's own picker, which is native and correct there.

1. **Expenses → Add expense**, and tap the **date** field.
   - ✅ **Expected:** KitnaPay's own calendar — the brand blue, the app's
     rounded panel, the app's border. **Not** the browser's grey one.
   - ✅ **Expected:** **today has a ring, the chosen day is filled.** The two are
     never confusable.
   - ✅ **Expected:** days after today are dimmed and do nothing; the forward
     chevron is dimmed once there is no month left to reach.
2. Switch the language to **ગુજરાતી** and open it again.
   - ✅ **Expected:** the month and the weekday headings are in Gujarati. This is
     the whole reason the browser's calendar had to go — it follows the browser's
     language, which has never heard of the one chosen here.
3. **Tap the month caption** ("October 2026").
   - ✅ **Expected:** twelve months, the chevrons now stepping the **year**, and
     months wholly out of range dimmed. The panel does **not** change size.
4. Page back and forth through several months.
   - ✅ **Expected:** the panel is the same height every month — six rows whether
     February needs four or August needs six.
5. With the field focused, move with the **keyboard**: arrows a day and a week,
   PageUp/PageDown a month, Home/End to the ends of the week, Enter to choose.
   - ✅ **Expected:** the focus **stops at the last day offered** — arrowing past
     today does nothing rather than wandering into the dimmed days.
   - ✅ **Expected:** Tab leaves the calendar in one press rather than walking all
     42 days, and Escape closes it and puts focus back on the field.
6. **Scroll so the date field sits near the bottom** of the window, then open it.
   - ✅ **Expected:** the page scrolls just enough to show the whole panel,
     including the **Today** button.
7. **Staff → a staff member → Edit → Hired on.**
   - ✅ **Expected:** a date years back is a few taps through the month chooser,
     not sixty presses of a chevron.
8. **Workweek & holidays → Add holiday.**
   - ✅ **Expected:** here future dates *are* offered — a holiday is planned, not
     recorded. Everywhere else the ceiling is today.
9. At a **320px** window, in Gujarati, open each of the above.
   - ✅ **Expected:** the panel fits with a margin either side, and the page never
     scrolls sideways.
## Known limitations (not bugs — don't file these)

- **A date on the web is picked, not typed.** The browser's own date input let
  you type 20/10/2026; its calendar could not be styled or translated, so it was
  replaced. The month chooser covers the long jumps that made typing worth having.
- **The reset link opens the web app, not the phone app** — even when you asked
  for it on the phone. Set the new password in the browser, then sign in to the
  app with it. Unauthenticated deep links into the app are not built.
- **Email addresses are not verified.** A reset link goes to whatever address the
  account was created with, so a typo at sign-up means the link goes nowhere.
- **A reset link needs `PUBLIC_WEB_URL` and the web app hosted** to be clickable
  from a phone. Until then it only works on the machine running the server.

- **A past day at the counter is read-only.** You can read it and print a bill
  again, but voiding and reopening a day stay on today.
- **A past day needs a connection.** Only today is kept on the device.
- **A busy past day shows its newest 200 bills**, and says so.
- **The Team list shows twenty people at a time**, with a button for the rest.

- **A branch list becomes a dropdown at seven.** Below that it stays as chips or
  rows. If you have six branches and expect a search box, add a seventh.
- **Country, currency and timezone offer a fixed list.** Every ISO country is
  there; currencies and timezones are the ones this product actually serves, and a
  value already saved that is not in the list is still shown and kept. A missing
  currency or zone is one line of data to add.

- **Two phones billing one branch offline can print the same token number.** The
  one that syncs second is renumbered and shows "Printed as 7" — the record and the
  slip still match — but the customer standing there was called by a number
  somebody else also has. One counter, one phone avoids it (requirement 18).
- **An account disabled while its phone is offline keeps billing on that phone**
  until the phone next reaches the server, and is signed out then. Its bills are
  kept, and are sent by whoever signs in next — and recorded as theirs.
- **Bills are recorded as the person whose session sends them**, which is the
  person who took them except in that hand-over case.
- **Uninstalling the app, or Android's "Clear storage", throws away bills that
  were not sent.** They live in the app's own storage until the server has them. On
  the web the same goes for clearing the site's data, or billing in a private
  window — which the counter refuses where the browser keeps nothing at all.
- **The web counter must have been opened online once in that browser** before it
  can open offline: that is when the app and the menu are kept on the computer.
- **Only billing works offline.** Logging an expense, Reports, Home's other cards
  and every other screen still need the server.
- **The printed token is English, and a product name in an Indic script prints as
  its code** (or "Item 2"). The printer's own font has no Indic letters; drawing
  the slip as an image was offered and declined as slower per token.
- **Printing straight to the printer needs the Android app, or Chrome or Edge** on
  an `https` address; Safari and Firefox print through the print dialog, which opens
  for every token (a USB printer set as the default, with Chrome started with
  `--kiosk-printing`, skips it). **A Bluetooth printer serves one device at a
  time**, so a phone and a computer sharing one wait for each other's connection to
  close, about two minutes after the last token.
- **A paid bill cannot be edited** — it is voided and rung up again. Orders taken
  with an app from before the payment step stay editable as they were.


- **A plan can only be changed by hand** (R28, stage 1). There is no way to pay inside the
  app or on the web yet: the owner pays by UPI or bank transfer and the operator runs
  `backend/scripts/set-plan.js`. The Android app deliberately shows no price and no way to
  pay; the web Plan page names whom to write to.
- **A plan change reaches an open app when it is next started** (or the web page
  reloaded), because the plan travels on the session's memberships. The server applies it at once — a feature the new
  plan lacks is refused, with a sentence saying so, before the screen catches up.
- **The 25-logins-per-branch fair use is stated, not enforced.**

- **The web app has every page the mobile app has, but does not pop notifications
  up** — see the next item.
- **A punch from a laptop is only as exact as the browser's location**, which on a
  computer usually comes from Wi-Fi — good to tens of metres, sometimes worse. A
  branch with a tight geofence may refuse a punch from inside it; punch from the
  phone, or widen the radius.
- **The web does not pop notifications up.** They arrive in the bell, which asks the
  server every minute while its tab is in view and at once when the tab comes back.
  Browser push is the last phase of the web plan (W13) and needs a Firebase web app
  registered first.
- **On the web the session lives in the browser's local storage** for seven days,
  like the app's. Signing out on a shared computer matters: closing the tab does
  not sign anybody out.

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
  change. (A deleted account is a disabled one with its details erased, which is
  why another signed-in device ends its session the same way — Flow 21.)
- **Deleting an account has no grace period and no undo.** It happens the moment
  it is confirmed. And there is no way to hand a business to somebody else, so an
  owner whose business still has a team has to remove them before leaving — the
  business cannot outlive its owner's account.
- **The privacy policy and the deletion page are English only**, in every app
  language. Each is a legal statement, and nobody has reviewed a translation of
  one. Until `LEGAL_NAME`, `LEGAL_ADDRESS` and `SUPPORT_EMAIL` are set on the
  server they say the operator's details are being finalised — the company is
  not registered yet.
- **The Android package is still `com.kitnapay.app`.** It becomes
  `com.kitnapay.app`, done at the rebrand; the matching Firebase app is
  registered in Firebase — see `Docs/PLAY_STORE_RELEASE.md` (A1). Nothing a
  person sees shows it, and renaming it later installs as a second app.
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
- **iOS gets no pushes.** KitnaPay ships as an Android development build; iOS needs
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
  third-party library rather than from KitnaPay.
