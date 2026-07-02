import type { AllTimeStats } from '@iwj/shared';

const fmtPct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const fmtNum = (v: number | null) => (v == null ? '—' : `${Math.round(v)}`);

/** All-time stats across every game ever played on this server. */
export default function StatTiles({ stats }: { stats: AllTimeStats }) {
  return (
    <>
      <h2>Across every game ever played</h2>
      <div className="statrow">
        <div className="stat">
          <div className="v">{stats.gamesPlayed}</div>
          <div className="l">games played</div>
        </div>
        <div className="stat">
          <div className="v">{fmtNum(stats.avgFinalWd)}</div>
          <div className="l">avg final WD</div>
        </div>
        <div className="stat">
          <div className="v">{fmtPct(stats.invasionRate)}</div>
          <div className="l">games ending in invasion</div>
        </div>
        <div className="stat">
          <div className="v">{fmtPct(stats.publishRateTurn0)}</div>
          <div className="l">journalists who published the leak at week 1</div>
        </div>
      </div>
      <div className="card">
        <div className="muted" style={{ marginBottom: 8 }}>
          THE RESEARCH QUESTION — DOES PUBLISHING THE LEAK CHANGE WHETHER A PUBLIC WOULD FIGHT?
        </div>
        <div className="statrow" style={{ margin: 0 }}>
          <div className="stat">
            <div className="v">{fmtNum(stats.avgWdPublished)}</div>
            <div className="l">avg final WD when the leak was published at week 1</div>
          </div>
          <div className="stat">
            <div className="v">{fmtNum(stats.avgWdHeld)}</div>
            <div className="l">avg final WD when the leak was held</div>
          </div>
        </div>
      </div>
    </>
  );
}
