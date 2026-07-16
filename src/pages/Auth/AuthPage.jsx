import { useState } from 'react'
import './AuthPage.css'

function mapAuthError(code) {
  if (code === 'forbidden_domain') return 'Use seu e-mail @bfrcapital.com.br.'
  if (code === 'invalid_credentials') return 'E-mail ou senha inválidos.'
  if (code === 'email_in_use') return 'Esse e-mail já está em uso.'
  if (code === 'weak_password') return 'Senha fraca (mínimo 8 caracteres).'
  if (code === 'missing_fields') return 'Preencha e-mail e senha.'
  if (code === 'auth_not_configured') return 'Autenticação não configurada no servidor.'
  return 'Não foi possível concluir. Tente novamente.'
}

function isLocalhostHost(hostname) {
  return ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname.toLowerCase())
}

function buildApiUrl(path) {
  const apiUrl = String(import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || '').trim()
  if (!apiUrl) return path

  const normalized = apiUrl.replace(/\/+$/, '')
  try {
    const target = new URL(normalized)
    const currentHostname = window.location.hostname.toLowerCase()
    const targetHostname = target.hostname.toLowerCase()

    if (isLocalhostHost(targetHostname) || targetHostname === currentHostname) {
      return path
    }

    return `${normalized}${path.startsWith('/') ? path : `/${path}`}`
  } catch (e) {
    return path
  }
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)

    try {
      const endpoint = buildApiUrl(mode === 'register' ? '/api/auth/register' : '/api/auth/login')
      const result = await postJson(endpoint, { email, password })
      if (!result.ok) {
        const code = result.data?.error
        setError(mapAuthError(code))
        return
      }
      const user = result.data?.user
      if (user) onAuthenticated?.(user)
    } catch (e) {
      setError('Falha de conexão com o servidor.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app auth-app">
      <div className="panel auth-card">
        <div className="auth-header">
          <div>
            <div className="auth-title">{mode === 'register' ? 'Criar conta' : 'Entrar'}</div>
            <div className="auth-subtitle">Acesso restrito a @bfrcapital.com.br</div>
          </div>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setError('')
              setMode(prev => (prev === 'login' ? 'register' : 'login'))
            }}
          >
            {mode === 'login' ? 'Criar conta' : 'Já tenho conta'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label className="auth-label">E-mail</label>
            <input
              className="auth-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nome@bfrcapital.com.br"
              autoComplete="email"
              inputMode="email"
            />
          </div>
          <div className="auth-field">
            <label className="auth-label">Senha</label>
            <input
              className="auth-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              type="password"
              placeholder="********"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error ? <div className="auth-error">{error}</div> : null}

          <button className="btn btn-primary btn-wide" disabled={loading} type="submit">
            {loading ? 'Aguarde…' : mode === 'register' ? 'Criar conta' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default AuthPage
