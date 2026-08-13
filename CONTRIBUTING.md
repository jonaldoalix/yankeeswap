# Contributing

Thanks for taking an interest in Yankee Swap.

## Development

```bash
cp example.env .env
npm install
npm run dev
```

- API: `http://127.0.0.1:1224`
- UI: `http://127.0.0.1:5173` (proxies `/api`)

Before opening a PR:

```bash
npm run lint
npm run test:coverage
npm run build
```

Coverage must stay at **100%** for `shared/` and `server/src/` (process entry `server/src/index.ts` excluded).

## Making it yours

Phase copy lives in `shared/rounds.ts`. Mods and defaults live in `shared/mods.ts`. The reducer in `shared/game.ts` is the rules. Add a variation there — the three seats stay.

## Guidelines

- Keep the three seats distinct: host desk, player phone, spectator/TV.
- Gift contributions stay private until they are unwrapped.
- Prefer small, focused PRs with a short “why” in the description.
- Do not commit `.env`, credentials, or real party rosters.

## Code of conduct

Be respectful. Harassment or abuse is not welcome in issues, PRs, or discussions.
