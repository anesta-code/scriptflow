import { useEffect, useState } from 'react'

function parseAuthCallback() {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const token = params.get('token')
  const state = params.get('state')
  return token && state ? { token, state } : null
}

export default function AuthGate({ children }) {
  const [status, setStatus] = useState('checking')
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    let active = true

    async function initialise() {
      try {
        const callback = parseAuthCallback()
        if (callback) {
          const response = await fetch('/api/auth/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(callback)
          })
          const result = await response.json()
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
          if (!response.ok || !result.ok) throw new Error(result.error || 'Sign-in could not be completed.')
        }

        const response = await fetch('/api/auth/session', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store'
        })
        if (response.status === 401) {
          if (active) setStatus('signed-out')
          return
        }
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to verify your ScriptFlow session.')
        if (active) {
          setUser(result.user)
          setStatus('ready')
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Unable to complete sign-in.')
          setStatus('error')
        }
      }
    }

    initialise()
    return () => { active = false }
  }, [])

  function signIn() {
    setSigningIn(true)
    setError('')
    window.location.assign('/api/auth/start')
  }

  async function signOut() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin'
      })
    } finally {
      setUser(null)
      setStatus('signed-out')
    }
  }

  if (status === 'checking') {
    return <div className="sf-auth-screen">Checking your ScriptFlow session…</div>
  }

  if (status === 'signed-out') {
    return (
      <div className="sf-auth-screen">
        <div className="sf-auth-card">
          <h1>ScriptFlow</h1>
          <p>Sign in using your Bilendi Google Workspace account.</p>
          {error && <p className="sf-auth-error">{error}</p>}
          <button className="sf-auth-button" type="button" onClick={signIn} disabled={signingIn}>
            {signingIn ? 'Redirecting to Google…' : 'Sign in with Google'}
          </button>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="sf-auth-screen">
        <div className="sf-auth-card">
          <h1>Sign-in error</h1>
          <p className="sf-auth-error">{error}</p>
          <button className="sf-auth-button" type="button" onClick={signIn} disabled={signingIn}>
            Try again with Google
          </button>
        </div>
      </div>
    )
  }

  return <>{children({ user, signOut })}</>
}
