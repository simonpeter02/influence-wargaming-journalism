interface Props {
  scores: { label: string; value: number }[];
}

/** Role-visible score pills. WD never appears here — the server filters it out. */
export default function ScoreBadges({ scores }: Props) {
  if (scores.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
      {scores.map((s) => (
        <span className="scorebadge" key={s.label}>
          {s.label}: <b>{s.value}</b> / 100
        </span>
      ))}
    </span>
  );
}
