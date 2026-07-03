import { useEffect, useRef, useState } from 'react';
import type { InterviewState } from '@iwj/shared';
import { sendInterviewReply } from '../socket';
import WaitingNote from './WaitingNote';

interface Props {
  interview: InterviewState;
  waitingOn: string[];
  onError: (msg: string) => void;
}

/** One-on-one press-conference chat: the moderator asks, you answer, a follow-up reacts to you. */
export default function InterviewChat({ interview, waitingOn, onError }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [interview.messages.length, interview.awaitingReply]);

  const send = async () => {
    const answer = text.trim();
    if (!answer || busy) return;
    setBusy(true);
    const res = await sendInterviewReply(answer);
    setBusy(false);
    if (!res.ok) onError(res.error ?? 'Could not send your answer.');
    else setText('');
  };

  if (interview.done) {
    return (
      <WaitingNote
        title="Your interview is over. The cameras move on."
        names={waitingOn}
      />
    );
  }

  return (
    <div className="card">
      <div className="muted" style={{ marginBottom: 10 }}>LIVE — NATIONAL PRESS CONFERENCE · YOU ARE AT THE PODIUM</div>
      <div className="chatlog">
        {interview.messages.map((m, i) => (
          <div key={i} className={`bubble ${m.from === 'you' ? 'me' : 'them'}`}>
            <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>
              {m.from === 'you' ? 'You' : 'Moderator'}
            </div>
            {m.text}
          </div>
        ))}
        {!interview.awaitingReply && (
          <div className="bubble them muted">The moderator is choosing the next question…</div>
        )}
        <div ref={endRef} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <textarea
          rows={2}
          value={text}
          maxLength={400}
          placeholder={interview.awaitingReply ? 'Your answer, on the record…' : 'Wait for the question…'}
          disabled={!interview.awaitingReply || busy}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
          style={{ flex: 1 }}
        />
        <button
          className="primary"
          disabled={!interview.awaitingReply || busy || !text.trim()}
          onClick={() => void send()}
        >
          Answer
        </button>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        Everything you say here is public and will shape this week&rsquo;s coverage.
      </div>
    </div>
  );
}
