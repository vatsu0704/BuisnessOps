# syntax=docker/dockerfile:1

# The HisabKitab API as a deployable image.
#
# Two things about this project shape it, and neither is obvious from the
# outside:
#
#  - **Prisma's query engine is a native binary and needs OpenSSL.** `node:20-slim`
#    does not ship it, and the failure is a runtime error about a missing
#    shared library rather than anything that looks like a build problem.
#  - **`npm ci` has to reach cdn.sheetjs.com as well as the npm registry.**
#    `xlsx` is installed from the vendor's own CDN because SheetJS withdrew the
#    package from npm and the name there is frozen at a vulnerable version. See
#    the "Dependency overrides" section of CLAUDE.md. A build host with the
#    registry allow-listed and nothing else will fail here.

FROM node:20-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app


# --- dependencies + generated client ------------------------------------
#
# `--omit=dev` is safe here only because the Prisma CLI is a regular
# dependency rather than a dev one: the running container applies migrations
# itself, so it needs `prisma migrate deploy` available at runtime. See the
# note beside it in package.json.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate


# --- runtime ------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

# Everything from here runs unprivileged. The image owns no writable state —
# uploads are parsed in memory (multer's memoryStorage) and documents are
# generated and streamed — so nothing needs a writable path.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node

EXPOSE 4000

# `src/config/env.js` already refuses to start on a bad environment, so a
# container that comes up with no JWT_SECRET exits rather than serving. This
# answers the other question — whether an instance that *did* start can still
# reach Postgres — which is what a load balancer is actually asking.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations run before the server listens. On a host that offers a release
# phase, prefer `npm run migrate:deploy` there and plain `npm start` here —
# see Procfile and Docs/DEPLOYMENT.md.
CMD ["npm", "run", "start:prod"]
