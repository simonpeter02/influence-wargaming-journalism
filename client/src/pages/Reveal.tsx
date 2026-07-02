import type { Outcome, PlayerView } from '@iwj/shared';
import { clearSession } from '../socket';
import TrajectoryChart from '../components/TrajectoryChart';
import StatTiles from '../components/StatTiles';

interface Props {
  view: PlayerView;
}

const OUTCOME_LINE: Record<Outcome, string> = {
  completed: 'The game ran its full course.',
  invasion: 'The game ended in invasion.',
  abandoned: 'The game was abandoned before its end.',
};

/** The enlightenment moment: the hidden score, the trajectories, and the record of every game. */
export default function Reveal({ view }: Props) {
  const reveal = view.reveal;
  if (!reveal) return null;

  const first = reveal.trajectory[0];
  const wdEnd = reveal.finalScores.wd;
  const dw = first ? wdEnd - first.wd : 0;

  const playAgain = () => {
    clearSession();
    window.location.reload();
  };

  return (
    <div className="wrap">
      <h1>Game over — the hidden score</h1>
      <p className="sub">{OUTCOME_LINE[reveal.outcome]}</p>

      <div className="reveal-banner">
        <div className="muted">TRACKED IN SECRET ALL GAME, THE WAY A DEFENSE MINISTRY WOULD</div>
        <div style={{ fontSize: 20, marginTop: 6 }}>
          <b>Willingness to Defend:</b>{' '}
          <span style={{ fontSize: 30, fontWeight: 700, color: 'var(--series-wd)' }}>{wdEnd}</span> / 100{' '}
          <span className={dw < 0 ? 'delta-neg' : 'delta-pos'} style={{ fontSize: 16 }}>
            ({dw >= 0 ? '+' : ''}{dw} over the game)
          </span>
        </div>
      </div>

      <TrajectoryChart trajectory={reveal.trajectory} />

      <div className="card">
        <h2 style={{ marginTop: 0 }}>How the weeks unfolded</h2>
        <table className="timeline">
          <tbody>
            {reveal.timeline.map((t) => (
              <tr key={t.turn}>
                <td>Week {t.turn + 1}</td>
                <td>
                  <b style={{ color: 'var(--text-primary)' }}>{t.keyMoment}</b>
                  {t.inject && (
                    <div style={{ color: 'var(--series-at)' }}>Breaking: {t.inject}</div>
                  )}
                  <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                    {t.actions.map((a, i) => (
                      <li key={i}>
                        <b style={{ color: 'var(--text-primary)' }}>{a.actor}:</b> {a.action}
                      </li>
                    ))}
                  </ul>
                  <span className={t.wdDelta < 0 ? 'delta-neg' : 'delta-pos'}>
                    WD {t.wdDelta >= 0 ? '+' : ''}{t.wdDelta} that week
                  </span>
                  {t.wdRationale && <span className="muted"> — {t.wdRationale}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <StatTiles stats={reveal.allTime} />

      <button className="primary" onClick={playAgain}>Play again</button>
    </div>
  );
}
