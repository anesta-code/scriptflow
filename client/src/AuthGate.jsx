import { useEffect, useState } from 'react'

export default function AuthGate({ children }) {
  const [status, setStatus] = useState('checking')
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const currentUrl = new URL(window.location.href)

    if (currentUrl.pathname === '/auth/callback') {
      const params = new URLSearchParams(currentUrl.hash.replace(/^#/, ''))
      const token = params.get('token')
      const state = params.get('state')
      // Remove the bearer assertion from browser history before any request.
      window.history.replaceState({}, document.title, '/')
      if (!token || !state) {
        setError('The sign-in response is missing. Please sign in again.')
        setStatus('error')
        return () => { active = false }
      }
      fetch('/api/auth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, state })
      })
        .then(async response => {
          const result = await response.json()
          if (!response.ok || !result.ok) throw new Error(result.error || 'Sign-in failed.')
          return result
        })
        .then(result => {
          if (!active) return
          setUser(result.user)
          setStatus('ready')
        })
        .catch(err => {
          if (!active) return
          setError(err.message)
          setStatus('error')
        })
      return () => { active = false }
    }

    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then(async response => {
        if (response.status === 401) return null
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to verify session.')
        return result.user
      })
      .then(currentUser => {
        if (!active) return
        if (currentUser) {
          setUser(currentUser)
          setStatus('ready')
        } else {
          setStatus('signed-out')
        }
      })
      .catch(err => {
        if (!active) return
        setError(err.message)
        setStatus('error')
      })
    return () => { active = false }
  }, [])

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    setUser(null)
    setStatus('signed-out')
  }

  if (status === 'checking') return <div className="sf-auth-screen">Checking your ScriptFlow session…</div>
  if (status === 'signed-out') {
    return <div className="sf-auth-screen"><div className="sf-auth-card"><h1>ScriptFlow</h1><p>Sign in with your Bilendi Google Workspace account to continue.</p><a className="sf-auth-button" href="/api/auth/start">Continue with Bilendi</a></div></div>
  }
  if (status === 'error') {
    return <div className="sf-auth-screen"><div className="sf-auth-card"><h1>Sign-in error</h1><p>{error}</p><a className="sf-auth-button" href="/api/auth/start">Try again</a></div></div>
  }
  return <>{children({ user, signOut })}</>
}
