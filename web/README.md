# HisabKitab — web app

The browser version of HisabKitab: React 19, TypeScript, Vite, React Router.
It talks to the same API as the mobile app (`../backend`) and is being brought
to parity with it screen by screen — `Docs/PROJECT_FLOW.md` section 15 tracks
which screens are on the web so far.

## Running it

```bash
cd web
npm install
cp .env.example .env      # VITE_API_URL — defaults to http://localhost:4000/api
npm run dev               # http://localhost:5173
```

The backend has to be running for anything past the sign-in page. Its CORS
allow-list (`CORS_ORIGINS`) is open when unset, which is what development needs;
set it in production to wherever this app is served.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with hot reload on port 5173 |
| `npm run build` | Type-check, then a production build into `dist/` |
| `npm run preview` | Serve the `dist/` build locally |
| `npm run lint` | Type-check (`tsc -b`) — the type gate |
| `npm run lint:i18n` | The web's own strings exist in all four languages, and no translation it reads uses a tag `<Trans>` would empty |

`VITE_API_URL` is inlined at build time, exactly like the app's
`EXPO_PUBLIC_API_URL`: a build calls whatever was in `.env` when it was made.

## What it shares with the mobile app

The web app does **not** copy the mobile app's data files. `@shared/` resolves to
`../frontend/src`, and these are read from there:

| Shared file | Why it must be one copy |
| --- | --- |
| `i18n/locales/{en,hi,gu,mr}.json` | Every sentence, including every API error code's wording |
| `permissions/index.ts` + `matrix.json` | The capability matrix, itself a mirror of the backend's catalog |
| `constants/brand.ts` | The product's name |
| `constants/brandMark.json` | The logo, drawn by `components/brand/BrandMark.tsx` |
| `utils/format.ts`, `utils/validation.ts` | Indian-grouped amounts, email validation |

**A shared file may import nothing but its own siblings.** It is compiled by the
web's toolchain, where `@/` means `web/src` and there is no React Native — so an
`@/` import, or anything from `react-native` or `expo-*`, added to one of these
files breaks the web build. `npm run lint` here catches it; the mobile app's own
checks cannot.

The strings only the web needs (its sidebar, its placeholder pages) live in
`src/i18n/locales/` and are merged under `web.*`. Only English ships in the main
bundle; Hindi, Gujarati and Marathi are fetched when chosen.

## Layout

```
web/
├── index.html
├── public/                 favicon (the app's own, from frontend/assets)
├── scripts/                check-i18n-parity.js
└── src/
    ├── api/                axios client, error translation, one file per resource
    ├── components/
    │   ├── brand/          BrandMark, Wordmark
    │   ├── home/           Home's sections
    │   ├── layout/         AppShell, Sidebar, TopBar, UserMenu, AuthHeader, ScreenBackground
    │   └── ui/             FormInput, PrimaryButton, Pill, InfoCard, StatTile, ChoiceTile, …
    ├── constants/          navigation (every sidebar entry and who sees it), brand
    ├── hooks/              useBranches, useSalesSummary, useMembership, useRefreshOnFocus, …
    ├── i18n/               i18next setup, the web-only locale files
    ├── pages/              LoginPage, SignupPage, HomePage, ComingSoonPage, NoticePage
    ├── permissions/        re-exports the shared matrix
    ├── routes/             AppRoutes, guards (RequireAuth, GuestOnly, RequireAccess)
    ├── store/              zustand: authStore, branchStore, salesStore
    ├── styles/             tokens.css (the app's theme as CSS variables), global.css
    ├── theme/              motion values JavaScript needs
    ├── types/
    └── utils/
```

## Conventions

They are the mobile app's, from `CLAUDE.md`, applied to the web:

- **Never check a role name** — gate on a capability, narrowed with
  `hideWhen: { holds, unless }` where holding it does not make it the person's job
  (`utils/permissions.ts`). The sidebar, Home and the route guards all use it.
- **Never hardcode a user-facing string.** Shared wording via `t('section.key')`,
  web-only wording via `t('web.section.key')`, added in all four web locale files.
- **Shared server data lives in a zustand store** that records which business it
  belongs to (`loadedFor`), dedupes in-flight requests and keeps its data when a
  refresh fails. A page refetches on mount and when the browser tab comes back
  into view (`useRefreshOnFocus`).
- **Styles use the tokens** in `styles/tokens.css`, which repeat
  `frontend/src/theme/index.ts` value for value. Change both together.
- **A layout must survive Gujarati at 320px.** Prefer grids that wrap
  (`repeat(auto-fill, minmax(…))`) or a container query over fixed rows; check
  the screen at 320, 390, 820 and 1440 wide before calling it done.
- **A `<Trans>` tag must not be named after a void HTML element** (`link`, `br`,
  `img`, `input`, …). react-i18next parses its markup as HTML and empties it.
