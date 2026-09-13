# BuisnessOps

Full-stack app: React Native (Expo, TypeScript) frontend + Node.js/Express backend + PostgreSQL (Prisma ORM).

## Structure

```
BuisnessOps/
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
