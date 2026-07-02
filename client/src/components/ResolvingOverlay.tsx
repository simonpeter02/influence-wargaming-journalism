import { useEffect, useState } from 'react';

const FLAVOR = [
  'The public is reacting…',
  'Editors are choosing tomorrow’s front page…',
  'Pollsters are in the field…',
  'Ministers are drafting talking points…',
];

/** Full-screen overlay with a spinner and rotating flavor lines while the GM resolves the week. */
export default function ResolvingOverlay() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % FLAVOR.length), 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="overlay">
      <div className="spinner" />
      <div className="secondary">{FLAVOR[i]}</div>
      <div className="muted">simulating one week of national life</div>
    </div>
  );
}
