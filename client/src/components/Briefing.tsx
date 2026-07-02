import { useState } from 'react';
import { ROLE_META } from '@iwj/shared';
import type { PlayerView } from '@iwj/shared';
import { sendReady } from '../socket';
import WaitingNote from './WaitingNote';

interface Props {
  view: PlayerView;
  onError: (msg: string) => void;
}

/** Full-screen role briefing: role card paragraphs, motivation, ready-up. */
export default function Briefing({ view, onError }: Props) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // The server waits on us until we ready up.
  const stillOnUs = view.waitingOn.includes(view.playerName);
  const paragraphs = (view.roleCard ?? '').split('\n\n').filter((p) => p.trim().length > 0);
  const motivation = view.myRole ? ROLE_META[view.myRole].scoreLabel : null;

  const ready = async () => {
    setSending(true);
    const res = await sendReady();
    setSending(false);
    if (!res.ok) onError(res.error ?? 'Could not ready up.');
    else setSent(true);
  };

  return (
    <div className="wrap">
      <h1>
        {view.myRole ? `${ROLE_META[view.myRole].emoji} ` : ''}
        {view.roleLabel ?? 'Your role'}
      </h1>
      <p className="sub">Read your briefing. The game begins once everyone is ready.</p>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Your briefing</h2>
        {paragraphs.map((p, i) => (
          <p className="secondary" key={i} style={{ whiteSpace: 'pre-wrap' }}>{p}</p>
        ))}
        {motivation && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Your motivation — the score you can see: <b style={{ color: 'var(--text-primary)' }}>{motivation}</b>.
            One other score is tracked in secret all game and revealed only at the end.
          </p>
        )}
      </div>
      {sent || !stillOnUs ? (
        <WaitingNote title="You are ready." names={view.waitingOn.filter((n) => n !== view.playerName)} />
      ) : (
        <button className="primary" disabled={sending} onClick={() => void ready()}>
          I understand my role
        </button>
      )}
    </div>
  );
}
