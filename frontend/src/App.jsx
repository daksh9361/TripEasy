import { useEffect, useState } from 'react';
import AuthPage from './components/AuthPage.jsx';
import TripDashboard from './TripDashboard.jsx';
import './styles/auth.css';
import './styles/app.css';

export default function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState('signup');
  const [checkingSession, setCheckingSession] = useState(true);
  const [initialMessage, setInitialMessage] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (response.ok) {
          setUser(payload.user);
        } else if (response.status !== 401) {
          setInitialMessage(payload.message || 'Authentication service is unavailable.');
        }
      })
      .catch(() => {
        if (active) setInitialMessage('Could not reach the TripEasy server. Start both apps and try again.');
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => { active = false; };
  }, []);

  const login = (authenticatedUser) => {
    setInitialMessage('');
    setUser(authenticatedUser);
  };

  const logout = async () => {
    let serverConfirmed = false;
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      serverConfirmed = response.ok;
    } catch {
      serverConfirmed = false;
    }
    setUser(null);
    setAuthMode('login');
    setInitialMessage(serverConfirmed
      ? { type: 'success', text: 'You have been logged out.' }
      : { type: 'error', text: 'Session ended in this browser, but the server could not confirm logout.' });
  };

  if (checkingSession) {
    return <main className="page auth-page"><div className="auth-loading">Checking your TripEasy session…</div></main>;
  }

  if (user) return <TripDashboard user={user} onLogout={logout} onUserChange={setUser}/>;

  return (
    <AuthPage
      mode={authMode}
      onModeChange={(mode) => { setAuthMode(mode); setInitialMessage(''); }}
      onAuthenticated={login}
      initialMessage={initialMessage}
    />
  );
}



