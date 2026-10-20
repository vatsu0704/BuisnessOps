# Deploying the KitnaPay API

Everything needed to run `backend/` somewhere other than a laptop, and the
handful of things that will go wrong quietly if they are skipped.

The app half is not deployed in the same sense — it is a native Android build
installed on a phone. Its one deployment-shaped concern is at the bottom,
because the API's address is **compiled into the APK** rather than configured
at run time. The web app (`web/`) is a static site; it has its own section,
*The web app*, near the end.

---

## What is in the repository

| File | What it is for |
| --- | --- |
| `backend/Dockerfile` | A production image. Applies migrations itself, then serves. |
| `backend/.dockerignore` | Keeps `.env`, the Firebase credential and a host-built `node_modules` out of the image. |
| `backend/Procfile` | For a host with a release phase — migrations run once per deploy instead of per container. |
| `backend/.env.example` | Every variable, with what happens if it is wrong. |
| `render.yaml` | The web app as a Render static site — see *The web app*. Defines nothing else. |

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
| `FIREBASE_SERVICE_ACCOUNT` | Optional | A path to the credential file, or the file's JSON itself. Unset means the API records notifications without sending them, and starts normally. |
| `LEGAL_NAME`, `LEGAL_ADDRESS`, `SUPPORT_EMAIL` | Before the store listing goes live | Who operates the app, as `/privacy` and `/delete-account` state it. Unset, those pages say the details are being finalised and a production server warns at start. See *The public pages* below. |

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

There are two ways to hand it over, and the API takes either:

- **A secret file**, where the host has them (a mounted secret): point
  `FIREBASE_SERVICE_ACCOUNT` at wherever it lands.
- **The JSON itself, as the variable's value**, on a host that only has
  environment variables — Railway, and most others. A value starting with `{` is
  parsed directly. Mark the variable secret in the host's dashboard; it is the
  same credential as the file.

If inline JSON does not parse, the API starts without push and logs that it
could not — without quoting the value, because the value is a private key. See
`Docs/FIREBASE_SETUP.md` for how the file is produced.

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
docker build -t kitnapay-api .
docker run --rm -p 4000:4000 \
  -e DATABASE_URL="postgresql://…" \
  -e JWT_SECRET="…" \
  kitnapay-api
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

- **Password reset and password change are built** (2026-10-19), but they need
  `SMTP_URL`, `MAIL_FROM` and `PUBLIC_WEB_URL` set, and the web app hosted for the
  link to be clickable. Without them the server starts, warns at every start, and
  writes the link to the log instead of sending it — which is fine for testing and
  is a dead account for a real user.
- **There is no email verification.** An address mistyped at sign-up takes the
  reset link with it, and nothing about the account can be recovered.
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

## Changing a business's plan

Until a payment gateway exists (requirement 28, stage 2), a plan is changed by hand
after the owner has paid by UPI or bank transfer. Run it in the service's shell, where
`DATABASE_URL` is already set — on Render, the service's **Shell** tab — from the
`backend` directory:

    node scripts/set-plan.js --business <businessId> --show
    node scripts/set-plan.js --business <businessId> --plan GROWTH --branches 3       --interval YEARLY --until 2027-10-13 --amount 35964 --reference <UTR> --actor <your name>
    node scripts/set-plan.js --business <businessId> --cancel --actor <your name> --note "<why>"

- `--branches` is how many **trading** branches are paid for. Warehouses are free and
  closed branches are not counted. The script refuses a number below the branches
  already trading — the owner closes one first; it never chooses which shop to shut.
- `--until` covers that whole day. After it the business has 7 days of grace with
  everything working, then turns read-only; nothing is ever deleted.
- Every run is recorded in `billing_events` with `--actor`, the amount and the
  reference, so a plan can be traced to the money behind it.
- `--cancel` makes the business read-only **at once**, with no grace. To let a plan run
  out instead, do nothing — it ends at `--until`.
- There is deliberately no API endpoint for this: one would need an operator above every
  business's owner, a role the API does not have.

The migration that added subscriptions gave every existing business a 30-day trial
from the day it was applied — set a plan for each paying business before it runs out.

---

## The public pages

The same server answers two plain web pages outside `/api`, because the app
stores require them and link to them:

| Path | What it is |
| --- | --- |
| `/privacy` | The privacy policy — entered in the Play Console, and opened from the app's Settings and sign-up screen |
| `/delete-account` | How to delete an account, in the app or without it — entered in the Play Console's Data safety form |

They name the company that operates the app from `LEGAL_NAME`, `LEGAL_ADDRESS`
and `SUPPORT_EMAIL`. Until all three are set they say the operator's details are
being finalised, and a production server warns about it at every start; it does
not refuse to start. An address can separate its lines with `\n`. Setting them
needs a restart, not a deploy.

Their paths are what matter, not their host: the app derives them from its API
address, so when the API moves to your own domain, the pages move with it.

---

## The web app

`web/` builds to plain files — HTML, JavaScript, CSS — that any static host can
serve. `render.yaml` at the repository root describes it as a Render static site
beside the API.

**What to do, once** (Vatsal's steps; nothing here deploys by itself):

1. Render dashboard → **New → Blueprint** → this repository. It finds
   `render.yaml` and offers one static site, `kitnapay-web`. The existing API
   service is not in the file and is left alone.
2. Before the first build, check **`VITE_API_URL`** on the new site. It defaults to
   `https://buisnessops.onrender.com/api`; point it at your own domain once the API
   has one, for the same reason as the app's address below.
3. When the site is up, add its address to the API's **`CORS_ORIGINS`** (for
   example `https://kitnapay-web.onrender.com`, comma-separated with anything
   already there) and redeploy the API. Unset, the API accepts any origin, which
   works but lets any website call it from a visitor's browser. The phone app sends
   no `Origin` and is unaffected either way.
4. Sign in on the site against the hosted API. A request from an origin that is not
   on the list is refused by the browser — that is the check that step 3 worked.

**Five things that fail quietly:**

- **`VITE_API_URL` is inlined at build time**, exactly like `EXPO_PUBLIC_API_URL`.
  Changing it on Render does nothing until the site is rebuilt.
- **Every address must serve `index.html`** — `/settings`, `/staff/s-1`. The pages
  are drawn in the browser, so without the rewrite in `render.yaml` a reload or a
  shared link on anything but `/` is a 404.
- **The build needs the whole repository**, because it compiles the translations,
  the permission matrix and the brand files out of `frontend/src`. A host set to
  build only `web/` fails at `@shared/…`. It does *not* need `frontend`'s
  dependencies installed.
- **HTTPS is not optional.** The browser only gives a page the location (punch-in,
  W8), push (W13), the service worker that opens the counter offline, and Web
  Serial for the Bluetooth receipt printer (W12) over HTTPS or on `localhost`.
  Render serves HTTPS by default. On a plain-http address the counter still bills
  — it just does not open offline and prints only through the print dialog.
- **`/sw.js` must never be cached.** It is how a counter left open all day learns
  there is a new build. `render.yaml` sends it with `Cache-Control: no-cache`;
  after a deploy, `curl -I https://<site>/sw.js` should show that header and a
  JavaScript content type (if the host ever answered it with `index.html`, the
  worker would simply fail to register — harmless, but the counter would not open
  offline).

**How a deploy reaches an open counter.** Pages are fetched from the network
first, so anyone online gets the new build on their next page load; the new worker
then installs in the background and keeps the new files for offline use. The
previous build's files are kept beside it, so a tab still on the old build can load
its chunks; a tab that does hit a missing chunk reloads itself once.

**If the service worker ever misbehaves**, build with
`VITE_SERVICE_WORKER=off` (an environment variable on the Render site) and
deploy: that build publishes a worker that deletes the kept files, unregisters
itself and reloads its pages, and registers none. Bills are not in the worker's
caches — they are in the browser's IndexedDB — so this never loses one.

The session is a bearer token kept in the browser's `localStorage`, as the API
issues it. Nothing on the site is secret: the bundle contains the API's address
and nothing else that is not already public.

---

## The app's half

The app is **not** configured at run time. `EXPO_PUBLIC_API_URL` is inlined by
Expo's Babel transform at build time, so the URL the bundle was built with is the
URL the installed app will call, forever. **Build against your own domain**
(`https://api.yourdomain.in/api`), not a host's (`*.onrender.com`,
`*.up.railway.app`), so the server can change hosts without an app update.

What Google Play takes is an Android App Bundle:

```
cd frontend
npm run build:play -- --api-url https://api.yourdomain.in/api
```

It takes the address from its argument rather than `frontend/.env`, refuses a
non-https or local one, refuses to build without the release signing key or with
a Firebase file for another package, and afterwards checks the bundle calls that
address and is not signed with the debug key. It writes
`android/app/build/outputs/bundle/release/app-release.aab`.
`Docs/PLAY_STORE_RELEASE.md` is the rest of the route to the store.

A shareable APK for sideloading is still the release variant
(`cd android && ./gradlew assembleRelease`, with the hosted address in `.env`
first). Without `frontend/keystore.properties` it is signed with the debug key —
fine for sideloading, never for the Play Store.

`frontend/google-services.json` must exist before any build, or the app has no
Firebase configuration compiled into it and no push will ever arrive. On EAS
that file needs a `GOOGLE_SERVICES_JSON` environment variable, because EAS
uploads only git-tracked files and this one is gitignored —
`frontend/app.config.js` exists to read it. See `Docs/FIREBASE_SETUP.md`.
