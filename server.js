import express from 'express';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- config (.env is optional; stub mode works without it) ----
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const PORT = process.env.PORT || 3001;
const MODEL = process.env.DEMO_MODEL || 'gpt-4.1-mini';
const API_KEY = process.env.OPENAI_API_KEY;
const USE_STUB = process.env.LLM_STUB === '1' || !API_KEY || API_KEY.startsWith('sk-...');

const DATA_DIR = path.join(__dirname, 'data');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---- game content ----
const COUNTRY = 'Nordavia';
const FINAL_TURN = 2; // turn 0 + turns 1..2

const HOT_INFO =
  `LEAKED DOCUMENTS (verified): Only 4 of ${COUNTRY}'s 12 air-defense batteries are operational. ` +
  `Spare parts ran out in 2024. The Defense Ministry has publicly claimed "full readiness" three times this year. ` +
  `A hostile neighbor has been massing exercises near the border.`;

const ROLES = {
  journalist: {
    label: 'Journalist — The Herald',
    card:
      `You are an investigative journalist at The Herald. You want big stories, readership and attention — ` +
      `your career depends on it. But you also live in ${COUNTRY}, a liberal democracy you are fond of.\n\n` +
      `HOT INFORMATION has landed on your desk:\n${HOT_INFO}\n\n` +
      `At least two other journalists are rumored to have the same documents. If you hold the story, someone else may run it first.`,
    scoreLabel: 'Your Attention Score',
  },
  government: {
    label: 'Government Spokesperson',
    card:
      `You speak for the government of ${COUNTRY}, a liberal democracy. Your goal: keep the government in office and popular. ` +
      `You know defense readiness is worse than publicly admitted. Rumors say journalists have leaked documents about it.`,
    scoreLabel: 'Government Popularity',
  },
  opposition: {
    label: 'Opposition Leader',
    card:
      `You lead the opposition in ${COUNTRY}, a liberal democracy. Your goal: weaken the government and position yourself for power — ` +
      `but you love your country and an actual security crisis helps no one. Rumors say a defense-readiness scandal is about to break.`,
    scoreLabel: 'Government Popularity',
  },
};

function actionSpec(role, turn) {
  if (role === 'journalist') {
    if (turn === 0)
      return {
        prompt: 'The documents are on your desk. What do you do?',
        fields: [
          { name: 'decision', label: 'Decision', type: 'choice', options: [
            { value: 'publish', label: 'Publish now' },
            { value: 'hold', label: 'Hold the story (you can publish later)' },
          ]},
          { name: 'format', label: 'Format & sentiment', type: 'choice', showIf: { field: 'decision', value: 'publish' }, options: [
            { value: 'government-critical exposé', label: 'Government-critical exposé' },
            { value: 'public call to action', label: 'Public call to action' },
            { value: 'sober human-interest feature', label: 'Sober human-interest feature' },
            { value: 'streaming documentary pitch', label: 'Streaming documentary' },
          ]},
          { name: 'freeText', label: 'Your angle (optional, one line)', type: 'text' },
        ],
      };
    return {
      prompt: 'Next move for this week?',
      fields: [
        { name: 'decision', label: 'Action', type: 'choice', options: [
          { value: 'publish the held story', label: 'Publish the leaked documents now' },
          { value: 'publish a follow-up investigation', label: 'Follow-up investigation' },
          { value: 'write an op-ed', label: 'Op-ed with your opinion' },
          { value: 'interview a key figure', label: 'Land a big interview' },
          { value: 'stay quiet this week', label: 'Stay quiet this week' },
        ]},
        { name: 'format', label: 'Sentiment', type: 'choice', options: [
          { value: 'government-critical', label: 'Government-critical' },
          { value: 'calling the public to action', label: 'Call to action' },
          { value: 'reassuring and constructive', label: 'Reassuring / constructive' },
        ]},
        { name: 'freeText', label: 'Details (optional)', type: 'text' },
      ],
    };
  }
  if (turn === 0)
    return {
      prompt: 'The story has not broken yet. The newsroom rumor mill is spinning.',
      fields: [
        { name: 'decision', label: 'This week', type: 'choice', options: [
          { value: 'quietly monitor the situation', label: 'Quietly monitor the situation' },
          { value: 'prepare a communications plan', label: 'Prepare a comms plan behind closed doors' },
        ]},
        { name: 'freeText', label: 'Instructions to your staff (optional)', type: 'text' },
      ],
    };
  if (role === 'government')
    return {
      prompt: 'Your move this week.',
      fields: [
        { name: 'decision', label: 'Action', type: 'choice', options: [
          { value: 'hold a press conference', label: 'Press conference' },
          { value: 'announce emergency defense funding', label: 'Announce emergency defense funding' },
          { value: 'discredit the reporting', label: 'Discredit the reporting' },
          { value: 'publish a transparency report', label: 'Come clean: transparency report' },
          { value: 'say nothing', label: 'Say nothing' },
        ]},
        { name: 'freeText', label: 'Key message (optional)', type: 'text' },
      ],
    };
  return {
    prompt: 'Your move this week.',
    fields: [
      { name: 'decision', label: 'Action', type: 'choice', options: [
        { value: 'demand a parliamentary inquiry', label: 'Demand a parliamentary inquiry' },
        { value: 'launch a public campaign against the government', label: 'Public campaign against the government' },
        { value: 'call for the defense minister to resign', label: 'Call for the minister’s resignation' },
        { value: 'offer a national unity pact on defense', label: 'Offer a national-unity pact on defense' },
      ]},
      { name: 'freeText', label: 'Key message (optional)', type: 'text' },
    ],
  };
}

// ---- engine ----
const games = new Map();

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function newGame(role, name) {
  const id = randomUUID().slice(0, 8);
  const game = {
    id, role, name: name || 'Player', turn: 0, finished: false,
    scores: { wd: 50, gp: 55, at: 30 }, // at = the human journalist's attention (tracked regardless of role)
    history: [], // {turn, humanAction, gm, scores}
    createdAt: new Date().toISOString(),
  };
  games.set(id, game);
  return game;
}

function visibleScore(game) {
  if (game.role === 'journalist') return { label: ROLES.journalist.scoreLabel, value: game.scores.at };
  return { label: ROLES[game.role].scoreLabel, value: game.scores.gp };
}

function view(game) {
  const last = game.history[game.history.length - 1];
  return {
    gameId: game.id,
    role: game.role,
    roleLabel: ROLES[game.role].label,
    turn: game.turn,
    finished: game.finished,
    roleCard: game.turn === 0 && !last ? ROLES[game.role].card : null,
    brief: last ? last.gm.roleBrief : null,
    moodHint: last ? last.gm.publicMoodHint : 'The public is calm. Defense is not on anyone’s mind.',
    visibleScore: visibleScore(game),
    lastDebrief: last ? {
      frontPage: last.gm.frontPage,
      otherActions: last.gm.otherActions,
      publicNarrative: last.gm.publicNarrative,
      keyMoment: last.gm.keyMoment,
    } : null,
    actionSpec: game.finished ? null : actionSpec(game.role, game.turn),
    reveal: game.finished ? buildReveal(game) : null,
  };
}

function buildReveal(game) {
  return {
    finalScores: game.scores,
    trajectory: [
      { turn: 'start', wd: 50, gp: 55, at: 30 },
      ...game.history.map(h => ({ turn: `week ${h.turn + 1}`, ...h.scores })),
    ],
    timeline: game.history.map(h => ({
      turn: h.turn,
      yourAction: describeAction(h.humanAction),
      keyMoment: h.gm.keyMoment,
      wdDelta: h.wdDelta,
    })),
    allTime: allTimeStats(),
  };
}

function describeAction(a) {
  let s = a.choices.decision || 'no action';
  if (a.choices.format && a.choices.decision !== 'hold') s += ` (${a.choices.format})`;
  if (a.freeText) s += ` — "${a.freeText}"`;
  return s;
}

function applyDeltas(game, deltas) {
  const wd = clamp(Math.round(deltas.wd ?? 0), -15, 15);
  const gp = clamp(Math.round(deltas.gp ?? 0), -15, 15);
  const at = clamp(Math.round(deltas.at ?? 0), -20, 20);
  game.scores.wd = clamp(game.scores.wd + wd, 0, 100);
  game.scores.gp = clamp(game.scores.gp + gp, 0, 100);
  game.scores.at = clamp(game.scores.at + at, 0, 100);
  return wd;
}

function allTimeStats() {
  let all = [];
  try { all = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf8')); } catch { /* first game ever */ }
  const finished = all.filter(g => g.finalWd != null);
  return {
    gamesPlayed: finished.length,
    avgFinalWd: finished.length ? Math.round(finished.reduce((s, g) => s + g.finalWd, 0) / finished.length) : null,
  };
}

function persistGame(game) {
  let all = [];
  try { all = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf8')); } catch { /* first game ever */ }
  all.push({
    id: game.id, role: game.role, createdAt: game.createdAt,
    finalWd: game.scores.wd, finalGp: game.scores.gp, finalAt: game.scores.at,
    timeline: game.history.map(h => ({ turn: h.turn, action: describeAction(h.humanAction), keyMoment: h.gm.keyMoment })),
  });
  fs.writeFileSync(GAMES_FILE, JSON.stringify(all, null, 2));
}

// ---- game master (LLM with stub fallback) ----
const GM_SYSTEM = `You are the game master of a serious policy wargame. You simulate THE PUBLIC of ${COUNTRY}, a mid-sized European liberal democracy, plus every actor not played by the human. Each turn is roughly one week.

Tracked scores (0-100): WD = the public's willingness to defend the country if attacked (the hidden key variable); GP = government popularity; AT = the human journalist's attention/readership (only meaningful if the human is a journalist, but always report it for The Herald's coverage).

Scenario: ${HOT_INFO}

Non-human actors and their incentives: two rival journalists (Miriam Voss of The Sentinel, Tomas Krug of the Daily Courier) who hold the same leak and want attention; the government (wants to stay in office); the opposition (wants power but loves the country). Whoever the human plays, you play the rest, realistically and self-interestedly.

Each turn you receive the state and the human's action. Respond with STRICT JSON only:
{
 "otherActions": [{"actor": "...", "summary": "one short sentence"}],   // 2-4 items, the non-human actors' concrete moves this week
 "publicNarrative": "how the public reacted, max 70 words, vivid but sober",
 "frontPage": {"outlet": "...", "headline": "punchy, max 9 words", "subhead": "max 14 words"},
 "scoreDeltas": {"wd": int -15..15, "gp": int -15..15, "at": int -20..20},
 "publicMoodHint": "one qualitative sentence about the public mood, NO numbers",
 "roleBrief": "brief for the human's next turn, addressed to them, max 45 words",
 "keyMoment": "max 8 words, label for the analytics timeline"
}

Score logic: exposing government lies usually drops GP hard; alarmist coverage can raise threat awareness (WD up) or breed cynicism and fatalism (WD down) depending on tone; constructive/unifying moves raise WD; being scooped costs the human journalist AT; publishing first raises AT a lot. Never mention WD numbers in any text field.`;

function gmUser(game, humanAction) {
  const historyLines = game.history.map(h =>
    `Week ${h.turn + 1}: human did "${describeAction(h.humanAction)}"; key moment: ${h.gm.keyMoment}; WD ${h.scores.wd}, GP ${h.scores.gp}, AT ${h.scores.at}`
  ).join('\n') || 'None yet — this is the opening week.';
  let inject = '';
  if (game.turn === FINAL_TURN && game.scores.gp <= 40)
    inject = 'INJECT: government popularity is critically low — weave a looming vote of no confidence into events.';
  else if (game.scores.wd <= 15)
    inject = 'INJECT: willingness to defend is dangerously low — the hostile neighbor grows bolder; weave border provocations into events.';
  return `State: turn ${game.turn} of ${FINAL_TURN}, WD ${game.scores.wd}, GP ${game.scores.gp}, AT ${game.scores.at}.
Human player role: ${ROLES[game.role].label} (name: ${game.name}).
Prior weeks:\n${historyLines}
${game.turn === 0 ? 'It is week 0: only journalists know about the leak. The story may or may not break this week depending on their choices.' : ''}
${inject}
Human's action this week: ${describeAction(humanAction)}.
Return the JSON.`;
}

async function callOpenAI(game, humanAction) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.8,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: GM_SYSTEM },
        { role: 'user', content: gmUser(game, humanAction) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const gm = JSON.parse(data.choices[0].message.content);
  if (!gm.scoreDeltas || !gm.publicNarrative || !gm.roleBrief) throw new Error('GM output missing fields');
  return gm;
}

function stubGm(game, humanAction) {
  const published = /publish/.test(humanAction.choices.decision || '');
  const critical = /critical|action/.test(humanAction.choices.format || '');
  const t = game.turn;
  return {
    otherActions: t === 0
      ? [
          { actor: 'Miriam Voss (The Sentinel)', summary: 'Publishes the leak as a front-page exposé.' },
          { actor: 'Tomas Krug (Daily Courier)', summary: 'Holds the story, keeps verifying documents.' },
        ]
      : [
          { actor: 'Government', summary: 'Announces an emergency review of air-defense readiness.' },
          { actor: 'Opposition', summary: 'Demands the defense minister appear before parliament.' },
          { actor: 'Miriam Voss (The Sentinel)', summary: 'Runs a follow-up on the missing spare parts.' },
        ],
    publicNarrative: t === 0
      ? 'The leak breaks. Social feeds fill with disbelief: the government said "full readiness" three times. Some citizens are angry at the lie; others quietly wonder whether defending the country is even possible with four batteries.'
      : 'The scandal dominates the week. Trust in official statements erodes further, but volunteer sign-ups for civil defense courses tick upward — anger is turning into engagement for some, resignation for others.',
    frontPage: t === 0
      ? { outlet: 'The Sentinel', headline: 'ONLY 4 OF 12: THE READINESS LIE', subhead: 'Ministry claimed full readiness while batteries stood empty' }
      : { outlet: 'Daily Courier', headline: 'WHO KNEW, AND SINCE WHEN?', subhead: 'Pressure mounts as parliament demands answers on defense gap' },
    scoreDeltas: {
      wd: published && critical ? -7 : published ? -3 : -5,
      gp: published ? -10 : -6,
      at: published ? 14 : game.role === 'journalist' ? -8 : 0,
    },
    publicMoodHint: 'The public is rattled — anger at the government mixing with a creeping sense of vulnerability.',
    roleBrief: game.role === 'journalist'
      ? 'Your inbox is full of tips. Editors want a follow-up; readers want to know who is responsible. What is your next move?'
      : 'The story is everywhere and every microphone is pointed at you. This week’s move will define the narrative.',
    keyMoment: t === 0 ? 'The readiness lie goes public' : 'Scandal deepens, accountability demanded',
  };
}

async function resolveTurn(game, humanAction) {
  let gm;
  if (USE_STUB) {
    gm = stubGm(game, humanAction);
  } else {
    try {
      gm = await callOpenAI(game, humanAction);
    } catch (e1) {
      console.error('GM call failed, retrying once:', e1.message);
      try { gm = await callOpenAI(game, humanAction); }
      catch (e2) { console.error('GM retry failed, using stub:', e2.message); gm = stubGm(game, humanAction); }
    }
  }
  const wdDelta = applyDeltas(game, gm.scoreDeltas || {});
  game.history.push({ turn: game.turn, humanAction, gm, scores: { ...game.scores }, wdDelta });
  if (game.turn >= FINAL_TURN || game.scores.wd <= 0) {
    game.finished = true;
    persistGame(game);
  } else {
    game.turn += 1;
  }
}

// ---- http ----
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/game', (req, res) => {
  const role = ['journalist', 'government', 'opposition'].includes(req.body.role) ? req.body.role : 'journalist';
  const game = newGame(role, (req.body.name || '').slice(0, 40));
  res.json(view(game));
});

app.post('/api/game/:id/action', async (req, res) => {
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: 'game not found' });
  if (game.finished) return res.status(400).json({ error: 'game is over' });
  const humanAction = {
    choices: req.body.choices || {},
    freeText: (req.body.freeText || '').slice(0, 300),
  };
  await resolveTurn(game, humanAction);
  res.json(view(game));
});

app.get('/api/stats', (_req, res) => res.json(allTimeStats()));

app.listen(PORT, () => {
  console.log(`Wargame demo on http://localhost:${PORT}  (mode: ${USE_STUB ? 'STUB — no OpenAI calls' : `OpenAI ${MODEL}`})`);
});
