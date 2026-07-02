interface Props {
  title: string;
  names: string[];
}

/** Small card shown while we wait on other players. */
export default function WaitingNote({ title, names }: Props) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="spinner" style={{ margin: '4px auto 12px', width: 26, height: 26 }} />
      <div className="secondary">{title}</div>
      {names.length > 0 && (
        <div className="muted" style={{ marginTop: 6 }}>
          Waiting on: {names.join(', ')}
        </div>
      )}
    </div>
  );
}
