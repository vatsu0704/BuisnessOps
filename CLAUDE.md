# CLAUDE.md

---

## What this project is

**BizIQ** is a multi-tenant AI business intelligence platform for restaurant,
retail and franchise owners. The core loop: an owner asks a question in plain
language ("What were October sales versus last year?") and receives an answer
computed from their own sales data, with the underlying numbers traceable.

### Project documents

Every project document lives in `Docs/`. They carry context the code alone
does not — read them before planning feature work rather than inferring scope
from code.

| Path | Contents |
| --- | --- |
| `Docs/PROJECT_FLOW.md` | The phased delivery plan and the current status of each phase |
| `Docs/database-table.md` | Data model notes |
| `Docs/TESTING_GUIDE.md` | Click-by-click manual walkthrough of every user-facing flow that is built, in the order they have to be followed |

A new document of this kind belongs in `Docs/` too. Only `CLAUDE.md` and
`README.md` stay at the repository root, because Claude Code loads the rule book
from the root and GitHub renders the root README as the repository's front page.

**Keep all three current as functionality is added.** A feature is not finished
until the documents describing it match the code:

- a new or re-scoped phase, or a phase whose status changes →
  `Docs/PROJECT_FLOW.md`
- a new table, column, relation or enum → `Docs/database-table.md`
- a new user-facing flow, or a change to the steps, the expected result, or the
  setup an existing flow assumes → `Docs/TESTING_GUIDE.md`. Its "Known limitations"
  list is part of this: move an item out of it when the thing gets built, and
  add one when something ships deliberately incomplete.

Update them in the same change as the code, not as a follow-up.

### Naming

The product is **BizIQ**; the Android package is `com.biziq.app`. It was renamed
from an earlier name, "BuisnessOps". That old name deliberately survives where
changing it would be disruptive — the repository folder, the Postgres database
name `buisnessops`, and git history. Those are not typos to fix.

## Layout

| Path | Contents |
| --- | --- |
| `backend/` | Express API in **JavaScript** (not TypeScript), Prisma + PostgreSQL |
| `frontend/` | Expo / React Native app in TypeScript |
| `Docs/` | Project documents — see *Project documents* above |
| `postman/` | API collection covering auth and data ingestion |
| `.github/workflows/ci.yml` | Backend tests, migration check, frontend type-check |

## Commands

Backend (from `backend/`, serves on port 4000):

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the API with nodemon |
| `npm test` | Jest test suite |
| `npm run prisma:migrate` | Create/apply a dev migration |
| `npm run prisma:studio` | Browse the database |

Frontend (from `frontend/`):

| Command | Purpose |
| --- | --- |
| `npm run lint` | Type-check (`tsc --noEmit`) — the type gate, despite the name |
| `npm start` | Metro for an existing dev build |
| `npm run android` | Build the native app and install it on a connected device |
| `npm run web` | Browser preview, useful for quick UI checks |

## Running the app

Vatsal runs both dev servers himself, in his own terminal — backend's `npm run
dev` and frontend's `npm run android` / Metro. **Never start or restart either
one.** If a task mechanically requires a currently-running one to stop first
(e.g. releasing the Windows file lock on the Prisma query engine DLL so
`prisma generate` can complete), stop it, say so plainly, and leave it
stopped for him to restart — don't start it back up yourself.

## Backend conventions

Requests flow `routes/` → `controllers/` → `services/` → Prisma, with
`validations/` and `middleware/` handling input shape and auth. Keep that
layering; do not query Prisma directly from a controller.

Every table holding business data carries a `businessId`. Resolve the tenant
from the authenticated session, never from client-supplied input, so cross-tenant
access is impossible by construction rather than by convention.

## Frontend conventions

- `@/` resolves to `frontend/src` (configured in both `tsconfig.json` and `babel.config.js`).
- Design tokens live in `src/theme/index.ts` (colors, spacing, radius, typography,
  shadow) and motion tokens in `src/theme/motion.ts` (durations, springs, stagger).
  Use them instead of hardcoding values, so screens stay visually consistent.
- Animations use `react-native-reanimated` and run on the UI thread. Prefer
  transform-based animation over animating layout properties.
- Haptics go through `src/utils/haptics.ts`, which no-ops on web — call that
  wrapper rather than `expo-haptics` directly.
- Shared UI lives in `src/components` (`FormInput`, `PrimaryButton`,
  `PressableScale`, `BrandMark`, `AnimatedSplash`, `ScreenBackground`). Reuse these
  before writing a new variant.
- Brand artwork in `frontend/assets/` is generated from vector geometry rather
  than hand-drawn. `BrandMark.tsx` deliberately mirrors the icon's proportions —
  change both together or the in-app logo and the launcher icon will drift apart.

## Translations

The app ships in English, Hindi, Gujarati and Marathi. **Never hardcode a
user-facing string** — render it with `t('section.key')` from
`useTranslation()`.

- Strings live in `src/i18n/locales/{en,hi,gu,mr}.json`. `en.json` is the source of
  truth: `src/i18n/i18next.d.ts` types `t()` against it, so a key missing from
  `en.json` is a compile error rather than text that renders as the raw key.
- Adding a language means adding a JSON file and one row in `LANGUAGES`
  (`src/i18n/index.ts`). Nothing else in the app changes.
- Language resolution order: an explicit choice stored on the device, then the
  account's `preferredLocale`, then the device language, then English. Changing it
  persists locally and PATCHes `/auth/me/locale` so other devices follow.
- i18next runs with `compatibilityJSON: 'v3'` because React Native has no
  dependable `Intl.PluralRules`; plurals therefore use `key` / `key_plural`.
- The Hindi, Gujarati and Marathi files were written without a native-speaker
  review. Treat wording fixes from a speaker as expected, not as defects.

**This applies to the backend too, which does not translate and must not try.**
It cannot know the reader's language — the choice lives on the device and may
differ from the account's `preferredLocale`. So never write a message as prose
at the point you throw it:

- Add a code to `backend/src/errors/catalog.js` and throw `fail('CODE', status)`
  (or `fieldError('CODE', field, params)` from a validator). The English in the
  catalog is the *fallback* — what curl, the logs, and an app too old to know
  the code will show — not the translation.
- Add the wording to `errors.api.<CODE>` or `errors.validation.<CODE>` in all
  four locale files. `npm run lint:errors` (in CI) fails if you forget; `tsc`
  cannot catch it, because the key is assembled at runtime.
- Anything that varies travels in `params`, never baked into the sentence — a
  translated sentence puts its numbers in a different place.

## Native Android builds

The app ships as a **development build** (`expo-dev-client`), not Expo Go.

- `android/` and `ios/` are generated by `expo prebuild` and are gitignored.
  **Never hand-edit files inside them** — edits are silently discarded on the next
  prebuild. Express native changes as Expo config plugins in `app.json`; see
  `frontend/plugins/withAndroid12SplashScreen.js` for the pattern.
- React Native 0.74's Gradle cannot run on JDK 24/25. JDK 17 is pinned per-project
  via `org.gradle.java.home` in `android/gradle.properties`, so the machine's global
  `JAVA_HOME` can stay on a newer JDK for other work. Do not change the global one.
- `expo prebuild --clean` deletes machine-local files that must then be restored:
  `android/local.properties`, the JDK pin in `android/gradle.properties`,
  `android/.idea/gradle.xml`, and `android/.gradle/config.properties`. Plain
  `expo prebuild` preserves them, so prefer it unless a full reset is required.
- On Android 12+ the OS draws its own splash before app code runs. It needs
  `windowSplashScreenBackground`, which Expo SDK 51 does not emit — the config
  plugin above supplies it. Without it the launch starts on a black screen.

## Environment

`frontend/.env` sets `EXPO_PUBLIC_API_URL`. A physical device needs one of two
setups, and `localhost` on its own means the phone itself:

- **USB** — `adb reverse tcp:4000 tcp:4000` tunnels the API over the cable, the
  same mechanism Expo already uses for Metro on 8081, and `localhost:4000` then
  does reach this machine. Works on mobile data and needs no firewall rule.
  `frontend/scripts/adb-reverse.js` runs from `prestart`/`preandroid` so it is
  re-established whenever Metro starts. **Expo re-creates its own 8081 forward
  but not this one**, so after a mid-session replug or an adb restart the app
  still loads while every request fails with `errors.unreachable` — rerun
  `npm run adb:reverse` (or the raw `adb reverse`) rather than restarting Metro.
- **Wi-Fi** — the development machine's LAN IP, with the phone on the same
  network and Windows Firewall allowing inbound connections for the exact
  `node.exe` binary running the backend (a rule for a different `node.exe` on
  disk, e.g. an nvm copy, does not apply to it).

When neither holds, every request fails before reaching the server and the app
surfaces `errors.unreachable` rather than any auth error — check connectivity
before suspecting credentials.

Read these values only as `process.env.EXPO_PUBLIC_X` member expressions. Expo's
Babel transform matches that exact shape; destructuring
(`const { EXPO_PUBLIC_X } = process.env`) compiles and type-checks cleanly but
yields `undefined` at runtime, producing a silent fallback that is hard to trace.
