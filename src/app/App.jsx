import { useEffect, useState } from 'react'
import HomePage from '../pages/Home/HomePage.jsx'
import AuthPage from '../pages/Auth/AuthPage.jsx'

function App() {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [authError, setAuthError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok && data?.user) {
          setUser(data.user)
          setAuthError(null)
          return
        }
        if (data?.error === 'auth_not_configured') {
          setAuthError('auth_not_configured')
          setUser(null)
          return
        }
        setUser(null)
      } catch (e) {
        if (cancelled) return
        setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch (e) { }
    setUser(null)
  }

  if (loading) return <div className="app">Carregando…</div>

  if (authError === 'auth_not_configured') {
    return (
      <div className="app">
        <div className="panel">
          <div className="panel-title">Autenticação não configurada</div>
          <div className="panel-note">
            Configure DATABASE_URL e SESSION_SECRET no .env do servidor e reinicie.
          </div>
        </div>
      </div>
    )
  }

  if (!user) return <AuthPage onAuthenticated={setUser} />

  return <HomePage user={user} onLogout={handleLogout} />
}

export default App
