# Publishing HisabKitab on Google Play

This is the whole route from "the app runs on my phone" to "anyone can install it
from the Play Store". It covers two kinds of work:

- **Part A — code work** that has to happen in this repository first. Google will
  not accept an upload until it is done.
- **Part B — the owner's own steps**: company paperwork, hosting, the Play Console
  account, and the forms Google asks you to fill in.

Part B's first three steps take weeks of waiting on other people, so **start
them now, alongside Part A**, not after it.

Keep this file current like every other document in `Docs/`: when a Part A item
is built, change its status here in the same change.

---

## What stood in the way, and where it stands

Three Google rules blocked an upload. All three are now met in code
(2026-10-07); what is left before the first upload is the package rename (A1)
and Part B.

1. **Target Android 16 (API level 36).** Since 31 August 2026, every new app and
   every update must target it. HisabKitab was on Expo SDK 51 / React Native 0.74,
   which targets API 34. **Done:** upgraded to Expo SDK 54 / React Native 0.81 (A2).
2. **Account deletion.** Any app that lets people sign up must offer it **inside
   the app**, plus a **public web page** where someone can ask for it without the
   app installed. **Done** (A3, A4).
3. **A privacy policy** at a public URL, entered in the Play Console **and**
   reachable from inside the app. **Done** (A4) — it names the company once the
   company exists.

Two more things become permanent the moment the app is published:

- **The package name.** It can never change afterwards. It moves from
  `com.biziq.app` to `com.hisabkitab.app` before the first upload (A1).
- **The API address compiled into the app.** `EXPO_PUBLIC_API_URL` is fixed at
  build time. If the published app points at `buisnessops.onrender.com`, moving
  off Render means shipping an app update and waiting for every phone to install
  it. Point it at your own domain instead (B2), and the server can move hosts
  whenever you like. `npm run build:play` takes the address as an argument, so
  this is a choice made at the moment of building.

---

## Decisions already made

| Question | Decision |
| --- | --- |
| Package name | `com.hisabkitab.app` (Android and iOS) — **deferred** until the new app is registered in Firebase (2026-10-06) |
| Play developer account | **Organization** — so the 12-testers-for-14-days rule for new personal accounts does not apply |
| Where the release build is made | **This laptop, with Gradle** — free, no EAS subscription |
| An owner deletes their account | If any business they own still has other active members, refuse and ask them to remove the team first. If they are alone, delete the account, the business and all its data |
| The company's name, address and email on the legal pages | **Server configuration** (`LEGAL_NAME`, `LEGAL_ADDRESS`, `SUPPORT_EMAIL`), set once the company is registered — no code change then |
| Website | `buisnessops.onrender.com` for now; your own domain is coming |
| Hosting | Moving off Render (options in B2) |
| Architecture | Stay on React Native's old architecture for now — SDK 54 is the last SDK that allows it |

---

## Part A — Code work

| # | Work | Status |
| --- | --- | --- |
| A1 | Rename the package to `com.hisabkitab.app` | **Deferred** — waiting for the new Android app in Firebase (B4) |
| A2 | Upgrade Expo SDK 51 → 54 (targets API 36) | **Done** — needs a fresh dev build and the on-device design pass |
| A3 | Account deletion — in the app and on the API | **Done** |
| A4 | Privacy policy and delete-account web pages | **Done** — operator details pending the company |
| A5 | Firebase credential from an environment variable | **Done** |
| A6 | `npm run build:play` — a safe release build | **Done** |
| A7 | Play Store icon and feature graphic | **Done** |
| A8 | Bring every document up to date | **Done** |

### A1. Rename the package — deferred

What it will take, when B4 is done:

- `frontend/app.json`: `android.package` and `ios.bundleIdentifier` become
  `com.hisabkitab.app`.
- **Not** renamed, on purpose (see *Naming* in `CLAUDE.md`): the EAS `slug`
  `biziq`, the SecureStore keys `biziq_*`, the npm package name.
- The new `google-services.json` from Firebase replaces the old one. Without it
  the Android build fails outright — Google's Gradle plugin finds no entry for the
  new package — and `npm run build:play` refuses before Gradle starts.
- `android/` regenerated (`expo prebuild --clean`, then restore the machine-local
  files `CLAUDE.md` lists).
- The old `com.biziq.app` build on test phones becomes a separate app. Uninstall
  it.
- `CLAUDE.md`'s *Naming* section: the package stops being a name that "keeps the
  old name on purpose" and becomes a published, permanent one.

### A2. Expo SDK 51 → 54 — done

- **Expo SDK 54, React Native 0.81, React 19.1, TypeScript 5.9**, and the app
  still targets **API 36**. Node 20.19.4 or newer is needed.
- **The old architecture stays** (`"newArchEnabled": false`). SDK 54 is the last
  SDK that allows it, so the next upgrade — which Google's 2027 target will force
  — includes the New Architecture. `react-native-reanimated` stays on 3.19
  (4.x needs the New Architecture); `expo.install.exclude` in `package.json`
  keeps `npx expo install --fix` from "fixing" it.
- **React Navigation 6 → 7**, because SDK 54's `react-native-screens` 4 only
  supports native-stack 7. The one behaviour that changed for this app: `navigate`
  no longer goes back to a screen already in the stack, so Sign-up → Login and a
  notification tap pass `{ pop: true }`.
- **Dependency overrides re-checked** (`CLAUDE.md` → *Dependency overrides*).
  Seven are gone, including `tar` and its patch, because SDK 54 asks for patched
  versions itself. `image-size` stays, with its patch regenerated for the metro
  that `@expo/metro` pins. `npm audit` went from 58 findings to 29, and all 29
  come from three packages with no fixed release yet — all build tooling, none in
  the app.
- **The launch splash** is now Expo's own `expo-splash-screen` plugin; the custom
  Android 12 splash plugin had to go, because SDK 52+ builds the splash theme
  differently and it would have broken it. The app's own animated splash draws the
  mark at the same 140dp the system splash does, so the hand-over does not jump.
- **The release-signing plugin now fails loudly** when React Native's template
  changes, instead of silently signing a "release" with the debug key.
- **Edge-to-edge**: on Android 16 every app draws under the status and navigation
  bars, with no opt-out. Twelve screens that are a tab for one role and a modal
  for another now take their safe-area edges from `useScreenEdges()`, so as a
  modal their last button stays above the navigation bar. Edge-to-edge also stops
  Android shrinking the window for the keyboard, so every form's
  `KeyboardAvoidingView` now works on Android too (it was iOS-only), and the two
  forms that had none — a staff member's deductions, the holiday name — gained
  one. `expo-system-ui` was added so the app's light theme reaches native dialogs
  on a phone in dark mode.
- `expo-file-system` imports moved to `expo-file-system/legacy`; the notification
  handler uses `shouldShowBanner` / `shouldShowList`; `@expo/vector-icons`,
  `expo-font` and `babel-preset-expo` are direct dependencies (npm had put an
  SDK 57 `expo-font` at the top level, and the Babel preset only under `expo`);
  `expo-build-properties` is gone (nothing used it once cleartext traffic was no
  longer forced on).

**Still to do, on a phone:** the design pass for edge-to-edge —
`Docs/TESTING_GUIDE.md`, Flow 0 and Flow 10 — with both gesture and 3-button
navigation. Nothing automated can see it.

### A3. Account deletion — done

**On the API** — `POST /api/auth/me/delete` with `{ password }`, behind
`requireAuth` and the login rate limiter. In one transaction
(`services/account.service.js`):

1. A wrong password is refused (`ACCOUNT_DELETE_PASSWORD_INCORRECT`).
2. For every business the person **owns**: if anyone else is still an active
   member, refuse (`ACCOUNT_DELETE_OWNER_HAS_TEAM`, naming the business). Nothing
   is changed. The business row is locked first, so nobody can join it between
   the check and the delete.
3. Businesses they own alone are deleted, with all their data.
4. Their memberships in other businesses are ended (`REVOKED`), and their link to
   any staff record is cleared. The employer keeps its own attendance and payslip
   records, because those are the employer's legal records, not the user's
   account.
5. Their device tokens, notifications and notification settings are deleted.
6. The user row is **anonymised, not deleted** — name and phone cleared, email
   `deleted+<id>@deleted.invalid`, password replaced, status `DISABLED`, which
   `requireAuth` refuses on the very next request. The row has to stay because
   other businesses' audit records point at the person's membership. Freeing the
   email means they can sign up again later.

`tests/account-deletion.test.js` covers a sole owner (with an expense, a vendor
order, a counter order and attendance in the business), an owner with a team, a
staff member, and a wrong or missing password.

**In the app** — **Settings → Delete account** (a quiet link under Log out) opens
a screen that lists what goes and what stays, suggests exporting first, asks for
the password and confirms through `utils/confirm.ts`. **Settings → Privacy
policy**, and a line under the sign-up button, open the policy. A removed member
whose account was deleted reads **Deleted account** on the Team screen. Every
string is in all four languages.

### A4. Privacy policy and delete-account pages — done

Served by the backend at `/privacy` and `/delete-account`, outside `/api`
(`backend/src/legal/`). The app finds them by taking `/api` off its own API
address, so when the API moves to your domain the pages move with it.

The policy describes what the code actually stores — the same facts as the Data
safety table in B8. It is English, because it is a legal statement.

**The company's details come from the server's environment:** `LEGAL_NAME`,
`LEGAL_ADDRESS` (lines separated with `\n`) and `SUPPORT_EMAIL`. Until all three
are set, both pages say *Operator details are being finalised*, and a production
server warns at every start. When the company is registered, set them on the
host and restart — no code changes, no app update.

Before publishing, read both pages once yourself: the deletion page promises to
handle an emailed request **within 30 days** — make sure that is a promise you
can keep, or change it in `legal/pages.js`.

### A5. Firebase credential from an environment variable — done

`FIREBASE_SERVICE_ACCOUNT` can now be the JSON itself as well as a path. Render
supports secret files; Railway and most other hosts do not. A value that does not
parse is reported without quoting it, because it is a private key.

### A6. `npm run build:play` — done

```
cd frontend
npm run build:play -- --api-url https://api.yourdomain.in/api
```

It refuses to start when:

- the API address is missing, not `https://`, a local address, or does not end
  in `/api`,
- `keystore.properties`, or the keystore it names, is missing (the build would
  quietly be signed with the debug key),
- `google-services.json` belongs to a different package (the file from before
  the rename),
- `app.json` has no `android.versionCode`.

It then builds for `armeabi-v7a, arm64-v8a, x86_64` without touching the
arm64-only setting everyday debug builds use, and checks the result: the bundle
contains the API address and **not** `localhost`, the signature is **not** the
Android debug certificate, and native code for all three architectures is there.

Also part of A6: `usesCleartextTraffic` is no longer forced on, so a release
build talks https only (debug builds still reach `http://localhost` through their
own manifest), and `android.versionCode` is in `app.json` at `1` — raise it
before every upload after the first.

### A7. Store graphics — done

`scripts/generate-brand-assets.js` renders, into `frontend/store-listing/`, from
the same drawing as the launcher icon:

- `play-icon-512.png` — the **512 × 512** Play icon,
- `feature-graphic.png` — the **1024 × 500** feature graphic: the mark and the
  two-colour wordmark, with the name read from `src/constants/brand.ts`.

### A8. Documents — done

| Document | What changed |
| --- | --- |
| `PROJECT_FLOW.md` | Phase 7a, store launch readiness, with status |
| `TESTING_GUIDE.md` | Rebuild after SDK 54; Flow 0's splash; edge-to-edge checks; Flow 20 (privacy policy) and Flow 21 (delete your account); new known limitations |
| `DEPLOYMENT.md` | Firebase as inline JSON, the `LEGAL_*` variables, the public pages, `build:play` |
| `database-table.md` | What a deleted account leaves behind |
| `FIREBASE_SETUP.md` | Pasting the credential into a host's environment |
| `CLAUDE.md` | SDK 54, the splash, edge-to-edge, the overrides, the legal pages |

Account deletion is recorded in `PROJECT_FLOW.md` (Phase 7a) rather than
`REQUIREMENTS.md`, which is the Branch Operations track's.

---

## Part B — Your steps

### B1. Paperwork — start today

These are the slow ones.

- [ ] **Company registration.** An organization account needs a legal entity:
      Pvt Ltd, LLP, partnership, or a proprietorship with GST registration.
- [ ] **D-U-N-S number.** Free from Dun & Bradstreet India. It can take up to
      about 30 days. Check first whether the company already has one.
- [ ] **Buy a domain** (roughly ₹700–1,000 a year), and set up an email address
      on it, such as `support@yourdomain.in`. Google asks organization accounts
      for a website.

### B2. Hosting

| Option | Cost | Good | Watch out |
| --- | --- | --- | --- |
| **Railway Hobby** (recommended) | about $5–8 a month | App and Postgres in one place; the existing `Procfile`/`Dockerfile` work as they are; migrations run as a pre-deploy step | Nearest region is Singapore, not Mumbai (about 60 ms away, which is fine) |
| DigitalOcean Bangalore or AWS Lightsail Mumbai (a VPS) | about $5–6 a month | Runs in India; fixed cost | You run backups and security updates yourself |
| Supabase Postgres (Mumbai, free) plus a separate app host | Database free up to 500 MB | Cheapest to start | A free project pauses when it goes unused |

Whichever you pick:

- [ ] Set up the server as `Docs/DEPLOYMENT.md` describes:
  - `NODE_ENV=production`
  - a **new** `JWT_SECRET` (the command is in that document)
  - `DATABASE_URL`
  - `FIREBASE_SERVICE_ACCOUNT` — on a host without secret files, paste the
    file's JSON in as the value
  - once the company exists: `LEGAL_NAME`, `LEGAL_ADDRESS`, `SUPPORT_EMAIL`, so
    `/privacy` and `/delete-account` name it (A4)
- [ ] **Turn on database backups.** This is the business's books.
- [ ] Point a subdomain at it, such as **`api.yourdomain.in`**. This is the
      address that goes into the app. Never a `*.onrender.com` or
      `*.railway.app` address.
- [ ] If the data on Render must be kept: take a `pg_dump` from Render and
      `pg_restore` it into the new database.
- [ ] Check `https://api.yourdomain.in/api/health` answers
      `{ "status": "ok", "database": "ok" }`.

### B3. The signing key

- [ ] Check the keystore that `frontend/keystore.properties` points at:
      `keytool -list -v -keystore <file>`. This is your **upload key**.
- [ ] **Back up the `.jks` file and its passwords in two places**, for example
      an encrypted cloud folder and an offline drive.
- [ ] When the Play Console offers **Play App Signing**, keep it on. Google then
      holds the real signing key, and a lost upload key can be reset through
      Google support instead of ending the app.

### B4. Firebase

This needs no company and takes five minutes, and it is what unblocks A1.

- [ ] In the Firebase console, in the **same** project, add an Android app with
      package `com.hisabkitab.app`.
- [ ] Download its `google-services.json` into `frontend/`, replacing the old
      one — then ask for A1. The old file must not be replaced before A1 is
      done: until then the app's package is still `com.biziq.app`, and the build
      looks the old one up.
- [ ] Nothing changes on the backend — `firebase-service-account.json` belongs
      to the project, not to the app.

### B5. Play Console account

- [ ] Sign up at play.google.com/console as an **Organization**, using:
  - the $25 one-time fee,
  - the D-U-N-S number,
  - the website,
  - verified phone and email.
- [ ] Complete the identity verification for the account holder.
- [ ] Note that the Play listing shows the organization's name, address, phone
      and email publicly.

### B6. Build the bundle

- [ ] Raise `android.versionCode` in `frontend/app.json` if this is not the first
      upload.
- [ ] Run:
      `cd frontend && npm run build:play -- --api-url https://api.yourdomain.in/api`
- [ ] The file to upload is
      `frontend/android/app/build/outputs/bundle/release/app-release.aab`.

### B7. Create the app and fill in "App content"

- [ ] **Create app:** name "HisabKitab", type App, Free.
- [ ] **Privacy policy:** `https://api.yourdomain.in/privacy`
- [ ] **App access.** Everything is behind a login, so the reviewer needs a
      working account:
  - On the **production** server, create a demo owner account with a demo
    business, one or two branches and a month of sample sales.
  - Give its email and password here, with a line on what to try.
- [ ] **Ads:** No.
- [ ] **Content rating.** Pick the category for utility and productivity apps.
      Answer honestly. If you are asked whether the app shares a user's location
      with other users, the answer is **Yes**: a manager can see where a staff
      member punched in.
- [ ] **Target audience:** 18 and over.
- [ ] **Government app:** No.
- [ ] **Financial features.** Read the options carefully. The app never handles
      money itself: a UPI QR code only hands over to the user's own UPI app.
- [ ] **Data safety:** see the next section.

### B8. Data safety answers

These come from what the code actually stores. Re-check them whenever a feature
starts collecting something new.

| Data type (Google's name) | Collected? | Why | Notes |
| --- | --- | --- | --- |
| Location → Approximate and Precise | Yes | App functionality | Punch-in and punch-out position, stored with the attendance day; branch coordinates. Foreground only, never in the background |
| Personal info → Name | Yes | App functionality, Account management | |
| Personal info → Email address | Yes | Account management | The login |
| Personal info → Phone number | Yes | App functionality | Optional on the account; staff phone numbers on staff records |
| Financial info → Other financial info | Yes | App functionality | Sales, expenses, salaries and payroll that the business enters or uploads; UPI IDs |
| Files and docs | Yes, **processed ephemerally** | App functionality | Uploaded CSV or Excel files are read in memory and not kept. Their rows are stored as sales (already covered above) |
| Device or other IDs | Yes | App functionality | The push notification token |
| Photos, audio, contacts, messages, health, browsing history, crash logs, analytics | No | | |

- **Is data shared with third parties?** No. Firebase (for push) and the hosting
  company process data on your behalf. Google's form does not count that as
  sharing.
- **Encrypted in transit?** Yes. The API is HTTPS only.
- **Can users ask for deletion?** Yes — in the app, and at
  `https://api.yourdomain.in/delete-account`.

### B9. Store listing

- [ ] **App name:** HisabKitab (up to 30 characters).
- [ ] **Short description:** up to 80 characters.
- [ ] **Full description:** up to 4,000 characters.
- [ ] **App icon:** `frontend/store-listing/play-icon-512.png` (A7).
- [ ] **Feature graphic:** `frontend/store-listing/feature-graphic.png` (A7).
- [ ] **Phone screenshots:** at least 2, at most 8. Take them on a phone with
      the demo data: `adb exec-out screencap -p > shot.png`.
- [ ] **Category:** Business.
- [ ] **Contact email:** the support address.
- [ ] Optional: Hindi, Gujarati and Marathi translations of the listing.
- [ ] **Countries:** India.

### B10. Test, then go live

- [ ] Upload the `.aab` to the **Internal testing** track and add yourself as a
      tester.
- [ ] Install it **from the Play Store** on your phone and walk through
      `Docs/TESTING_GUIDE.md`, including:
  - sign up,
  - a punch-in,
  - a push notification arriving,
  - deleting a throwaway account.
- [ ] Promote the release to **Production** and send it for review. A first
      review usually takes a few days, and a new account can take longer.

### B11. Every update after launch

- [ ] Raise `android.versionCode`.
- [ ] Run `npm run build:play` with the same API URL.
- [ ] Upload the new `.aab` and send it for review.

---

## Before calling it live

These do not block the upload, but they matter once strangers use the app.
`Docs/DEPLOYMENT.md` → *Before you call it live* has the details.

- **There is no password reset.** Someone who forgets their password has a dead
  account. This is the strongest candidate for the next task after Part A. It
  needs an email channel, because push cannot reach someone who cannot sign in.
- **There is no error tracking.** Logs are the only record of failures.
- **Rate limiting covers the login and sign-up routes only.**
- **Next year it happens again.** Google raises the required Android version
  every August. In 2027 that will need Expo SDK 56 or later, and with it the
  New Architecture, since SDK 54 is the last to support the old one. Plan for it
  well before August.

---

## How to check Part A is really done

Checked on 2026-10-07/10, on this machine:

- ✅ `cd backend && npm test` — 404 tests, 23 suites, including the new
  `account-deletion.test.js` (a sole owner, an owner with a team, a staff member,
  a wrong or missing password), `legal.test.js`, and the Firebase-credential
  cases in `notification.test.js`.
- ✅ In `frontend/`, every gate: `npm run lint` (tsc), `lint:i18n`, `lint:errors`,
  `lint:permissions`, `lint:backend-i18n`, `lint:notification-prose`,
  `lint:patched-deps`.
- ✅ `npx expo config --type public`, `npx expo-doctor` (18/18), and
  `npx expo export --platform android` (a 5.35 MB production bundle).
- ✅ The regenerated `android/` project: a splash theme whose parent is
  `Theme.SplashScreen`, the release signing block present, the same
  `debug.keystore` as before (so the new build installs over the old one), and
  cleartext traffic allowed only in the debug manifests.
- ✅ `./gradlew assembleDebug` — `targetSdkVersion 36`, a 61 MB debug APK with
  `arm64-v8a` only. The first build after the upgrade came out at 145 MB with all
  four ABIs: React Native 0.81 applies `reactNativeArchitectures` only under the
  New Architecture, so `plugins/withAndroidArchitectures.js` now writes
  `abiFilters` into the app itself (see CLAUDE.md, *Native Android builds*).
- ✅ `npm run build:play -- --api-url https://buisnessops.onrender.com/api` — a
  41.2 MB `.aab` whose bundle calls that address and never `localhost`, signed by
  the upload key and not the debug one, with `armeabi-v7a`, `arm64-v8a` and
  `x86_64` and nothing else. This was a check of the script, not a build to upload:
  it still has the old package, and the API is still on `onrender.com`.
- **Still to do, on a phone** (you start the dev servers, as always):
  - every flow in `TESTING_GUIDE.md` works,
  - every screen looks right edge-to-edge, with gesture and 3-button navigation,
    including forms with the keyboard open (Flow 10),
  - the splash hands over without the mark jumping (Flow 0),
  - push arrives,
  - the privacy link opens (Flow 20),
  - account deletion behaves correctly in every case (Flow 21).

To repeat the package-level checks after A1, the regenerated `android/` project
should also show package `com.hisabkitab.app`.

---

## References

- [Target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Data safety form](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Expo SDK 54 upgrade guide](https://expo.dev/blog/expo-sdk-upgrade-guide)
- [React Native 0.81 release notes](https://reactnative.dev/blog/2025/08/12/react-native-0.81)
