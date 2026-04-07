import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { ensureProfile } = useStore()

  async function finishSignedIn(user) {
    await ensureProfile(user)
    navigate('/')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) return toast.error('Fill in all fields')
    setLoading(true)

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) {
          const msg = error.message?.toLowerCase() ?? ''

          // If the auth user already exists in Supabase, recover by signing in instead.
          if (
            msg.includes('already registered') ||
            msg.includes('already been registered') ||
            msg.includes('database error saving new user')
          ) {
            const signInRes = await supabase.auth.signInWithPassword({ email, password })
            if (signInRes.error) {
              setIsSignUp(false)
              throw new Error('Account may already exist. Try Sign in instead.')
            }
            await finishSignedIn(signInRes.data.user)
            toast.success('Signed in to your existing account')
            return
          }

          throw error
        }

        if (data.user && data.session) {
          await finishSignedIn(data.user)
          toast.success('Account created')
          return
        }

        if (data.user && !data.session) {
          toast.success('Account created. Check your email to confirm, then sign in.')
          setIsSignUp(false)
          return
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        await finishSignedIn(data.user)
      }
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '32px 24px',
      background: 'var(--bg)'
    }}>
      {/* Logo */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{
          width: 56, height: 56,
          background: 'var(--accent)',
          borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
          Iron Coach
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text2)' }}>
          {isSignUp ? 'Create your account' : 'Welcome back'}
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{ marginTop: 8 }}
        >
          {loading ? '...' : isSignUp ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <button
        onClick={() => setIsSignUp(!isSignUp)}
        style={{
          background: 'none', border: 'none',
          color: 'var(--text2)', fontSize: 14,
          marginTop: 20, cursor: 'pointer'
        }}
      >
        {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
      </button>
    </div>
  )
}
