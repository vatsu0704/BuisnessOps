# Deploying the BizIQ API

Everything needed to run `backend/` somewhere other than a laptop, and the
handful of things that will go wrong quietly if they are skipped.

The app half is not deployed in the same sense — it is a native Android build
installed on a phone. Its one deployment-shaped concern is at the bottom,
because the API's address is **compiled into the APK** rather than configured
at run time.

---

## What is in the repository

| File | What it is for |
| --- | --- |
| `backend/Dockerfile` | A production image. Applies migrations itself, then serves. |
| `backend/.dockerignore` | Keeps `.env`, the Firebase credential and a host-built `node_modules` out of the image. |
| `backend/Procfile` | For a host with a release phase — migrations run once per deploy instead of per container. |
| `backend/.env.example` | Every variable, with what happens if it is wrong. |

Two npm scripts matter here:

- `npm run migrate:deploy` — applies committed migrations and nothing else.
  Never generates one, never resets; safe to run against production.
- `npm run start:prod` — `migrate:deploy` and then the server, in one command.
  This is the container's `CMD`.

---

## Step 1 — The environment

`src/config/env.js` runs before the server listens and **refuses to start** on a
bad environment rather than failing later at the first login. In production it
is stricter than it is locally.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Always | Postgres connection string. Add `?sslmode=require` if your host demands TLS. |
| `JWT_SECRET` | Always | **In production**: not a known placeholder, and at least 32 characters. |
| `NODE_ENV` | Set it to `production` | This is what switches on JSON logging and the strict secret rules. The Docker image sets it. |
| `PORT` | Optional | Defaults to 4000. Most hosts inject their own; the code already reads it. |
| `CORS_ORIGINS` | Only if you serve the web build | Comma-separated. **Unset means any origin** — fine for the native app, wrong for a browser. |
| `FIREBASE_SERVICE_ACCOUNT` | Optional | Unset means the API records notifications without sending them, and starts normally. |

Generate the secret — do not reuse the development one, and do not copy one
from any checkout:

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

A token is valid for seven days and carries nothing but a user id, so anybody
holding this string can sign in as any user in any business. Changing it signs
everyone out, which is exactly the right response to a leak.

### The Firebase credential is not a config value

`backend/firebase-service-account.json` is a **credential**: anyone holding it
can push a notification to every user. It is gitignored, it is in
`.dockerignore`, and it must never be baked into an image layer — a layer keeps
it in the image's history whatever a later step deletes.

Inject it the way your host handles secret files (a mounted secret, or a file
written at boot from an environment variable), and point
`FIREBASE_SERVICE_ACCOUNT` at wherever it lands. See `Docs/FIREBASE_SETUP.md`
for how the file is produced.

---

## Step 2 — Migrations

There are two shapes, and the right one depends on the host.

**A host with a release phase** (Heroku, Railway, Render, Fly). `Procfile`
already describes it:

```
release: npm run migrate:deploy
web: npm start
```

Prefer this. The release phase runs **once per deploy**, before any new
instance takes traffic, so two instances coming up together cannot both try to
migrate, and a failed migration stops the deploy instead of leaving a
half-migrated database serving requests.

**A plain container runtime**, with no release phase. The image's `CMD` is
`npm run start:prod`, which migrates and then serves. `prisma migrate deploy`
takes an advisory lock, so several replicas starting at once serialise rather
than corrupt each other — but the first one still gates the rest, and a
migration that fails takes the container with it.

**Never `prisma migrate dev` against a deployed database.** It is the
development command: it can generate a new migration from a drifted schema and
will offer to reset. `migrate:deploy` exists so the production path cannot
reach it by accident.

---

## Step 3 — Build and run

```
cd backend
docker build -t biziq-api .
docker run --rm -p 4000:4000 \
  -e DATABASE_URL="postgresql://…" \
  -e JWT_SECRET="…" \
  biziq-api
```

Two things about the build that are not obvious from the Dockerfile alone:

- **The build host must reach `cdn.sheetjs.com`, not only the npm registry.**
  `xlsx` is installed from the vendor's CDN because SheetJS withdrew the
  package from npm and the name there is frozen at a version with two
  advisories against it. `package-lock.json` records the URL with a sha512
  hash, so `npm ci` verifies it exactly as it would a registry tarball — but a
  build network that allow-lists the registry and nothing else fails here.
- **The Prisma CLI is a regular dependency, deliberately.** The container
  applies its own migrations, so `prisma migrate deploy` has to survive
  `npm ci --omit=dev`. There is a note beside it in `package.json`.

The image runs as the unprivileged `node` user and writes nothing to disk —
uploads are parsed in memory and documents are generated and streamed.

---

## Step 4 — Health and logs

### Health

`GET /api/health` answers `{ "status": "ok", "database": "ok" }`, or **503**
with `{ "status": "degraded", "database": "unreachable" }` when Postgres cannot
be reached. Point your host's health check at it. It runs `SELECT 1`, so it
proves a connection can be taken from the pool and a round trip completed,
without the check itself becoming load.

The Dockerfile declares a `HEALTHCHECK` against the same endpoint for runtimes
that use one.

### Logs

With `NODE_ENV=production` the API emits **one JSON object per line**. Nothing
needs configuring; it goes to stdout, which is what every host already
collects. Errors go to stderr.

An access line:

```json
{"ts":"2026-10-02T13:19:44.845Z","level":"info","event":"request",
 "id":"fe0cd324-…","method":"GET","url":"/api/health","status":200,
 "ms":93.5,"bytes":31,"ip":"::ffff:127.0.0.1"}
```

On an authenticated request it also carries `user`, `business` and `role`.
Fields with nothing in them are left out rather than written as `null`, so
"absent" and "empty" can be told apart.

**`id` is the thing to search on.** Every response carries it back as the
`X-Request-Id` header, and an unhandled 500 is logged as an `unhandled_error`
line with the same id and the stack. So a report of "it broke" becomes one
grep, instead of a guess about which of the day's requests it was. An id
supplied by a proxy or the app is reused so a trace started upstream carries
through; one that does not look like an id is replaced rather than echoed,
because this value is written verbatim into the log.

Outside production the format stays `morgan('dev')`, which is the right thing
for a terminal somebody is watching, and logging is silent under `NODE_ENV=test`.

---

## Before you call it live

These are not configuration — they are unbuilt, and each one is a decision
rather than a step.

- **There is no password reset, no password change and no email verification.**
  Somebody who forgets their password has to be given a new one directly in the
  database. For a pilot with known users that is survivable; for anyone outside
  that circle it is a dead account. Building it needs an email channel, which is
  a product decision: Firebase push cannot reach someone who cannot sign in.
- **There is no error tracking.** The logs above are the whole of it — nothing
  aggregates, alerts, or tells you a 500 rate has moved.
- **Rate limiting covers the auth routes only** (`middleware/rateLimit.js`), and
  widening it needs care: every screen refetches on focus and a whole branch
  shares one shop's IP, so a limit that is wrong locks a shop out of its own
  till mid-service.
- **Database backups are the host's job and are not configured here.** The
  seven months of trading in a real deployment are the business's books.
- **`app.set('trust proxy', 1)` assumes exactly one proxy in front of the API.**
  That is right behind a single TLS terminator. Behind two — a CDN and then a
  load balancer — the limiter counts the wrong address, and the fix is the
  correct hop count, never `true`, which would let a client pick its own
  identity with an `X-Forwarded-For` header.

---

## The app's half

The APK is **not** configured at run time. `EXPO_PUBLIC_API_URL` is inlined by
Expo's Babel transform at build time, so the URL that was in `frontend/.env`
when the bundle was built is the URL the installed app will call, forever.

A shareable build is the release variant:

```
cd frontend
# .env must hold the hosted API URL before this, not localhost
cd android && ./gradlew assembleRelease
```

It writes `android/app/build/outputs/apk/release/app-release.apk` with the
bundle, and therefore that URL, compiled in. Without
`frontend/keystore.properties` it is signed with the debug key — fine for
sideloading, not acceptable for the Play Store.

`frontend/google-services.json` must exist before any build, or the app has no
Firebase configuration compiled into it and no push will ever arrive. On EAS
that file needs a `GOOGLE_SERVICES_JSON` environment variable, because EAS
uploads only git-tracked files and this one is gitignored —
`frontend/app.config.js` exists to read it. See `Docs/FIREBASE_SETUP.md`.
