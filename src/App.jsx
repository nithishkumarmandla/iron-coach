import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { supabase } from './lib/supabase'
import { useStore } from './store/useStore'

// Pages (stubs — filled phase by phase)
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import TaskManager from './pages/TaskManager'
import FocusMode from './pages/FocusMode'
import ProofUpload from './pages/ProofUpload'
import CoachChat from './pages/CoachChat'
import Emergency from './pages/Emergency'
import WeeklyContract from './pages/WeeklyContract'
import BodyDouble from './pages/BodyDouble'
import HabitsHeatmap from './pages/HabitsHeatmap'
import HistoryView from './pages/HistoryView'
import Performance from './pages/Performance'
import WeeklyReport from './pages/WeeklyReport'
import PrePlanTomorrow from './pages/PrePlanTomorrow'
import Penalties from './pages/Penalties'
import AlarmSchedule from './pages/AlarmSchedule'
import ProfileHealth from './pages/ProfileHealth'
import NotificationSettings from './pages/NotificationSettings'
import SoundSettings from './pages/SoundSettings'

// Layout
import Layout from './components/Layout'

async function getSessionWithTimeout(timeoutMs = 8000) {
  return await Promise.race([
    supabase.auth.getSession(),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Auth bootstrap timeout')), timeoutMs)
    })
  ])
}

function ProtectedRoute({ children }) {
  const { user, profile, authReady } = useStore()
  if (!authReady) return <div className="spinner" />
  if (!user) return <Navigate to="/login" replace />

  // New users with no profile data go to onboarding
  // Profile exists but no discipline_score set = brand new user
  if (profile && profile.discipline_score === 0 && profile.total_streak === 0) {
    const path = window.location.pathname
    if (path !== '/onboarding') {
      // Check localStorage flag — only redirect once
      const didOnboard = localStorage.getItem('did_onboard')
      if (!didOnboard) return <Navigate to="/onboarding" replace />
    }
  }

  return children
}

export default function App() {
  const { setUser, setProfile, setAuthReady, ensureProfile } = useStore()

  useEffect(() => {
    let mounted = true

    async function bootstrapAuth() {
      try {
        const { data: { session } } = await getSessionWithTimeout()
        if (!mounted) return

        setUser(session?.user ?? null)

        if (session?.user) {
          await ensureProfile(session.user)
        } else {
          setProfile(null)
        }
      } catch (err) {
        console.error('Initial auth bootstrap failed:', err)
        if (mounted) {
          setUser(null)
          setProfile(null)
        }
      } finally {
        if (mounted) setAuthReady(true)
      }
    }

    bootstrapAuth()

    // Listen for auth state changes after the initial bootstrap
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        try {
          setUser(session?.user ?? null)

          if (session?.user) {
            await ensureProfile(session.user)
          } else {
            setProfile(null)
          }
        } catch (err) {
          console.error(`Auth state change failed for ${event}:`, err)
          setProfile(null)
        } finally {
          setAuthReady(true)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [ensureProfile, setAuthReady, setProfile, setUser])

  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1a1a1a',
            color: '#e8e8e8',
            border: '1px solid #222',
            fontSize: '14px'
          }
        }}
      />
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected */}
        <Route path="/" element={
          <ProtectedRoute><Layout /></ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="tasks" element={<TaskManager />} />
          <Route path="focus/:instanceId" element={<FocusMode />} />
          <Route path="proof/:instanceId" element={<ProofUpload />} />
          <Route path="chat" element={<CoachChat />} />
          <Route path="emergency/:instanceId" element={<Emergency />} />
          <Route path="contract" element={<WeeklyContract />} />
          <Route path="body-double" element={<BodyDouble />} />
          <Route path="habits" element={<HabitsHeatmap />} />
          <Route path="history" element={<HistoryView />} />
          <Route path="performance" element={<Performance />} />
          <Route path="report" element={<WeeklyReport />} />
          <Route path="plan-tomorrow" element={<PrePlanTomorrow />} />
          <Route path="penalties" element={<Penalties />} />
          <Route path="alarms" element={<AlarmSchedule />} />
          <Route path="profile" element={<ProfileHealth />} />
          <Route path="notifications" element={<NotificationSettings />} />
          <Route path="sound" element={<SoundSettings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
