// Drives a full 5-player game through the real socket layer with the stub LLM.
// Run: npm run test:engine   (asserts phases, hidden-info filtering, reveal)
import { io as Client, type Socket } from 'socket.io-client';
import type { PlayerView, Role } from '@iwj/shared';
import { ALL_ROLES, EV, JOURNALIST_ROLES } from '@iwj/shared';
import { startServer } from './index.js';
import { rooms } from './sockets.js';

const PORT = 3999;
const url = `http://localhost:${PORT}`;
let failures = 0;
const check = (cond: boolean, msg: string) => {
  if (!cond) { failures += 1; console.error(`  FAIL: ${msg}`); }
};

interface P { role: Role; socket: Socket; view: PlayerView | null; token: string }

const emit = <T = Record<string, unknown>>(s: Socket, ev: string, payload: unknown): Promise<T> =>
  new Promise(resolve => s.emit(ev, payload, resolve));

const until = (p: P, pred: (v: PlayerView) => boolean, label: string): Promise<PlayerView> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${label} (${p.role}, phase=${p.view?.phase})`)), 15000);
    const handler = (v: PlayerView) => {
      p.view = v;
      if (pred(v)) { clearTimeout(t); p.socket.off(EV.VIEW, handler); resolve(v); }
    };
    p.socket.on(EV.VIEW, handler);
    if (p.view && pred(p.view)) { clearTimeout(t); p.socket.off(EV.VIEW, handler); resolve(p.view); }
  });

function assertNoWdLeak(v: PlayerView) {
  check(!v.visibleScores.some(s => /willing|defend|wd/i.test(s.label)), `WD leaked in visibleScores for ${v.myRole}`);
  if (v.phase !== 'reveal') check(v.reveal == null, `reveal present before endgame for ${v.myRole}`);
  if (JOURNALIST_ROLES.includes(v.myRole!)) {
    check(!v.visibleScores.some(s => /popularity/i.test(s.label)), `GP leaked to journalist ${v.myRole}`);
  }
}

async function main() {
  process.env.LLM_STUB = '1';
  const { httpServer, io } = startServer(PORT);

  console.log('1. lobby: create + 4 join + claim roles');
  const players: P[] = [];
  const hostSocket = Client(url);
  const created = await emit<{ ok: boolean; roomCode: string; token: string }>(hostSocket, EV.CREATE, { mode: 'real', name: 'Host' });
  check(created.ok, 'create ok');
  const roomCode = created.roomCode;
  rooms.get(roomCode)!.rng = () => 0.99; // scenario 1 tests pure turn flow; scenario 7 forces all injects
  players.push({ role: 'journalist_1', socket: hostSocket, view: null, token: created.token });
  hostSocket.on(EV.VIEW, v => { players[0].view = v; });

  for (const role of ALL_ROLES.slice(1)) {
    const s = Client(url);
    const joined = await emit<{ ok: boolean; token: string }>(s, EV.JOIN, { roomCode, name: `P-${role}` });
    check(joined.ok, `join ok for ${role}`);
    const p: P = { role, socket: s, view: null, token: joined.token };
    s.on(EV.VIEW, v => { p.view = v; });
    players.push(p);
  }
  for (const p of players) {
    const r = await emit<{ ok: boolean }>(p.socket, EV.CLAIM, { role: p.role });
    check(r.ok, `claim ${p.role}`);
  }

  console.log('2. start → briefing → ready-up');
  const dup = await emit<{ ok: boolean }>(players[1].socket, EV.START, {});
  check(!dup.ok, 'non-host cannot start');
  check((await emit<{ ok: boolean }>(hostSocket, EV.START, {})).ok, 'host starts');
  await Promise.all(players.map(p => until(p, v => v.phase === 'briefing', 'briefing')));
  check(players.every(p => p.view!.roleCard != null), 'role cards shown');
  players.forEach(p => assertNoWdLeak(p.view!));
  for (const p of players) await emit(p.socket, EV.READY, {});

  console.log('3. turn 0: journalists only');
  await Promise.all(players.map(p => until(p, v => v.phase === 'actions', 'turn0 actions')));
  const j = players.filter(p => JOURNALIST_ROLES.includes(p.role));
  const g = players.filter(p => !JOURNALIST_ROLES.includes(p.role));
  check(j.every(p => p.view!.actionSpec != null), 'journalists get turn-0 form');
  check(g.every(p => p.view!.actionSpec == null), 'gov/opp wait at turn 0');
  const early = await emit<{ ok: boolean }>(g[0].socket, EV.ACTION, { choices: { decision: 'x' }, freeText: '' });
  check(!early.ok, 'gov cannot act at turn 0');
  const bad = await emit<{ ok: boolean }>(j[0].socket, EV.ACTION, { choices: { decision: 'nonsense' }, freeText: '' });
  check(!bad.ok, 'invalid choice rejected');
  await emit(j[0].socket, EV.ACTION, { choices: { decision: 'publish', format: 'public call to action' }, freeText: 'they lied' });
  await emit(j[1].socket, EV.ACTION, { choices: { decision: 'hold' }, freeText: '' });
  const progress = await until(g[0], v => v.waitingOn.length === 1, 'progress update');
  check(progress.waitingOn.length === 1, 'waitingOn shows the one missing journalist');
  await emit(j[2].socket, EV.ACTION, { choices: { decision: 'publish', format: 'government-critical exposé' }, freeText: '' });

  console.log('4. turns 1..5: everyone acts');
  for (let turn = 1; turn <= 5; turn++) {
    await Promise.all(players.map(p => until(p, v => v.phase !== 'resolving' && (v.turn === turn || v.phase === 'reveal'), `turn ${turn}`)));
    if (players[0].view!.phase === 'reveal') break; // invasion end is possible in principle
    players.forEach(p => assertNoWdLeak(p.view!));
    check(players[0].view!.lastDebrief != null, `debrief present at turn ${turn}`);
    for (const p of players) {
      const v = await until(p, x => x.turn === turn && (x.phase === 'actions' || x.phase === 'inject_decision'), `form turn ${turn}`);
      if (v.actionSpec) {
        const choices: Record<string, string> = {};
        for (const f of v.actionSpec.fields) {
          if (f.type === 'choice' && (!f.showIf || choices[f.showIf.field] === f.showIf.value)) {
            choices[f.name] = f.options![0].value;
          }
        }
        const r = await emit<{ ok: boolean; error?: string }>(p.socket, EV.ACTION, { choices, freeText: '' });
        check(r.ok, `submit turn ${turn} ${p.role}: ${r.error ?? ''}`);
      }
    }
    // if an inject_decision phase followed, deciders already got new specs via the loop above on next iteration
    const v0 = await until(players[0], v => v.phase === 'actions' || v.phase === 'inject_decision' || v.phase === 'reveal', 'post-submit');
    if (v0.phase === 'inject_decision') {
      console.log('   inject decision fired');
      for (const p of players) {
        const v = p.view!;
        if (v.actionSpec) {
          const choices: Record<string, string> = {};
          for (const f of v.actionSpec.fields) {
            if (f.type === 'choice' && (!f.showIf || choices[f.showIf.field] === f.showIf.value)) choices[f.name] = f.options![0].value;
          }
          await emit(p.socket, EV.ACTION, { choices, freeText: '' });
        }
      }
    }
  }

  console.log('5. reveal');
  await Promise.all(players.map(p => until(p, v => v.phase === 'reveal', 'reveal')));
  const r = players[0].view!.reveal!;
  check(r.trajectory.length >= 4, `trajectory has entries (${r.trajectory.length})`);
  check(typeof r.finalScores.wd === 'number', 'final WD revealed');
  check(r.timeline.length >= 3, 'timeline populated');
  check(r.allTime.gamesPlayed >= 1, 'all-time stats include this game');
  check(r.allTime.publishRateTurn0 != null && r.allTime.publishRateTurn0 > 0.5, `turn-0 publish rate recorded (${r.allTime.publishRateTurn0})`);

  console.log('6. reconnect survives');
  players[1].socket.disconnect();
  const s2 = Client(url);
  const resumed = await emit<{ ok: boolean }>(s2, EV.RESUME, { token: players[1].token });
  check(resumed.ok, 'resume with token');

  await partialRoomScenario();

  players.forEach(p => p.socket.connected && p.socket.disconnect());
  s2.disconnect();
  io.close();
  httpServer.close();
  console.log(failures ? `\n${failures} FAILURES` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
}

// Partial room: 2 humans (one never claims a role), AI fills the rest, game runs to reveal.
async function partialRoomScenario() {
  console.log('7. partial room: 2 humans + AI fill to reveal');
  const host = Client(url);
  const created = await emit<{ ok: boolean; roomCode: string; token: string }>(host, EV.CREATE, { mode: 'real', name: 'Host2' });
  const p0: P = { role: 'journalist_1', socket: host, view: null, token: created.token };
  host.on(EV.VIEW, v => { p0.view = v; });
  check((await emit<{ ok: boolean }>(host, EV.CLAIM, { role: 'journalist_1' })).ok, 'host claims journalist_1');

  const s = Client(url);
  const joined = await emit<{ ok: boolean; token: string }>(s, EV.JOIN, { roomCode: created.roomCode, name: 'Roleless' });
  const p1: P = { role: 'journalist_2', socket: s, view: null, token: joined.token }; // never claims — must be auto-seated
  s.on(EV.VIEW, v => { p1.view = v; });

  rooms.get(created.roomCode)!.rng = () => 0; // every eligible inject fires: covers press conference + decisions
  check((await emit<{ ok: boolean; error?: string }>(host, EV.START, { fillAi: true })).ok, 'start with 2/5 humans');
  await until(p1, v => v.phase === 'briefing', 'partial-room briefing');
  check(p1.view!.myRole != null, `roleless human auto-seated (got ${p1.view!.myRole})`);
  check(p0.view!.players.filter(x => x.isAi).length === 3, `3 AI seats filled (got ${p0.view!.players.filter(x => x.isAi).length})`);
  check(p0.view!.players.length === 5, 'exactly 5 seats total');
  await emit(host, EV.READY, {});
  await emit(s, EV.READY, {});

  // Generic driver: submit defaults / answer interviews whenever prompted, until reveal.
  const humans = [p0, p1];
  let sawInterview = false;
  let sawDynamicOptions = false;
  const deadline = Date.now() + 60000;
  while (!humans.every(p => p.view?.phase === 'reveal')) {
    if (Date.now() > deadline) throw new Error(`partial-room game stalled (phases: ${humans.map(p => p.view?.phase).join(',')})`);
    for (const p of humans) {
      const v = p.view;
      if (!v) continue;
      if (v.phase === 'interview' && v.interview?.awaitingReply) {
        sawInterview = true;
        await emit(p.socket, EV.INTERVIEW, { text: 'On the record: we take responsibility and we will fix this.' });
      }
      if ((v.phase === 'actions' || v.phase === 'inject_decision') && v.actionSpec && !v.submitted) {
        if (v.phase === 'actions' && v.turn >= 1 &&
            v.actionSpec.fields[0].options!.some(o => /whistleblower|paper trail|garrisons|readiness audit|fact-check|doorstep/.test(o.value))) {
          sawDynamicOptions = true;
        }
        const choices: Record<string, string> = {};
        for (const f of v.actionSpec.fields) {
          if (f.type === 'choice' && (!f.showIf || choices[f.showIf.field] === f.showIf.value)) choices[f.name] = f.options![0].value;
        }
        await emit(p.socket, EV.ACTION, { choices, freeText: '' }); // stale-view races are fine; server rejects dupes
      }
    }
    await new Promise(r => setTimeout(r, 120));
  }
  const rv = p1.view!.reveal!;
  check(rv.trajectory.length >= 3, `partial-room reveal has trajectory (${rv.trajectory.length} pts)`);
  check(['completed', 'invasion'].includes(rv.outcome), `outcome sane (${rv.outcome})`);
  check(sawInterview, 'press-conference interview ran (both humans questioned)');
  check(sawDynamicOptions, 'GM-generated situation-specific options offered');
  console.log(`   partial-room game finished: outcome=${rv.outcome}, final WD=${rv.finalScores.wd}`);
  host.disconnect();
  s.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
