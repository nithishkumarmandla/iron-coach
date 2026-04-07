import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'

const LEVEL_TITLES = ['Recruit','Soldier','Warrior','Elite','Iron']
const DEFAULT_FORM = {
  username: '',
  timezone: 'Asia/Kolkata',
  avg_sleep_hours: 7,
  energy_level: 3,
  phone_number: ''
}

export default function ProfileHealth() {
  const { user, profile, fetchProfile } = useStore()
  const navigate = useNavigate()

  const [form, setForm]     = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadProfile() {
      setLoading(true)

      try {
        const data = profile ?? await fetchProfile(user.id)
        setForm({
          username:        data?.username ?? DEFAULT_FORM.username,
          timezone:        data?.timezone ?? DEFAULT_FORM.timezone,
          avg_sleep_hours: data?.avg_sleep_hours ?? DEFAULT_FORM.avg_sleep_hours,
          energy_level:    data?.energy_level ?? DEFAULT_FORM.energy_level,
          phone_number:    data?.phone_number ?? DEFAULT_FORM.phone_number
        })
      } catch {
        toast.error('Failed to load profile')
        setForm(DEFAULT_FORM)
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [fetchProfile, profile, user.id])

  async function handleSave() {
    if (!form.username.trim()) return toast.error('Username required')
    setSaving(true)
    try {
      await supabase.from('profiles').update({
        username:        form.username.trim(),
        avg_sleep_hours: form.avg_sleep_hours,
        energy_level:    form.energy_level,
        phone_number:    form.phone_number.trim() || null
      }).eq('id', user.id)
      await fetchProfile(user.id)
      toast.success('Profile saved')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    if (!confirm('Sign out?')) return
    await supabase.auth.signOut()
  }

  if (loading || !form) return <div className="spinner" />

  const xp          = profile?.xp_total ?? 0
  const levelIdx    = profile?.level ? profile.level - 1 : 0
  const levelTitle  = LEVEL_TITLES[Math.min(levelIdx, 4)]
  const score       = Math.round(profile?.discipline_score ?? 0)
  const streak      = profile?.total_streak ?? 0

  return (
    <div className="page">
      <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 20 }}>Profile</h2>

      {/* Stats summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Level</p>
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{levelTitle}</p>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Score</p>
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{score}</p>
        </div>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Streak</p>
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>🔥{streak}</p>
        </div>
      </div>

      {/* Profile form */}
      <p className="section-header">Account</p>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Username</label>
            <input
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              placeholder="Your name"
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>
              Phone number (for WhatsApp)
            </label>
            <input
              value={form.phone_number}
              onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
              placeholder="+91XXXXXXXXXX"
              type="tel"
            />
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              Include country code. Used for WhatsApp alerts only.
            </p>
          </div>
        </div>
      </div>

      {/* Health inputs */}
      <p className="section-header">Daily health check-in</p>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 13, color: 'var(--text)' }}>Sleep last night</label>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent)' }}>
                {form.avg_sleep_hours}h
              </span>
            </div>
            <input
              type="range" min={3} max={12} step={0.5}
              value={form.avg_sleep_hours}
              onChange={e => setForm(f => ({ ...f, avg_sleep_hours: parseFloat(e.target.value) }))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>3h</span>
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>12h</span>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 13, color: 'var(--text)', display: 'block', marginBottom: 10 }}>
              Energy level today
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1,2,3,4,5].map(n => (
                <button
                  key={n}
                  onClick={() => setForm(f => ({ ...f, energy_level: n }))}
                  style={{
                    flex: 1, padding: '8px 0', fontSize: 16,
                    border: `1.5px solid ${form.energy_level === n ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 8, cursor: 'pointer',
                    background: form.energy_level === n ? 'var(--accent-dim)' : 'var(--bg3)',
                    transition: 'all 0.15s'
                  }}
                >
                  {['😴','😐','🙂','💪','🔥'][n-1]}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, textAlign: 'center' }}>
              AI uses this to adjust today's workload
            </p>
          </div>
        </div>
      </div>

      <button
        className="btn btn-primary"
        onClick={handleSave}
        disabled={saving}
        style={{ marginBottom: 12, fontSize: 15 }}
      >
        {saving ? 'Saving...' : 'Save changes'}
      </button>

      {/* Settings shortcuts */}
      <p className="section-header" style={{ marginTop: 8 }}>Settings</p>
      {[
        { label: 'Notification settings',  path: '/notifications', icon: '🔔' },
        { label: 'Sound & alarms',         path: '/sound',         icon: '🔊' },
        { label: 'Alarm schedule',         path: '/alarms',        icon: '⏰' },
        { label: 'Task manager',           path: '/tasks',         icon: '📋' },
        { label: 'Weekly contract',        path: '/contract',      icon: '📝' },
        { label: 'Plan tomorrow',          path: '/plan-tomorrow', icon: '📅' }
      ].map(item => (
        <button
          key={item.path}
          onClick={() => navigate(item.path)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '13px 14px', marginBottom: 8,
            cursor: 'pointer', textAlign: 'left'
          }}
        >
          <span style={{ fontSize: 18 }}>{item.icon}</span>
          <span style={{ fontSize: 14, color: 'var(--text)', flex: 1 }}>{item.label}</span>
          <span style={{ fontSize: 16, color: 'var(--text3)' }}>›</span>
        </button>
      ))}

      {/* Sign out */}
      <button
        className="btn btn-secondary"
        onClick={handleSignOut}
        style={{ marginTop: 16, color: 'var(--danger)', borderColor: 'var(--danger)', fontSize: 14 }}
      >
        Sign out
      </button>
    </div>
  )
}
