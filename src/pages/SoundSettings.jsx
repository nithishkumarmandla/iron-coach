import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { sound } from '../lib/sound'
import { requestPushPermission } from '../hooks/useAlarms'

const SOUNDS = [
  { key: 'alarm',   label: 'Task alarm',     desc: 'Plays when a task is due',         fn: () => sound.alarm() },
  { key: 'warning', label: '5-min warning',  desc: 'Plays 5 minutes before due time',  fn: () => sound.warning() },
  { key: 'success', label: 'Task complete',  desc: 'Plays when you finish a task',     fn: () => sound.success() },
  { key: 'penalty', label: 'Penalty issued', desc: 'Plays when a penalty is created',  fn: () => sound.penalty() },
  { key: 'nudge',   label: 'AI nudge',       desc: 'Plays for coach messages',         fn: () => sound.nudge() },
]

export default function SoundSettings() {
  const navigate = useNavigate()

  const [enabled, setEnabled]     = useState(sound.enabled)
  const [volume, setVolume]       = useState(Math.round(sound.volume * 100))
  const [pushGranted, setPush]    = useState(Notification?.permission === 'granted')
  const [playing, setPlaying]     = useState(null)

  function toggleSound(val) {
    sound.setEnabled(val)
    setEnabled(val)
  }

  function handleVolume(val) {
    const v = Number(val)
    setVolume(v)
    sound.setVolume(v / 100)
  }

  function previewSound(key, fn) {
    setPlaying(key)
    fn()
    setTimeout(() => setPlaying(null), 2000)
  }

  async function handlePushToggle() {
    if (pushGranted) {
      toast('To disable notifications, go to browser → site settings', { duration: 4000 })
      return
    }
    const granted = await requestPushPermission()
    setPush(granted)
    if (granted) toast.success('Push notifications enabled')
    else toast.error('Denied — enable in browser settings')
  }

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => navigate('/profile')}
          style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 6 }}
        >
          ← Back
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>Sound & alerts</h2>
      </div>

      {/* Master toggle */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>Sound</p>
            <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>All in-app sounds</p>
          </div>
          <Toggle on={enabled} onChange={toggleSound} />
        </div>
      </div>

      {/* Volume slider */}
      <div className="card" style={{ marginBottom: 12, opacity: enabled ? 1 : 0.4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>Volume</p>
          <p style={{ fontSize: 14, color: 'var(--text2)', fontWeight: 500 }}>{volume}%</p>
        </div>
        <input
          type="range" min={0} max={100} step={5}
          value={volume}
          onChange={e => handleVolume(e.target.value)}
          disabled={!enabled}
          style={{ width: '100%' }}
        />
      </div>

      {/* Sound previews */}
      <p className="section-header">Sound previews</p>
      {SOUNDS.map(s => (
        <div key={s.key} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{s.label}</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{s.desc}</p>
          </div>
          <button
            onClick={() => previewSound(s.key, s.fn)}
            disabled={!enabled || playing === s.key}
            style={{
              background: playing === s.key ? 'var(--accent-dim)' : 'var(--bg3)',
              border: `1px solid ${playing === s.key ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8, padding: '7px 14px', fontSize: 12,
              color: playing === s.key ? 'var(--accent)' : 'var(--text2)',
              cursor: 'pointer', flexShrink: 0
            }}
          >
            {playing === s.key ? '♪ Playing' : '▶ Test'}
          </button>
        </div>
      ))}

      {/* Push notifications */}
      <p className="section-header" style={{ marginTop: 16 }}>Push notifications</p>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>Background alerts</p>
            <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
              {pushGranted ? 'Enabled — alarms fire when app is closed' : 'Disabled — only works when app is open'}
            </p>
          </div>
          <Toggle on={pushGranted} onChange={handlePushToggle} />
        </div>
      </div>

      {/* Add to home screen tip */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 14, marginTop: 12
      }}>
        <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
          💡 For best results on Android, add Iron Coach to your home screen.
          Tap ⋮ → <strong style={{ color: 'var(--text)' }}>Add to Home screen</strong> in Chrome.
          This enables full background push notifications.
        </p>
      </div>
    </div>
  )
}

function Toggle({ on, onChange }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{
        width: 46, height: 26, borderRadius: 13, flexShrink: 0,
        background: on ? '#378ADD' : 'var(--bg3)',
        border: '1px solid var(--border)',
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.2s'
      }}
    >
      <div style={{
        position: 'absolute', top: 3,
        left: on ? 22 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
      }} />
    </div>
  )
}
