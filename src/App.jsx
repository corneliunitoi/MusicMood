import { useState, useEffect } from 'react'
import './App.css'
import { getAuthUrl, handleAuthCallback, getAccessToken, logout } from './services/auth'

import Dashboard from './components/Dashboard'

function App() {
  const [isLoading, setIsLoading] = useState(false)
  const [token, setToken] = useState(getAccessToken())

  useEffect(() => {
    const newToken = handleAuthCallback()
    if (newToken) {
      setToken(newToken)
      // Clean up the URL hash
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  const handleConnect = () => {
    setIsLoading(true)
    window.location.href = getAuthUrl()
  }

  const handleLogout = () => {
    logout()
    setToken(null)
  }

  if (token) {
    return (
      <Dashboard token={token} onLogout={handleLogout} />
    )
  }

  return (
    <main>
      <section className="hero">
        <h1>Music for Each Mood</h1>
        <p className="subtitle">
          Connect your YouTube account to discover personalized playlists tailored to your current vibes.
        </p>

        <div className="glass-card">
          <button
            className="btn-primary"
            onClick={handleConnect}
            disabled={isLoading}
          >
            {isLoading ? 'Redirecting...' : (
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
            onClick={() => {
              localStorage.setItem('youtube_access_token', 'guest');
              setToken('guest');
            }}
          >
            Continue as Guest
          </button>
        </div>
      </section>
    </main>
  )
}

export default App
