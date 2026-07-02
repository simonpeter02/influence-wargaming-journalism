import Database from 'better-sqlite3';
import path from 'node:path';
import type { AllTimeStats, Outcome, Role, SubmittedAction, Mode } from '@iwj/shared';
import { JOURNALIST_ROLES } from '@iwj/shared';
import { DATA_DIR } from './config.js';
import type { GmOutput } from './llm/gameMaster.js';
import type { Member } from './engine/GameRoom.js';

const db = new Database(path.join(DATA_DIR, 'games.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code TEXT NOT NULL,
  mode TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT,
  final_wd INTEGER, final_gp INTEGER,
  outcome TEXT
);
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  is_ai INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  turn_number INTEGER NOT NULL,
  debrief_json TEXT
);
CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  turn_number INTEGER NOT NULL,
  role TEXT NOT NULL,
  action_type TEXT NOT NULL,
  choices_json TEXT NOT NULL,
  free_text TEXT
);
CREATE TABLE IF NOT EXISTS score_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  turn_number INTEGER NOT NULL,
  wd INTEGER NOT NULL, gp INTEGER NOT NULL,
  at_j1 INTEGER NOT NULL, at_j2 INTEGER NOT NULL, at_j3 INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS injects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  turn_number INTEGER NOT NULL,
  inject_type TEXT NOT NULL,
  narrative TEXT,
  resolution TEXT
);
`);

export function createGame(roomCode: string, mode: Mode, members: Member[]): number {
  const gameId = db.prepare('INSERT INTO games (room_code, mode) VALUES (?, ?)').run(roomCode, mode).lastInsertRowid as number;
  const ins = db.prepare('INSERT INTO players (game_id, role, name, is_ai) VALUES (?, ?, ?, ?)');
  for (const m of members) if (m.role) ins.run(gameId, m.role, m.name, m.isAi ? 1 : 0);
  return gameId;
}

export function recordTurn(
  gameId: number,
  turn: number,
  gm: GmOutput,
  actions: { role: Role; action: SubmittedAction }[],
  scores: { wd: number; gp: number; at: Record<string, number> },
): void {
  db.prepare('INSERT INTO turns (game_id, turn_number, debrief_json) VALUES (?, ?, ?)')
    .run(gameId, turn, JSON.stringify(gm));
  const ins = db.prepare('INSERT INTO actions (game_id, turn_number, role, action_type, choices_json, free_text) VALUES (?, ?, ?, ?, ?, ?)');
  for (const a of actions) {
    ins.run(gameId, turn, a.role, a.action.choices.decision ?? 'none', JSON.stringify(a.action.choices), a.action.freeText);
  }
  db.prepare('INSERT INTO score_history (game_id, turn_number, wd, gp, at_j1, at_j2, at_j3) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(gameId, turn, scores.wd, scores.gp, scores.at.journalist_1, scores.at.journalist_2, scores.at.journalist_3);
}

export function recordInject(gameId: number, turn: number, type: string, narrative: string, resolution: string): void {
  db.prepare('INSERT INTO injects (game_id, turn_number, inject_type, narrative, resolution) VALUES (?, ?, ?, ?, ?)')
    .run(gameId, turn, type, narrative, resolution);
}

export function finishGame(gameId: number, outcome: Outcome, scores: { wd: number; gp: number }): void {
  db.prepare("UPDATE games SET finished_at = datetime('now'), final_wd = ?, final_gp = ?, outcome = ? WHERE id = ?")
    .run(scores.wd, scores.gp, outcome, gameId);
}

export function allTimeStats(): AllTimeStats {
  const finished = db.prepare('SELECT id, final_wd, outcome FROM games WHERE finished_at IS NOT NULL').all() as
    { id: number; final_wd: number; outcome: string }[];
  const n = finished.length;
  if (!n) return { gamesPlayed: 0, avgFinalWd: null, invasionRate: null, publishRateTurn0: null, avgWdPublished: null, avgWdHeld: null };

  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const t0 = db.prepare(
    `SELECT game_id, action_type FROM actions WHERE turn_number = 0 AND role IN (${JOURNALIST_ROLES.map(() => '?').join(',')})`,
  ).all(...JOURNALIST_ROLES) as { game_id: number; action_type: string }[];
  const publishedGames = new Set(t0.filter(a => a.action_type === 'publish').map(a => a.game_id));
  const finishedIds = new Set(finished.map(g => g.id));
  const t0Finished = t0.filter(a => finishedIds.has(a.game_id));

  return {
    gamesPlayed: n,
    avgFinalWd: avg(finished.map(g => g.final_wd)),
    invasionRate: n ? finished.filter(g => g.outcome === 'invasion').length / n : null,
    publishRateTurn0: t0Finished.length ? t0Finished.filter(a => a.action_type === 'publish').length / t0Finished.length : null,
    avgWdPublished: avg(finished.filter(g => publishedGames.has(g.id)).map(g => g.final_wd)),
    avgWdHeld: avg(finished.filter(g => !publishedGames.has(g.id)).map(g => g.final_wd)),
  };
}
