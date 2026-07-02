import type { Debrief } from '@iwj/shared';

/** Last week's debrief: one newspaper front page per outlet, other actions, narratives. */
export default function DebriefView({ debrief }: { debrief: Debrief }) {
  return (
    <>
      {debrief.injectNarrative && (
        <div className="card inject-card">
          <div className="muted" style={{ marginBottom: 6 }}>BREAKING DEVELOPMENTS</div>
          <div className="secondary">{debrief.injectNarrative}</div>
        </div>
      )}
      {debrief.frontPages.map((fp) => (
        <div className="paper" key={fp.outlet}>
          <div className="outlet">
            <span>{fp.outlet}</span>
            <span>Nordavia</span>
          </div>
          <h3>{fp.headline}</h3>
          <div className="subhead">{fp.subhead}</div>
        </div>
      ))}
      <div className="card">
        <div className="muted" style={{ marginBottom: 6 }}>MEANWHILE, THIS WEEK</div>
        <ul className="actions-list" style={{ margin: 0, paddingLeft: 18 }}>
          {debrief.otherActions.map((a, i) => (
            <li key={i}>
              <b style={{ color: 'var(--text-primary)' }}>{a.actor}:</b> {a.summary}
            </li>
          ))}
        </ul>
        <p className="secondary" style={{ marginBottom: 0 }}>{debrief.publicNarrative}</p>
      </div>
    </>
  );
}
