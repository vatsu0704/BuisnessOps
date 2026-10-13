# HisabKitab

*Your Business. All in One.*

Multi-tenant AI business intelligence for restaurant, retail and franchise
owners. Full-stack app: React Native (Expo, TypeScript) frontend, a React
(Vite, TypeScript) web app, Node.js/Express backend + PostgreSQL (Prisma ORM).

> The product was called BuisnessOps, then BizIQ. Names that machines key on
> keep the old ones on purpose — the repository folder and the Postgres database
> (`BuisnessOps`), and the Android package `com.biziq.app`, which Firebase and
> every installed copy are bound to. That is deliberate, not a typo; CLAUDE.md's
> *Naming* section has the full list.

## Documentation

Every project document lives in [`Docs/`](Docs/):

| Document | What it covers |
| --- | --- |
| [`Docs/PROJECT_FLOW.md`](Docs/PROJECT_FLOW.md) | The phased delivery plan and the current status of each phase |
| [`Docs/database-table.md`](Docs/database-table.md) | The full data model, phase by phase |
| [`Docs/TESTING_GUIDE.md`](Docs/TESTING_GUIDE.md) | Click-by-click manual walkthrough of every user-facing flow |

[`CLAUDE.md`](CLAUDE.md) at the root holds the conventions and rules for working
in this repository.

## Structure

```
BuisnessOps/
├── Docs/               project documents (flow, data model, testing guide)
│
├── backend/            Node.js + Express API
│   ├── src/
│   │   ├── config/         env, db connection
│   │   ├── controllers/    request handlers
│   │   ├── middleware/     auth, error handling, etc.
│   │   ├── models/         Prisma-generated / domain models
│   │   ├── routes/         Express route definitions
│   │   ├── services/       business logic
│   │   ├── utils/          helpers
│   │   ├── validations/    request schema validation
│   │   ├── app.js          Express app setup
│   │   └── server.js       entry point
│   ├── prisma/
│   │   ├── schema.prisma   PostgreSQL schema
│   │   └── migrations/
│   └── tests/
│
├── frontend/           React Native (Expo) app
│   ├── src/
│   │   ├── api/             API client, endpoint calls
│   │   ├── assets/          images, fonts
│   │   ├── components/      reusable UI components
│   │   ├── constants/       theme, config constants
│   │   ├── hooks/           custom React hooks
│   │   ├── navigation/      React Navigation setup
│   │   ├── screens/         app screens
│   │   ├── store/           state management
│   │   ├── types/           shared TS types
│   │   └── utils/           helpers
│   └── App.tsx
│
└── web/                React (Vite) web app — see web/README.md
    └── src/
        ├── api/             API client, endpoint calls
        ├── components/      brand, layout, ui, home sections
        ├── pages/           sign in, sign up, Home, placeholders
        ├── routes/          routes and their guards
        ├── store/           zustand stores
        └── styles/          the app's theme as CSS variables
```

The web app reads the mobile app's translations, permission matrix and logo from
`frontend/src` rather than keeping copies — `web/README.md` lists what is shared
and the rule that keeps it safe.

## Getting started

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL etc.
npx prisma migrate dev
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npx expo start
```

### Web

```bash
cd web
npm install
cp .env.example .env   # VITE_API_URL, defaults to http://localhost:4000/api
npm run dev            # http://localhost:5173
```
