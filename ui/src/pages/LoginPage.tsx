import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CrosshairIcon } from '../components/Icons'

// Placeholder sign-in. Swap handleSubmit for the real auth call once it exists.
export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    navigate('/snipe')
  }

  return (
    <div className="login">
      <div className="login-brand">
        <span className="login-logo">
          <CrosshairIcon width={48} height={48} />
        </span>
        <h1>Snipe</h1>
        <p className="muted">Spot your friends in the wild. Snap them. Climb the board.</p>
      </div>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span>School email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@psu.edu"
            autoComplete="email"
            required
          />
        </label>
        <button className="button button-primary button-block button-large">Continue</button>
      </form>
    </div>
  )
}
