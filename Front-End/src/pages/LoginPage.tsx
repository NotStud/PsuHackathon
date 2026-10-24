import { useState, type FormEvent } from 'react'
import { getAuthStatus, signIn, signUp } from '../api'
import { CrosshairIcon } from '../components/Icons'
import { useAsync } from '../hooks'

export function LoginPage() {
  const status = useAsync(getAuthStatus, [])
  const [mode, setMode] = useState<'login' | 'signup' | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const upgrading = Boolean(status.data?.canUpgrade)
  const signup = mode === 'signup' || (mode === null && upgrading)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    if (signup && password !== confirmation) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      if (signup) await signUp(name, email, password)
      else await signIn(email, password)
      window.location.assign('/snipe')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setBusy(false) }
  }

  return (
    <div className="login">
      <div className="login-brand">
        <span className="login-logo"><CrosshairIcon width={48} height={48} /></span>
        <h1>Snipe</h1>
        <p className="muted">Sign in to keep your leagues and scores across devices.</p>
      </div>
      <form className="form" onSubmit={handleSubmit}>
        <h2>{signup ? 'Create your account' : 'Sign in'}</h2>
        {upgrading && signup && <p className="muted">Add an email and password to keep this browser’s existing player, leagues, and scores.</p>}
        {signup && <label className="field">
          <span>Display name</span>
          <input type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" required />
        </label>}
        <label className="field">
          <span>Email</span>
          <input type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoCapitalize="none" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" minLength={signup ? 12 : 1} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={signup ? 'new-password' : 'current-password'} required />
          {signup && <span className="muted small">Use at least 12 characters.</span>}
        </label>
        {signup && <label className="field">
          <span>Confirm password</span>
          <input type="password" minLength={12} maxLength={128} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" required />
        </label>}
        {error && <p className="error" role="alert">{error}</p>}
        {status.error && <p className="error" role="alert">{status.error}</p>}
        <button disabled={busy || status.loading || Boolean(status.error)} className="button button-primary button-block button-large">
          {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
        </button>
        <button type="button" className="button button-block" disabled={busy} onClick={() => {
          setMode(signup ? 'login' : 'signup'); setPassword(''); setConfirmation(''); setError(null)
        }}>{signup ? 'Already have an account? Sign in' : 'New here? Create account'}</button>
      </form>
    </div>
  )
}
