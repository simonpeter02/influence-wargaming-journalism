# Willingness to Defend — an influence wargame

A turn-based online wargame about hot information, journalism, and whether a public would
still fight for its country. Five players — three journalists, a government spokesperson,
and an opposition leader — act week by week in the fictional liberal democracy of
**Nordavia** after leaked documents show the country's air defense is far weaker than
officially claimed. An LLM simulates the public and writes each week's debrief.

The core mechanic: the public's **Willingness to Defend (WD)** is tracked in secret the
whole game (the way the Swedish government tracks it) and revealed only at the end — the
intended moment of reflection. During play each role sees only its own score: journalists
their Attention, government and opposition the Government Popularity.

## Quickstart

```bash
cp .env.example .env   # paste your OpenAI API key
npm install
npm run dev            # → open http://localhost:5173
```

No key handy? `npm run dev:stub` runs a deterministic no-API version.

## Playing

- **Real game** — the host creates a room and shares the 4-letter room code; up to five
  people join from their own browsers and claim roles. Empty seats are filled by AI
  players when the host starts, so any number from 1–5 humans works. Turn 0: the three
  journalists (only) decide simultaneously whether to publish the leak, and how. Turns
  1–5: everyone acts each week — fixed choices plus a free-text line, always a concrete
  action. Between turns the game master simulates the public: newspaper front pages,
  a narrative, and per-role briefs.
- **Demo game** — solo, ~3 minutes: pick one role, the other four are AI, three rounds
  total (week 0 + 2 weeks), then the reveal.
- **Injects** (rule-triggered, stochastic, max 2 per game): a vote of no confidence when
  government popularity collapses (success swaps government and opposition), a prime-time
  TV debate for the journalists, a book-deal offer that shifts public discourse, and an
  invasion if willingness to defend collapses — which ends the game.
- **End of game** — WD trajectory revealed with all scores, a week-by-week timeline of
  every player's (now public) actions and what moved WD, plus all-time stats across every
  game played: average final WD, invasion rate, turn-0 publish rate, and average final WD
  when the leak was published at turn 0 vs held.

## Architecture

npm-workspaces monorepo:

- `shared/` — TypeScript contracts: `PlayerView`, action specs, socket events. The server
  sends each client a single role-filtered `view` event after every state change; hidden
  scores are excluded structurally, never just visually.
- `server/` — Express + socket.io + better-sqlite3. `engine/GameRoom.ts` holds the state
  machine (lobby → briefing → turn 0 → turns 1–5 with inject decisions → reveal). One
  game-master LLM call per turn (JSON mode, zod-validated, one retry, deterministic stub
  fallback so a live game never stalls). The LLM proposes score deltas; the engine clamps
  them (|ΔWD| ≤ 15, |ΔGP| ≤ 15, |ΔAT| ≤ 20) and owns all inject mechanics. Every turn is
  persisted to SQLite for the all-time analytics.
- `client/` — React + Vite + Recharts, a pure function of the latest `PlayerView`.

## Tests

- `npm run test:engine` — drives five socket clients through a complete game against the
  stub LLM, asserting phase flow, role-filtered visibility (WD never leaks), inject
  decisions, reveal payload, and reconnect.
- `node uiSmoke.mjs` — headless-browser smoke test that plays a full demo game through
  the real client (requires `npm i --no-save playwright-core` and Google Chrome, with
  `npm run dev:stub` running).

## Production-ish run

```bash
npm run build -w client
npm start -w server     # serves the built client + API + sockets on APP_PORT (3002)
```

`npm run demo:standalone` still runs the original single-file demo (`server.js`, port 3001).
