import { useState } from 'react';
import './App.css';
import { requestGoogleLogin, getAccessToken, logout } from './services/auth';
import { signInAsGuest, supabase } from './services/supabaseService';

import Dashboard from './components/Dashboard';

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState(getAccessToken());
  const [authError, setAuthError] = useState(null);

  const handleConnect = async () => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const accessToken = await requestGoogleLogin();
      if (accessToken) {
        setToken(accessToken);
      }
    } catch (err) {
      console.warn('[App Auth] Login notice:', err.message);
      if (!err.message?.includes('closed') && !err.message?.includes('cancel')) {
        setAuthError(err.message || 'Failed to authenticate with Google. Please check your browser popup blocker.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    logout();
    if (token === 'guest') {
      await supabase.auth.signOut();
    }
    setToken(null);
  };

  if (token) {
    return (
      <Dashboard token={token} onLogout={handleLogout} />
    );
  }

  return (
    <main>
      <section className="hero">
        <h1>Music for Each Mood</h1>
        <p className="subtitle" style={{ maxWidth: '620px', margin: '0 auto 1.5rem auto', lineHeight: '1.5' }}>
          Tired of AI algorithms telling you what you should listen to? MusicMood learns your taste baseline, respects your boundaries, and steers playback by your state of mind with zero algorithmic drift.
        </p>

        <div className="glass-card">
          {authError && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              padding: '0.65rem 0.85rem',
              marginBottom: '1rem',
              color: '#fca5a5',
              fontSize: '0.85rem',
              textAlign: 'left'
            }}>
              ⚠️ {authError}
            </div>
          )}

          <button
            className="btn-primary"
            onClick={handleConnect}
            disabled={isLoading}
          >
            {isLoading ? 'Connecting to Google...' : (
              <>
                <svg className="youtube-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
                </svg>
                Connect to YouTube
              </>
            )}
          </button>
          <button
            className="btn-secondary"
            style={{ marginTop: '1rem', width: '100%', background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.2)', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
            onClick={async () => {
              setIsLoading(true);
              setAuthError(null);
              try {
                await signInAsGuest();
                localStorage.setItem('youtube_access_token', 'guest');
                setToken('guest');
              } catch (e) {
                console.error("Guest login failed:", e);
                setAuthError("Failed to start guest session.");
              } finally {
                setIsLoading(false);
              }
            }}
            disabled={isLoading}
          >
            Continue as Guest
          </button>
        </div>
      </section>
    </main>
  );
}

export default App;
