import { useEffect, useState } from 'react'
import Admin from '../../admin/Admin.jsx'

const tokenKey = 'cinebook-admin-token'
const managerRoles = ['manager', 'admin', 'superadmin']

const api = async (path, options = {}) => {
  const token = localStorage.getItem(tokenKey)
  const response = await fetch(`/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  })

  if (!response.ok) {
    const error = new Error((await response.json().catch(() => null))?.message || 'Something went wrong')
    error.status = response.status
    throw error
  }
  if (response.status === 204) return null
  return response.json()
}

function ManagerLogin({ onLogin }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      if (!managerRoles.includes(result.user.role)) {
        setError('This account does not have manager access.')
        return
      }
      localStorage.setItem(tokenKey, result.token)
      onLogin(result.user)
    } catch (issue) {
      setError(issue.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="manager-login">
      <div className="brand manager-login-brand">
        <span className="brand-mark">C</span><span>Cine<span>Book</span></span>
      </div>
      <section className="manager-login-panel">
        <span className="eyebrow">Separate operations portal</span>
        <h1>Manager sign in.</h1>
        <p className="muted">Use an authorized manager or administrator account to continue.</p>
        <form className="auth-form" onSubmit={submit}>
          <input
            type="email"
            autoComplete="username"
            placeholder="Email address"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            required
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
          />
          <button className="primary-button full" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in to Manager Portal →'}
          </button>
        </form>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </section>
    </main>
  )
}

export default function AdminPortal() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(Boolean(localStorage.getItem(tokenKey)))

  useEffect(() => {
    if (!localStorage.getItem(tokenKey)) return

    let active = true
    api('/auth/me')
      .then(({ user: currentUser }) => {
        if (!active) return
        if (managerRoles.includes(currentUser.role)) setUser(currentUser)
        else localStorage.removeItem(tokenKey)
      })
      .catch(() => {
        if (active) localStorage.removeItem(tokenKey)
      })
      .finally(() => {
        if (active) setChecking(false)
      })

    return () => { active = false }
  }, [])

  const signOut = () => {
    localStorage.removeItem(tokenKey)
    setUser(null)
  }

  if (checking) {
    return <main className="page manager-checking"><span className="eyebrow">CineBook operations</span><h1>Checking your access…</h1></main>
  }

  if (!user) return <ManagerLogin onLogin={setUser} />

  return (
    <div className="app-shell manager-app-shell">
      <header className="manager-topbar">
        <div className="manager-brand-block">
          <div className="brand"><span className="brand-mark">C</span><span>Cine<span>Book</span></span></div>
          <span className="manager-brand-caption">MANAGEMENT CONSOLE</span>
        </div>
        <div className="manager-topbar-actions">
          <span className="manager-account-name">{user.name}<small>{user.role}</small></span>
          <button className="ghost-button" type="button" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <Admin api={api} />
    </div>
  )
}
