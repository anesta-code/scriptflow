import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from './services/supabase'

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null)
  const [status, setStatus] = useState('checking')
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured. Please check the Vercel Supabase environment variables.')
      setStatus('error')
      return
    }

    let active = true

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      if (!nextSession) {
        setUser(null)
        setStatus('signed-out')
      }
    })

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) {
        setError(sessionError.message)
        setStatus('error')
        return
      }
      setSession(data.session)
      if (!data.session) setStatus('signed-out')
    })

    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session || !session.user || !supabase) return

    let active = true

    async function loadExistingProfile() {
      setStatus('loading-profile')
      setError('')

      try {
        const authUser = session.user
        const email = (authUser.email || '').trim().toLowerCase()
        const hasGoogleIdentity = Array.isArray(authUser.identities) &&
          authUser.identities.some(identity => identity.provider === 'google')

        if (!email || !authUser.email_confirmed_at || !hasGoogleIdentity || !email.endsWith('@bilendi.com')) {
          throw new Error('Please sign in with your verified Bilendi Google Workspace account (@bilendi.com).')
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, email, full_name, role, is_active')
          .eq('id', authUser.id)
          .maybeSingle()

        if (profileError) throw profileError

        if (!profile || profile.id !== authUser.id) {
          throw new Error('Your existing ScriptFlow profile could not be found. No new profile will be created by this sign-in screen.')
        }

        const { data: matchingProfiles, error: matchingProfilesError } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', email)

        if (matchingProfilesError) throw matchingProfilesError
        if (!matchingProfiles || matchingProfiles.length !== 1 || matchingProfiles[0].id !== authUser.id) {
          throw new Error('More than one ScriptFlow profile matches this email, or the existing profile could not be verified. Sign-in has been stopped to protect your account.')
        }

        if ((profile.email || '').trim().toLowerCase() !== email) {
          throw new Error('The Google account does not match the email on your existing ScriptFlow profile.')
        }

        if (!profile.is_active) {
          throw new Error('Your ScriptFlow account is inactive. Please contact your administrator.')
        }

        if (active) {
          setUser({
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            role: profile.role
          })
          setStatus('ready')
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Unable to load your ScriptFlow profile.')
          setStatus('error')
        }
      }
    }

    loadExistingProfile()

    return () => { active = false }
  }, [session])

  async function signIn() {
    if (!supabase) return
    setSigningIn(true)
    setError('')

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          prompt: 'select_account'
        }
      }
    })

    if (signInError) {
      setError(signInError.message)
      setSigningIn(false)
    }
  }

  async function signOut() {
    if (!supabase) return
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      setError(signOutError.message)
      setStatus('error')
    }
  }

  if (status === 'checking' || status === 'loading-profile') {
    return <div className="sf-auth-screen"> {status === 'checking' ? 'Checking your ScriptFlow session…' : 'Loading your ScriptFlow profile…'} </div>
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
            {signingIn ? 'Redirecting to Google…' : 'Try again with Google'}
          </button>
        </div>
      </div>
    )
  }

  return <>{children({ user, signOut })}</>
}
