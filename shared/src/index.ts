// Shared contracts between server and client. Types + static role metadata only — no runtime deps.

export type Role = 'journalist_1' | 'journalist_2' | 'journalist_3' | 'government' | 'opposition';
export const ALL_ROLES: Role[] = ['journalist_1', 'journalist_2', 'journalist_3', 'government', 'opposition'];
export const JOURNALIST_ROLES: Role[] = ['journalist_1', 'journalist_2', 'journalist_3'];

export type Mode = 'real' | 'demo';
export type Phase = 'lobby' | 'briefing' | 'inject_decision' | 'interview' | 'actions' | 'resolving' | 'reveal';

export type InjectType = 'no_confidence' | 'invasion' | 'tv_debate' | 'book_deal' | 'press_conference';
export type Outcome = 'completed' | 'invasion' | 'abandoned';

export const ROLE_META: Record<Role, { label: string; short: string; outlet?: string; scoreLabel: string; emoji: string }> = {
  journalist_1: { label: 'Journalist — The Herald', short: 'Herald', outlet: 'The Herald', scoreLabel: 'Your Attention Score', emoji: '🗞️' },
  journalist_2: { label: 'Journalist — The Sentinel', short: 'Sentinel', outlet: 'The Sentinel', scoreLabel: 'Your Attention Score', emoji: '📰' },
  journalist_3: { label: 'Journalist — Daily Courier', short: 'Courier', outlet: 'Daily Courier', scoreLabel: 'Your Attention Score', emoji: '✍️' },
  government: { label: 'Government Spokesperson', short: 'Government', scoreLabel: 'Government Popularity', emoji: '🏛️' },
  opposition: { label: 'Opposition Leader', short: 'Opposition', scoreLabel: 'Government Popularity', emoji: '📣' },
};

export interface ChoiceOption { value: string; label: string }
export interface ActionField {
  name: string;
  label: string;
  type: 'choice' | 'text';
  options?: ChoiceOption[];
  showIf?: { field: string; value: string };
}
export interface ActionSpec { prompt: string; fields: ActionField[] }
export interface SubmittedAction { choices: Record<string, string>; freeText: string }

export interface FrontPage { outlet: string; headline: string; subhead: string; tone: string }
export interface Debrief {
  publicNarrative: string;
  frontPages: FrontPage[];
  otherActions: { actor: string; summary: string }[];
  keyMoment: string;
  injectNarrative: string | null;
}

export interface LobbyPlayer {
  role: Role | null;
  name: string;
  connected: boolean;
  isAi: boolean;
  isHost: boolean;
}

export interface AllTimeStats {
  gamesPlayed: number;
  avgFinalWd: number | null;
  invasionRate: number | null;      // 0..1
  publishRateTurn0: number | null;  // 0..1 across all journalist turn-0 decisions ever
  avgWdPublished: number | null;    // avg final WD in games where the leak ran at turn 0
  avgWdHeld: number | null;         // avg final WD in games where it did not
}

export interface TrajectoryPoint { label: string; wd: number; gp: number; at1: number; at2: number; at3: number }

export interface RevealData {
  outcome: Outcome;
  finalScores: { wd: number; gp: number; at: Record<string, number> };
  trajectory: TrajectoryPoint[];
  timeline: {
    turn: number;
    keyMoment: string;
    wdDelta: number;
    wdRationale: string;
    actions: { actor: string; action: string }[];
    inject: string | null;
  }[];
  allTime: AllTimeStats;
}

export interface PlayerView {
  roomCode: string;
  mode: Mode;
  phase: Phase;
  turn: number;            // 0..finalTurn
  finalTurn: number;       // 5 real, 2 demo
  myRole: Role | null;     // null while unclaimed in lobby
  roleLabel: string | null;
  playerName: string;
  isHost: boolean;
  players: LobbyPlayer[];
  roleCard: string | null;             // full role briefing text (briefing phase; journalists keep hot info)
  brief: string | null;                // assistant brief for the current turn (from last GM output)
  moodHint: string;                    // qualitative public mood — never numbers
  visibleScores: { label: string; value: number }[];  // role-filtered; WD never appears here
  lastDebrief: Debrief | null;
  actionSpec: ActionSpec | null;       // form to render; null if not acting or already submitted
  submitted: boolean;
  waitingOn: string[];                 // player names we are waiting for in this phase
  injectPrompt: string | null;         // shown during inject_decision to the decider(s)
  interview: InterviewState | null;    // set during phase 'interview' for players being interviewed
  reveal: RevealData | null;           // only set in phase 'reveal'
}

export interface InterviewState {
  messages: { from: 'interviewer' | 'you'; text: string }[];
  awaitingReply: boolean;  // true when the interviewer has asked and it is your turn to answer
  done: boolean;
}

// ---- socket protocol ----
// C→S (all with ack callback {ok:boolean, error?:string, ...}):
//   'room:create'    {mode, name, role?}          ack + {roomCode, token}
//   'room:join'      {roomCode, name}             ack + {token}
//   'role:claim'     {role}                       ack
//   'game:start'     {fillAi?:boolean}            ack   (host only; fillAi fills empty seats with AI)
//   'player:ready'   {}                           ack   (briefing ready-up / debrief continue)
//   'action:submit'  {choices, freeText}          ack
//   'interview:reply' {text}                      ack   (answer the interviewer during phase 'interview')
//   'session:resume' {token}                      ack
//   'host:forceskip' {}                           ack   (host skips missing/stalled actors)
// S→C:
//   'view'  PlayerView   — the only state event; sent per-socket after every change
export const EV = {
  CREATE: 'room:create',
  JOIN: 'room:join',
  CLAIM: 'role:claim',
  START: 'game:start',
  READY: 'player:ready',
  ACTION: 'action:submit',
  INTERVIEW: 'interview:reply',
  RESUME: 'session:resume',
  FORCESKIP: 'host:forceskip',
  VIEW: 'view',
} as const;
