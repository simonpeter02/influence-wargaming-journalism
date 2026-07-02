import { useState } from 'react';
import { ALL_ROLES, ROLE_META } from '@iwj/shared';
import type { Role } from '@iwj/shared';
import { createRoom, joinRoom, saveSession } from '../socket';

interface Props {
  onError: (msg: string) => void;
}

type Choice = 'real' | 'demo';

export default function Landing({ onError }: Props) {
  const [name, setName] = useState('');
  const [choice, setChoice] = useState<Choice | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [demoRole, setDemoRole] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    const res = await createRoom({ mode: 'real', name: name.trim() });
    setBusy(false);
    if (!res.ok || !res.token || !res.roomCode) {
      onError(res.error ?? 'Could not create the room.');
      return;
    }
    saveSession(res.roomCode, res.token);
  };

  const join = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setBusy(true);
    const res = await joinRoom({ roomCode: code, name: name.trim() });
    setBusy(false);
    if (!res.ok || !res.token) {
      onError(res.error ?? 'Could not join that room.');
      return;
    }
    saveSession(res.roomCode ?? code, res.token);
  };

  const startDemo = async () => {
    if (!demoRole) return;
    setBusy(true);
    const res = await createRoom({ mode: 'demo', name: name.trim(), role: demoRole });
    setBusy(false);
    if (!res.ok || !res.token || !res.roomCode) {
      onError(res.error ?? 'Could not start the demo.');
      return;
    }
    saveSession(res.roomCode, res.token);
  };

  return (
    <div className="wrap">
      <h1>Willingness to Defend</h1>
      <p className="sub">
        A wargame about hot information, journalism, and whether a public would still fight for its country.
      </p>

      <div style={{ margin: '0 0 14px' }}>
        <label className="muted" htmlFor="pname">Your name</label>
        <input
          id="pname"
          type="text"
          placeholder="e.g. Simon"
          maxLength={40}
          style={{ marginTop: 6 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="rolegrid">
        <button
          className={`card rolecard${choice === 'real' ? ' sel' : ''}`}
          onClick={() => setChoice('real')}
        >
          <h3>Real game &nbsp;▸</h3>
          <div className="muted">5 human players over the network. Create a room or join one with a code.</div>
        </button>
        <button
          className={`card rolecard${choice === 'demo' ? ' sel' : ''}`}
          onClick={() => setChoice('demo')}
        >
          <h3>Demo game &nbsp;▸</h3>
          <div className="muted">Solo, ~3 minutes. You play one role; the simulation plays everyone else.</div>
        </button>
      </div>

      {choice === 'real' && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Real game</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="primary" disabled={busy} onClick={() => void create()}>
              Create a room
            </button>
            <span className="muted">or join one:</span>
            <input
              type="text"
              placeholder="Room code"
              maxLength={8}
              style={{ width: 140, textTransform: 'uppercase' }}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void join(); }}
            />
            <button disabled={busy || joinCode.trim().length === 0} onClick={() => void join()}>
              Join
            </button>
          </div>
        </div>
      )}

      {choice === 'demo' && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Choose your role</h2>
          <div className="rolegrid">
            {ALL_ROLES.map((r) => (
              <button
                key={r}
                className={`card rolecard${demoRole === r ? ' sel' : ''}`}
                onClick={() => setDemoRole(r)}
              >
                <h3>{ROLE_META[r].emoji} {ROLE_META[r].label}</h3>
                <div className="muted">Visible score: {ROLE_META[r].scoreLabel}</div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <button className="primary" disabled={busy || !demoRole} onClick={() => void startDemo()}>
              {busy ? 'Starting…' : 'Start demo game'}
            </button>
          </div>
        </div>
      )}

      <p className="muted">
        One score is tracked in secret throughout the game and revealed only at the end.
      </p>
    </div>
  );
}
