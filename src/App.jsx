import { useState, useEffect } from 'react';
import './App.css';
import { signInWithGoogle, signInAsGuest, getSession, getYouTubeToken, watchAuthState, logout } from './services/auth';
import FeedbackModal from './components/FeedbackModal';

import Dashboard from './components/Dashboard';

// Reads an OAuth error returned by Supabase/Google in the redirect URL, then cleans the URL.
function readRedirectError() {
  try {
    const params = new URLSearchParams(window.location.search || window.location.hash.replace(/^#/, ''));
    const message = params.get('error_description') || params.get('error');
    if (message) {
      window.history.replaceState(null, '', window.location.pathname);
      return decodeURIComponent(message.replace(/\+/g, ' '));
    }
  } catch {
    /* ignore malformed URLs */
  }
  return null;
}

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState(undefined); // undefined = still restoring
  const [youtubeToken, setYoutubeToken] = useState(() => getYouTubeToken());
  const [authError, setAuthError] = useState(() => readRedirectError());
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    let active = true;
    getSession().then(s => {
      if (!active) return;
      setSession(s);
      setYoutubeToken(getYouTubeToken());
    });
    const unsubscribe = watchAuthState((_event, s) => {
      setSession(s || null);
      setYoutubeToken(getYouTubeToken());
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleConnect = async () => {
    setIsLoading(true);
    setAuthError(null);
    try {
      await signInWithGoogle(); // redirects to Google
    } catch (err) {
      console.warn('[App Auth] Login notice:', err.message);
      setAuthError(err.message || 'Failed to start Google sign-in.');
      setIsLoading(false);
    }
  };

  const handleGuest = async () => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const s = await signInAsGuest();
      setSession(s);
    } catch (e) {
      console.error('Guest login failed:', e);
      setAuthError(e.message || 'Failed to start guest session.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setSession(null);
    setYoutubeToken(null);
  };

  if (session === undefined) {
    return (
      <main>
        <section className="hero">
          <p className="subtitle">Loading…</p>
        </section>
      </main>
    );
  }

  if (session) {
    return (
      // `token` is the Google access token for YouTube API calls, or 'guest' when there is none
      <Dashboard session={session} token={youtubeToken || 'guest'} onLogout={handleLogout} />
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
            {isLoading ? 'Connecting...' : (
              <>
                Sign in with Google
              </>
            )}
          </button>
          <button
            className="btn-secondary"
            style={{ marginTop: '1rem', width: '100%', background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.2)', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
            onClick={handleGuest}
            disabled={isLoading}
          >
            Continue as Guest
          </button>

          <div style={{ marginTop: '1.25rem' }}>
            <button
              type="button"
              onClick={() => setShowFeedback(true)}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                opacity: 0.85,
                transition: 'color 0.2s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#c084fc')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            >
              <span>💬</span>
              <span>Questions or Feedback? Let us know</span>
            </button>
          </div>
        </div>
      </section>

      <FeedbackModal
        isOpen={showFeedback}
        onClose={() => setShowFeedback(false)}
        currentUser={{ role: 'guest', isGuest: true, id: 'guest' }}
      />
    </main>
  );
}

export default App;
