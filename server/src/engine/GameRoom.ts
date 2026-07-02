import type {
  ActionSpec, Debrief, InjectType, Mode, Outcome, Phase, PlayerView, Role, SubmittedAction, TrajectoryPoint,
} from '@iwj/shared';
import { ALL_ROLES, JOURNALIST_ROLES, ROLE_META } from '@iwj/shared';
import { randomUUID } from 'node:crypto';
import { ROLE_CARDS, INITIAL_MOOD, INVASION_NARRATIVE } from '../content.js';
import { getActionSpec, getInjectSpec, validateAction, defaultAction, describeAction } from './actions.js';
import { resolveTurn, type GmOutput } from '../llm/gameMaster.js';
import { decideAiAction } from '../llm/aiPlayer.js';
import * as db from '../db.js';

export interface Member {
  token: string;
  name: string;
  role: Role | null;
  socketId: string | null;
  isHost: boolean;
  isAi: boolean;
  ready: boolean;
}

interface PendingInject {
  type: InjectType;
  deciders: Role[];
  context: string; // shown to deciders as injectPrompt
}

interface TimelineEntry {
  turn: number;
  keyMoment: string;
  wdDelta: number;
  wdRationale: string;
  actions: { actor: string; action: string }[];
  inject: string | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const AI_NAMES: Record<Role, string> = {
  journalist_1: 'Alex Berg', journalist_2: 'Miriam Voss', journalist_3: 'Tomas Krug',
  government: 'Minister Dahl', opposition: 'Lena Storm',
};

export class GameRoom {
  code: string;
  mode: Mode;
  finalTurn: number;
  injectBudget: number;
  phase: Phase = 'lobby';
  turn = 0;
  members: Member[] = [];
  scores = { wd: 50, gp: 55, at: { journalist_1: 30, journalist_2: 30, journalist_3: 30 } as Record<string, number> };
  pendingActions = new Map<Role, SubmittedAction>();
  lastGm: GmOutput | null = null;
  lastInjectNarrative: string | null = null;
  history: { turn: number; keyMoment: string; narrative: string }[] = [];
  scoreHistory: TrajectoryPoint[] = [{ label: 'start', wd: 50, gp: 55, at1: 30, at2: 30, at3: 30 }];
  timeline: TimelineEntry[] = [];
  publishedLeak = new Set<Role>();
  usedInjects = new Set<InjectType>();
  injectsFired = 0;
  pendingInject: PendingInject | null = null;
  persistentNotes: string[] = [];
  oneTimeContext: string | null = null;
  outcome: Outcome = 'completed';
  dbGameId: number | null = null;
  onChange: () => void = () => {};
  rng: () => number = Math.random;

  constructor(code: string, mode: Mode) {
    this.code = code;
    this.mode = mode;
    this.finalTurn = mode === 'demo' ? 2 : 5;
    this.injectBudget = mode === 'demo' ? 1 : 2;
  }

  // ---- lobby ----
  addMember(name: string, opts: { isHost?: boolean; isAi?: boolean; role?: Role | null } = {}): Member {
    const m: Member = {
      token: randomUUID(),
      name: name || 'Player',
      role: opts.role ?? null,
      socketId: null,
      isHost: opts.isHost ?? false,
      isAi: opts.isAi ?? false,
      ready: opts.isAi ?? false,
    };
    this.members.push(m);
    return m;
  }

  byToken(token: string): Member | undefined { return this.members.find(m => m.token === token); }
  byRole(role: Role): Member | undefined { return this.members.find(m => m.role === role); }

  claimRole(token: string, role: Role): string | null {
    if (this.phase !== 'lobby') return 'game already started';
    if (!ALL_ROLES.includes(role)) return 'unknown role';
    if (this.byRole(role)) return 'role already taken';
    const m = this.byToken(token);
    if (!m) return 'not in room';
    m.role = role;
    this.onChange();
    return null;
  }

  start(token: string, fillAi: boolean): string | null {
    const m = this.byToken(token);
    if (!m?.isHost) return 'only the host can start';
    if (this.phase !== 'lobby') return 'already started';
    if (!m.role) return 'claim a role first';
    // Seat humans who never picked a role before giving seats to AI
    for (const member of this.members) {
      if (member.role) continue;
      const free = ALL_ROLES.find(r => !this.byRole(r));
      if (free) member.role = free;
    }
    for (const role of ALL_ROLES) {
      if (!this.byRole(role)) {
        if (!fillAi) return `role unfilled: ${ROLE_META[role].short}`;
        this.addMember(AI_NAMES[role], { isAi: true, role });
      }
    }
    this.dbGameId = db.createGame(this.code, this.mode, this.members);
    this.phase = 'briefing';
    this.onChange();
    return null;
  }

  setReady(token: string): void {
    const m = this.byToken(token);
    if (!m || this.phase !== 'briefing') return;
    m.ready = true;
    if (this.members.every(x => x.ready)) this.startTurnPhase();
    else this.onChange();
  }

  // ---- turn flow ----
  requiredActors(): Role[] {
    if (this.phase === 'inject_decision') return this.pendingInject?.deciders ?? [];
    if (this.turn === 0) return [...JOURNALIST_ROLES];
    return [...ALL_ROLES];
  }

  specFor(role: Role): ActionSpec | null {
    if (this.phase === 'inject_decision') {
      return this.pendingInject && this.pendingInject.deciders.includes(role)
        ? getInjectSpec(this.pendingInject.type) : null;
    }
    if (this.phase !== 'actions') return null;
    if (!this.requiredActors().includes(role)) return null;
    return getActionSpec(role, this.turn, this.publishedLeak.has(role));
  }

  private startTurnPhase(): void {
    this.pendingActions.clear();
    this.phase = this.pendingInject ? 'inject_decision' : 'actions';
    this.onChange();
    this.scheduleAi();
  }

  private scheduleAi(): void {
    const phaseAtSchedule = this.phase;
    const turnAtSchedule = this.turn;
    for (const role of this.requiredActors()) {
      const m = this.byRole(role);
      if (!m?.isAi || this.pendingActions.has(role)) continue;
      const spec = this.specFor(role);
      if (!spec || !spec.fields.length) continue;
      const brief = this.lastGm ? this.lastGm.roleBriefs[role as keyof GmOutput['roleBriefs']] : null;
      const mood = this.lastGm?.publicMoodHint ?? INITIAL_MOOD;
      decideAiAction(role, this.turn, brief, mood, spec)
        .then(action => {
          if (this.phase !== phaseAtSchedule || this.turn !== turnAtSchedule) return; // stale
          this.submitAction(m.token, action);
        })
        .catch(err => console.error(`[ai] ${role} failed:`, err));
    }
  }

  submitAction(token: string, action: SubmittedAction): string | null {
    const m = this.byToken(token);
    if (!m?.role) return 'no role';
    if (this.phase !== 'actions' && this.phase !== 'inject_decision') return 'not accepting actions now';
    if (!this.requiredActors().includes(m.role)) return 'you are not acting this phase';
    if (this.pendingActions.has(m.role)) return 'already submitted';
    const spec = this.specFor(m.role);
    if (!spec) return 'no action available';
    const err = validateAction(spec, { choices: action.choices, freeText: (action.freeText || '').slice(0, 300) });
    if (err) return err;
    this.pendingActions.set(m.role, { choices: action.choices, freeText: (action.freeText || '').slice(0, 300) });
    if (this.requiredActors().every(r => this.pendingActions.has(r))) {
      if (this.phase === 'inject_decision') this.applyInjectDecision();
      else void this.resolve();
    } else {
      this.onChange();
    }
    return null;
  }

  forceSkip(token: string): string | null {
    const m = this.byToken(token);
    if (!m?.isHost) return 'only the host can force-skip';
    if (this.phase === 'briefing') {
      this.members.forEach(x => { x.ready = true; });
      this.startTurnPhase();
      return null;
    }
    if (this.phase !== 'actions' && this.phase !== 'inject_decision') return 'nothing to skip';
    for (const role of this.requiredActors()) {
      if (this.pendingActions.has(role)) continue;
      const spec = this.specFor(role);
      if (spec) this.pendingActions.set(role, defaultAction(spec));
    }
    if (this.phase === 'inject_decision') this.applyInjectDecision();
    else void this.resolve();
    return null;
  }

  // ---- inject decisions (mechanics are engine-owned; LLM only narrates via context) ----
  private applyInjectDecision(): void {
    const inj = this.pendingInject!;
    const decisions = new Map(this.pendingActions);
    this.pendingInject = null;
    this.pendingActions.clear();

    let resolution = '';
    if (inj.type === 'no_confidence') {
      const d = decisions.get('opposition');
      if (d && /call the vote/.test(d.choices.decision ?? '')) {
        const p = clamp((45 - this.scores.gp) / 45, 0.15, 0.85);
        const success = this.rng() < p;
        if (success) {
          const gov = this.byRole('government');
          const opp = this.byRole('opposition');
          if (gov && opp) { gov.role = 'opposition'; opp.role = 'government'; }
          this.scores.gp = 45;
          resolution = 'vote passed — government fell, roles swapped';
          this.oneTimeContext =
            'A vote of no confidence PASSED. The opposition leader now heads the government and the old government sits in opposition. A wary honeymoon begins.';
        } else {
          resolution = 'vote failed';
          this.oneTimeContext = 'A vote of no confidence FAILED narrowly. The government survives, visibly wounded.';
        }
      } else {
        resolution = 'opposition held fire';
      }
    } else if (inj.type === 'book_deal') {
      const [decider] = inj.deciders;
      const d = decisions.get(decider);
      if (d && /accept/.test(d.choices.decision ?? '')) {
        const tone = d.choices.tone ?? 'alarm-raising';
        resolution = `accepted (${tone})`;
        this.persistentNotes.push(
          `${ROLE_META[decider].label} signed a high-profile book deal about the scandal (tone: ${tone}); the book is shaping public discourse.`);
      } else {
        resolution = 'declined';
      }
    } else if (inj.type === 'tv_debate') {
      const lines = inj.deciders
        .map(r => {
          const d = decisions.get(r);
          return d ? `${ROLE_META[r].label} chose to ${d.choices.decision}${d.freeText ? ` ("${d.freeText}")` : ''}` : null;
        })
        .filter(Boolean)
        .join('; ');
      resolution = 'debate held';
      this.oneTimeContext = `A prime-time TV debate about the reporting aired: ${lines}.`;
    }
    if (this.dbGameId != null) db.recordInject(this.dbGameId, this.turn, inj.type, inj.context, resolution);
    this.lastInjectNarrative = this.oneTimeContext;
    this.phase = 'actions';
    this.onChange();
    this.scheduleAi();
  }

  // ---- resolution ----
  private async resolve(): Promise<void> {
    this.phase = 'resolving';
    this.onChange();

    const actions = [...this.pendingActions.entries()].map(([role, action]) => ({
      role, action, playerName: this.byRole(role)?.name ?? ROLE_META[role].short,
    }));
    for (const a of actions) {
      if (/publish/.test(a.action.choices.decision ?? '') && /leak|^publish$/.test(a.action.choices.decision ?? 'publish')) {
        if (a.action.choices.decision === 'publish' || a.action.choices.decision === 'publish the held leak documents') {
          this.publishedLeak.add(a.role);
        }
      }
    }

    const injectContext = [this.oneTimeContext, ...this.persistentNotes].filter(Boolean).join(' ') || null;
    this.oneTimeContext = null;

    const gm = await resolveTurn({
      mode: this.mode,
      turn: this.turn,
      finalTurn: this.finalTurn,
      scores: this.scores,
      actions,
      history: this.history.slice(-3),
      injectContext,
    });

    // engine-enforced caps; the LLM proposes, the engine disposes
    const dWd = clamp(Math.round(gm.scoreDeltas.wd), -15, 15);
    const dGp = clamp(Math.round(gm.scoreDeltas.gp), -15, 15);
    this.scores.wd = clamp(this.scores.wd + dWd, 0, 100);
    this.scores.gp = clamp(this.scores.gp + dGp, 0, 100);
    for (const r of JOURNALIST_ROLES) {
      const d = clamp(Math.round(gm.scoreDeltas.at[r as keyof GmOutput['scoreDeltas']['at']]), -20, 20);
      this.scores.at[r] = clamp(this.scores.at[r] + d, 0, 100);
    }

    this.lastGm = gm;
    this.history.push({ turn: this.turn, keyMoment: gm.keyMoment, narrative: gm.publicNarrative });
    this.scoreHistory.push({
      label: `week ${this.turn + 1}`, wd: this.scores.wd, gp: this.scores.gp,
      at1: this.scores.at.journalist_1, at2: this.scores.at.journalist_2, at3: this.scores.at.journalist_3,
    });
    this.timeline.push({
      turn: this.turn,
      keyMoment: gm.keyMoment,
      wdDelta: dWd,
      wdRationale: gm.deltaRationales.wd,
      actions: actions.map(a => ({
        actor: `${ROLE_META[a.role].label} (${a.playerName})`,
        action: describeAction(a.action),
      })),
      inject: this.lastInjectNarrative,
    });
    if (this.dbGameId != null) {
      db.recordTurn(this.dbGameId, this.turn, gm, actions, this.scores);
    }
    this.lastInjectNarrative = null;

    // end conditions
    const invasion = this.scores.wd <= 5 && (this.scores.wd === 0 || this.rng() < 0.5);
    if (invasion) return this.finish('invasion');
    if (this.turn >= this.finalTurn) return this.finish('completed');

    this.maybeSelectInject();
    this.turn += 1;
    this.startTurnPhase();
  }

  private maybeSelectInject(): void {
    if (this.injectsFired >= this.injectBudget) return;
    const maxAt = Math.max(...JOURNALIST_ROLES.map(r => this.scores.at[r]));
    const topJournalist = JOURNALIST_ROLES
      .filter(r => this.publishedLeak.has(r))
      .sort((a, b) => this.scores.at[b] - this.scores.at[a])[0];
    const anyPublished = this.publishedLeak.size > 0;
    const rules: { type: InjectType; when: boolean; prob: number; deciders: Role[]; context: string }[] = [
      {
        type: 'no_confidence',
        when: this.scores.gp <= 25 && this.turn + 1 >= 2,
        prob: 0.7,
        deciders: ['opposition'],
        context: 'Backbenchers are whispering: the government might not survive a vote of no confidence.',
      },
      {
        type: 'tv_debate',
        when: maxAt >= 60 && anyPublished,
        prob: 0.5,
        deciders: [...JOURNALIST_ROLES],
        context: 'The country’s biggest talk show wants the journalists behind the readiness story live on air tonight.',
      },
      {
        type: 'book_deal',
        when: maxAt >= 70 && !!topJournalist,
        prob: 0.4,
        deciders: topJournalist ? [topJournalist] : [],
        context: 'A major publisher smells a bestseller in the scandal.',
      },
    ];
    for (const r of rules) {
      if (!r.when || this.usedInjects.has(r.type) || !r.deciders.length) continue;
      if (this.rng() >= r.prob) continue;
      this.usedInjects.add(r.type);
      this.injectsFired += 1;
      this.pendingInject = { type: r.type, deciders: r.deciders, context: r.context };
      return;
    }
  }

  private finish(outcome: Outcome): void {
    this.outcome = outcome;
    if (outcome === 'invasion') {
      this.timeline[this.timeline.length - 1].inject = INVASION_NARRATIVE;
      if (this.dbGameId != null) db.recordInject(this.dbGameId, this.turn, 'invasion', INVASION_NARRATIVE, 'game over');
    }
    if (this.dbGameId != null) db.finishGame(this.dbGameId, outcome, this.scores);
    this.phase = 'reveal';
    this.onChange();
  }

  // ---- views: the role filter. WD never leaves this function before reveal. ----
  buildView(member: Member): PlayerView {
    const role = member.role;
    const waitingOn: string[] = [];
    if (this.phase === 'briefing') {
      waitingOn.push(...this.members.filter(m => !m.ready).map(m => m.name));
    } else if (this.phase === 'actions' || this.phase === 'inject_decision') {
      waitingOn.push(...this.requiredActors()
        .filter(r => !this.pendingActions.has(r))
        .map(r => {
          const m = this.byRole(r);
          return m ? (m.isAi ? `${m.name} (AI)` : m.name) : ROLE_META[r].short;
        }));
    }

    const visibleScores: { label: string; value: number }[] = [];
    if (role && this.phase !== 'lobby') {
      if (JOURNALIST_ROLES.includes(role)) {
        visibleScores.push({ label: ROLE_META[role].scoreLabel, value: this.scores.at[role] });
      } else {
        visibleScores.push({ label: ROLE_META[role as Role].scoreLabel, value: this.scores.gp });
      }
    }

    const debrief: Debrief | null = this.lastGm ? {
      publicNarrative: this.lastGm.publicNarrative,
      frontPages: this.lastGm.frontPages,
      otherActions: this.lastGm.otherActions,
      keyMoment: this.lastGm.keyMoment,
      injectNarrative: this.lastInjectNarrative,
    } : null;

    const spec = role ? this.specFor(role) : null;
    const submitted = !!role && this.pendingActions.has(role);

    return {
      roomCode: this.code,
      mode: this.mode,
      phase: this.phase,
      turn: this.turn,
      finalTurn: this.finalTurn,
      myRole: role,
      roleLabel: role ? ROLE_META[role].label : null,
      playerName: member.name,
      isHost: member.isHost,
      players: this.members.map(m => ({
        role: m.role, name: m.name, connected: m.isAi || m.socketId != null, isAi: m.isAi, isHost: m.isHost,
      })),
      roleCard: role && this.phase === 'briefing' ? ROLE_CARDS[role] : null,
      brief: role && this.lastGm ? sanitizeBrief(this.lastGm.roleBriefs[role as keyof GmOutput['roleBriefs']]) : null,
      moodHint: this.lastGm?.publicMoodHint ?? INITIAL_MOOD,
      visibleScores,
      lastDebrief: this.phase === 'lobby' || this.phase === 'briefing' ? null : debrief,
      actionSpec: submitted ? null : spec,
      submitted,
      waitingOn,
      injectPrompt: this.phase === 'inject_decision' ? this.pendingInject?.context ?? null : null,
      reveal: this.phase === 'reveal' ? this.buildReveal() : null,
    };
  }

  private buildReveal() {
    return {
      outcome: this.outcome,
      finalScores: { wd: this.scores.wd, gp: this.scores.gp, at: { ...this.scores.at } },
      trajectory: this.scoreHistory,
      timeline: this.timeline,
      allTime: db.allTimeStats(),
    };
  }
}

// Numbers must never ride along in narrative text near the hidden score's name.
function sanitizeBrief(text: string): string {
  return text.replace(/\b(WD|willingness to defend|willingness)\b\D{0,20}\d+/gi, '$1');
}
