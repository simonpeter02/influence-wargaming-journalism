import { useCallback, useEffect, useState } from 'react';
import { EV } from '@iwj/shared';
import type { PlayerView } from '@iwj/shared';
import { socket, loadSession, clearSession, resumeSession } from './socket';
import Landing from './pages/Landing';
import Lobby from './pages/Lobby';
import GameScreen from './pages/GameScreen';
import Reveal from './pages/Reveal';
import ResolvingOverlay from './components/ResolvingOverlay';

// Module-level guard so StrictMode's double effect run resumes only once.
let resumeAttempted = false;

export default function App() {
  const [view, setView] = useState<PlayerView | null>(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const showError = useCallback((msg: string) => setError(msg), []);

  useEffect(() => {
    const onView = (v: PlayerView) => setView(v);
    socket.on(EV.VIEW, onView);

    if (!resumeAttempted) {
      resumeAttempted = true;
      const saved = loadSession();
      if (saved) {
        void resumeSession(saved.token).then((res) => {
          if (!res.ok) clearSession();
          setBooting(false);
        });
      } else {
        setBooting(false);
      }
    } else {
      setBooting(false);
    }

    return () => {
      socket.off(EV.VIEW, onView);
    };
  }, []);

  let screen: JSX.Element;
  if (booting) {
    screen = (
      <div className="overlay">
        <div className="spinner" />
        <div className="secondary">Reconnecting…</div>
      </div>
    );
  } else if (!view) {
    screen = <Landing onError={showError} />;
  } else if (view.phase === 'lobby') {
    screen = <Lobby view={view} onError={showError} />;
  } else if (view.phase === 'resolving') {
    screen = <ResolvingOverlay />;
  } else if (view.phase === 'reveal') {
    screen = <Reveal view={view} />;
  } else {
    // briefing | actions | inject_decision
    screen = <GameScreen view={view} onError={showError} />;
  }

  return (
    <>
      {screen}
      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </>
  );
}
