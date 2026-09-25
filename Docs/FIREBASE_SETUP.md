# Firebase setup — push notifications for BizIQ

Everything the app needs from Firebase, in the order it has to be done. Nothing
in the codebase works until steps 1–5 are finished, because two files that are
**deliberately not in git** have to exist on your machine first.

You need about fifteen minutes and a Google account. It is free — Firebase Cloud
Messaging has no paid tier for what this uses.

## What BizIQ actually uses Firebase for

**Cloud Messaging (FCM), and nothing else.** No Firebase Auth, no Firestore, no
Analytics, no Crashlytics. BizIQ has its own accounts, its own Postgres and its
own API; Firebase is only the pipe that wakes a phone up.

That matters when you are clicking through the console: ignore every product it
offers you. If a step below does not mention it, skip it.

---

## Step 1 — Create the Firebase project

1. Go to <https://console.firebase.google.com/> and sign in.
2. **Create a project**.
3. Name it `BizIQ`. The console will suggest a project ID like `biziq-4f2c1` —
   that is fine, it only has to be globally unique.
4. **Google Analytics: turn it off.** It asks on the second screen. BizIQ does
   not use it, and leaving it on adds a consent surface and a second config file
   for no benefit.
5. **Create project**, then **Continue** when it finishes.

## Step 2 — Register the Android app

This is the step that produces `google-services.json`.

1. On the project overview, click the **Android** icon ("Add app").
2. **Android package name** — type exactly:

   ```
   com.biziq.app
   ```

   **This must match character for character.** It is `expo.android.package` in
   `frontend/app.json`. A mismatch is the single most common cause of "the token
   registers but no notification ever arrives", and it fails silently — FCM
   accepts the token and drops every message sent to it.
3. **App nickname** — anything, e.g. `BizIQ Android`.
4. **Debug signing certificate SHA-1** — **leave it blank.** It is only needed
   for Google Sign-In and Dynamic Links, neither of which this app uses.
5. **Register app**.
6. **Download `google-services.json`.** Put it at:

   ```
   frontend/google-services.json
   ```

   Exactly there — beside `app.json`, not inside `android/`. The Expo config
   plugin reads it from that path and copies it into the native project on every
   prebuild. `android/` is generated and gitignored, so a copy placed there is
   destroyed the next time anyone runs prebuild.
7. Skip the remaining screens ("Add Firebase SDK", "Next", "Continue to
   console"). The Expo plugin does all of that wiring; you do not add the Gradle
   lines the console shows you.

> **iOS:** not set up, and not needed yet — BizIQ currently ships as an Android
> development build. When iOS happens it needs its own app registration, a
> `GoogleService-Info.plist`, and an APNs key uploaded to Firebase.

## Step 3 — Create the service account key (the server's half)

The app receives pushes; the **backend sends** them, and it needs its own
credentials for that.

1. In the Firebase console, click the **gear icon** → **Project settings**.
2. Open the **Service accounts** tab.
3. **Generate new private key** → **Generate key**. A `.json` file downloads.
4. Put it at:

   ```
   backend/firebase-service-account.json
   ```

5. **This file is a credential. Treat it like a password.** It is already in
   `.gitignore` — do not commit it, do not paste it into a chat or an issue, and
   do not put it in the frontend. Anyone holding it can send notifications to
   every BizIQ user.

   If it ever leaks, come back to this tab, delete the key, and generate a new
   one. That revokes the old one immediately.

## Step 4 — Point the backend at it

Add one line to `backend/.env`:

```
FIREBASE_SERVICE_ACCOUNT=./firebase-service-account.json
```

The path is relative to `backend/`. An absolute path works too.

**If this variable is absent, the backend starts normally and simply does not
send pushes.** That is deliberate: everything else — logging an expense, marking
attendance, dispatching an order — has to keep working on a machine that has no
Firebase set up, including CI. You will see one line at startup:

```
[push] FIREBASE_SERVICE_ACCOUNT not set — notifications are recorded but not sent
```

Notifications are still **written to the database** and still appear in the
app's notification centre. Only the push itself is skipped. So if you want to
see the feature work without Firebase at all, you can — you just have to open
the app to see them.

## Step 5 — Rebuild the app

`google-services.json` is read at **build** time, not at runtime. An APK built
before you added it has no Firebase config compiled in, and no amount of
restarting will help — the same trap as `EXPO_PUBLIC_API_URL`.

```bash
cd frontend
npx expo prebuild          # NOT --clean, see the note below
npm run android
```

> **Use plain `expo prebuild`.** `--clean` deletes machine-local files that then
> have to be restored by hand: `android/local.properties`, the JDK 17 pin in
> `android/gradle.properties`, `android/.idea/gradle.xml` and
> `android/.gradle/config.properties`. `CLAUDE.md` has the full list.

---

## Step 6 — Check it works

1. Open the app and log in. Accept the notification permission prompt when it
   appears.
2. **Settings → Notifications** should show **"This device will receive
   notifications"**. If it says the device is not registered, the token never
   reached the server — see troubleshooting below.
3. Get a second account involved, because most notifications are about somebody
   else doing something:
   - As an **owner**, mark a staff member absent. **That staff member's** phone
     gets "You were marked absent" (requirement 2).
   - As a **cashier**, place a supply order. The **warehouse** user's phone gets
     "New order from <branch>".
   - As the **warehouse**, accept it and post a delay. The **cashier's** phone
     gets both.
4. Tap one. It should open the screen it is about — not just the app.
5. Change the app language and look at the notification centre. **The list
   re-renders in the new language**, because the app stores a code and its
   values rather than a sentence. Already-delivered Android notifications keep
   the language they arrived in, which is correct: they were written at the time
   they were sent.

---

## Troubleshooting

**"This device will not receive notifications" in Settings.**
Notification permission was denied. Android only asks once — after that, the
prompt never reappears and the app cannot re-trigger it. Fix it in the OS:
long-press the app icon → **App info** → **Notifications** → turn them on. Then
reopen BizIQ, which re-registers on every launch.

**Permission granted, but nothing ever arrives.**
In order of likelihood:

1. **The APK predates `google-services.json`.** Rebuild (step 5). This is the
   common one.
2. **The package name does not match.** `com.biziq.app` in the Firebase console
   must equal `expo.android.package` in `frontend/app.json`.
3. **The backend has no service account.** Look for the `[push]` line in its
   startup output.
4. **The device cannot reach the API**, so the token never got registered. Log
   in again and watch the backend log for `POST /api/notifications/device-token`.

**Nothing arrives on an emulator.** An emulator image **without Google Play
Services** cannot receive FCM at all — there is nothing to deliver the message.
Use an image whose name says "Google Play", or a real phone.

**Notifications arrive but are silent.** Android 13+ gives each app's channels
their own settings. BizIQ creates one channel, "Updates", the first time the app
runs. Check **App info → Notifications → Updates**.

**They stop arriving after a few days on a Xiaomi/Oppo/Vivo/OnePlus phone.**
These vendors kill background apps aggressively. In **App info → Battery**,
choose **Unrestricted** / **No restrictions**. This is a known Android
fragmentation problem, not a BizIQ bug — <https://dontkillmyapp.com> documents
it per manufacturer.

---

## What is in git and what is not

| File | In git? | Why |
|---|---|---|
| `frontend/google-services.json` | **No** | Identifies your Firebase project. Not a secret in the way the service account is, but it belongs to your project rather than to the code |
| `backend/firebase-service-account.json` | **No** | A credential. Anyone holding it can push to every user |
| `FIREBASE_SERVICE_ACCOUNT` in `backend/.env` | **No** | `.env` has never been in git |
| The Expo plugin entry in `app.json` | Yes | It is configuration, not credentials |

A fresh clone therefore needs steps 2, 3 and 4 repeated — or nothing at all, if
that machine is only running tests and clicking through the app, since the
backend degrades to recording notifications without sending them.
