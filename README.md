# BizIQ

Multi-tenant AI business intelligence for restaurant, retail and franchise
owners. Full-stack app: React Native (Expo, TypeScript) frontend +
Node.js/Express backend + PostgreSQL (Prisma ORM).

> The repository folder and the Postgres database are still named
> `BuisnessOps`, from before the product was renamed to BizIQ. That is
> deliberate, not a typo.

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
└── frontend/           React Native (Expo) app
    ├── src/
    │   ├── api/             API client, endpoint calls
    │   ├── assets/          images, fonts
    │   ├── components/      reusable UI components
    │   ├── constants/       theme, config constants
    │   ├── hooks/           custom React hooks
    │   ├── navigation/      React Navigation setup
    │   ├── screens/         app screens
    │   ├── store/           state management
    │   ├── types/           shared TS types
    │   └── utils/           helpers
    └── App.tsx
```

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
