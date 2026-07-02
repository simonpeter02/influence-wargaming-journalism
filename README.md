# Willingness to Defend — an influence-wargaming demo

A turn-based wargame about hot information, journalism, and whether a public would still
fight for its country. You play one role — journalist, government, or opposition — in the
fictional liberal democracy of **Nordavia**, where leaked documents show the country's
air defense is far weaker than officially claimed. An LLM simulates the public and every
actor you don't play.

The core mechanic: the public's **Willingness to Defend (WD)** is tracked in secret the
whole game (the way the Swedish government tracks it) and revealed only at the end,
alongside the visible scores — Government Popularity and Journalist Attention.

**This is the demo version** (solo, 3 turns, ~3 minutes). The full 5-human-player
networked game is planned.

## Quickstart

```bash
cp .env.example .env   # paste your OpenAI API key
npm install
npm start              # → http://localhost:3001
```

No key handy? `npm run start:stub` runs a deterministic no-API version.

## How it works

- One Express server (`server.js`): in-memory game engine, one game-master LLM call per
  turn (OpenAI chat completions, JSON mode) that plays the other actors and simulates the
  public's reaction. Score deltas are proposed by the LLM but clamped by the engine
  (|ΔWD| ≤ 15, |ΔGP| ≤ 15, |ΔAT| ≤ 20, all scores 0–100).
- If the LLM call fails twice, a deterministic stub resolves the turn so a live demo
  never stalls.
- Finished games append to `data/games.json` for the all-time stats shown on the end screen.
- Frontend is a single static page (`public/index.html`) — no build step.
