import { useState } from 'react';
import type { PlayerView, SubmittedAction } from '@iwj/shared';
import { submitAction, forceSkip } from '../socket';
import ActionForm from '../components/ActionForm';
import DebriefView from '../components/DebriefView';
import Briefing from '../components/Briefing';
import InterviewChat from '../components/InterviewChat';
import ScoreBadges from '../components/ScoreBadges';
import WaitingNote from '../components/WaitingNote';

interface Props {
  view: PlayerView;
  onError: (msg: string) => void;
}

/** Phase router for the in-game screens: briefing, actions, inject_decision. */
export default function GameScreen({ view, onError }: Props) {
  const [busy, setBusy] = useState(false);

  const submit = async (action: SubmittedAction) => {
    setBusy(true);
    const res = await submitAction(action);
    setBusy(false);
    if (!res.ok) onError(res.error ?? 'Could not submit your action.');
    window.scrollTo(0, 0);
  };

  const skip = async () => {
    const res = await forceSkip();
    if (!res.ok) onError(res.error ?? 'Could not force-skip.');
  };

  const forceSkipButton = view.isHost && view.waitingOn.length > 0 && (
    <button className="small" title="Host: skip missing or stalled players" onClick={() => void skip()}>
      Force skip
    </button>
  );

  if (view.phase === 'briefing') {
    return (
      <>
        <Briefing view={view} onError={onError} />
        {forceSkipButton && (
          <div className="wrap" style={{ paddingTop: 0, paddingBottom: 40 }}>{forceSkipButton}</div>
        )}
      </>
    );
  }

  if (view.phase === 'inject_decision') {
    return (
      <div className="modalwrap">
        <div className="modal">
          {view.actionSpec && !view.submitted ? (
            <div className="card inject-card" style={{ margin: 0 }}>
              <div className="muted" style={{ marginBottom: 6 }}>BREAKING DEVELOPMENTS — YOUR CALL</div>
              {view.injectPrompt && <p className="secondary">{view.injectPrompt}</p>}
              <ActionForm spec={view.actionSpec} onSubmit={(a) => void submit(a)} disabled={busy} submitLabel="Decide" />
            </div>
          ) : (
            <WaitingNote
              title="Breaking developments — a decision is being made."
              names={view.waitingOn}
            />
          )}
        </div>
      </div>
    );
  }

  if (view.phase === 'interview') {
    return (
      <div className="wrap">
        <div className="topbar">
          <span className="turnpill">Week {view.turn + 1} of {view.finalTurn + 1} — breaking</span>
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <ScoreBadges scores={view.visibleScores} />
            {forceSkipButton}
          </span>
        </div>
        <h1>{view.roleLabel ?? view.playerName}</h1>
        {view.injectPrompt && (
          <div className="card inject-card">
            <div className="muted" style={{ marginBottom: 6 }}>BREAKING</div>
            <p className="secondary" style={{ margin: 0 }}>{view.injectPrompt}</p>
          </div>
        )}
        {view.interview ? (
          <InterviewChat interview={view.interview} waitingOn={view.waitingOn} onError={onError} />
        ) : (
          <WaitingNote title="The press conference is live — others are at the podium." names={view.waitingOn} />
        )}
      </div>
    );
  }

  // phase === 'actions'
  return (
    <div className="wrap">
      <div className="topbar">
        <span className="turnpill">Week {view.turn + 1} of {view.finalTurn + 1}</span>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <ScoreBadges scores={view.visibleScores} />
          {forceSkipButton}
        </span>
      </div>
      <h1>{view.roleLabel ?? view.playerName}</h1>

      {view.lastDebrief && <DebriefView debrief={view.lastDebrief} />}

      {view.brief && (
        <div className="card">
          <div className="muted" style={{ marginBottom: 6 }}>FROM YOUR ASSISTANT</div>
          <div className="secondary">{view.brief}</div>
        </div>
      )}

      <div className="card">
        <div className="muted" style={{ marginBottom: 6 }}>PUBLIC MOOD</div>
        <div className="secondary">{view.moodHint}</div>
      </div>

      {view.submitted || !view.actionSpec ? (
        <WaitingNote title="Action submitted — the week unfolds when everyone has moved." names={view.waitingOn} />
      ) : (
        <ActionForm spec={view.actionSpec} onSubmit={(a) => void submit(a)} disabled={busy} />
      )}
    </div>
  );
}
