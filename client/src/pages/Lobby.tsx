import { useState } from 'react';
import { ALL_ROLES, ROLE_META } from '@iwj/shared';
import type { PlayerView, Role } from '@iwj/shared';
import { claimRole, startGame } from '../socket';

interface Props {
  view: PlayerView;
  onError: (msg: string) => void;
}

export default function Lobby({ view, onError }: Props) {
  const [busy, setBusy] = useState(false);

  const claimed = new Set<Role>(
    view.players.map((p) => p.role).filter((r): r is Role => r !== null),
  );
  const unclaimed = ALL_ROLES.filter((r) => !claimed.has(r));

  const claim = async (role: Role) => {
    setBusy(true);
    const res = await claimRole(role);
    setBusy(false);
    if (!res.ok) onError(res.error ?? 'Could not claim that role.');
  };

  const start = async () => {
    setBusy(true);
    const res = await startGame();
    setBusy(false);
    if (!res.ok) onError(res.error ?? 'Could not start the game.');
  };

  return (
    <div className="wrap">
      <h1>Lobby</h1>
      <p className="sub">Other players join from their own laptops by entering this room code.</p>

      <div className="card" style={{ textAlign: 'center' }}>
        <div className="muted">ROOM CODE</div>
        <div className="roomcode">{view.roomCode}</div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Players</h2>
        {view.players.map((p, i) => (
          <div className="playerrow" key={i}>
            <span
              className={`conn-dot ${p.connected ? 'on' : 'off'}`}
              title={p.connected ? 'connected' : 'disconnected'}
            />
            <b>{p.name}</b>
            <span className="secondary">
              {p.role ? `${ROLE_META[p.role].emoji} ${ROLE_META[p.role].label}` : '— no role yet'}
            </span>
            {p.isHost && <span className="hosttag">host</span>}
            {p.isAi && <span className="hosttag">AI</span>}
          </div>
        ))}
      </div>

      {view.myRole === null && unclaimed.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Claim a role</h2>
          <div className="rolegrid">
            {unclaimed.map((r) => (
              <button
                key={r}
                className="card rolecard"
                disabled={busy}
                onClick={() => void claim(r)}
              >
                <h3>{ROLE_META[r].emoji} {ROLE_META[r].label}</h3>
                <div className="muted">Visible score: {ROLE_META[r].scoreLabel}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {view.myRole !== null && (
        <p className="secondary">
          You are {ROLE_META[view.myRole].emoji} <b>{view.roleLabel ?? ROLE_META[view.myRole].label}</b>.
        </p>
      )}

      {view.isHost ? (
        <div style={{ marginTop: 18 }}>
          <button
            className="primary"
            disabled={busy || view.myRole === null}
            onClick={() => void start()}
          >
            Start (empty seats become AI)
          </button>
          {view.myRole === null && (
            <div className="muted" style={{ marginTop: 8 }}>Claim a role before starting.</div>
          )}
        </div>
      ) : (
        <p className="muted">Waiting for the host to start the game…</p>
      )}
    </div>
  );
}
