import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { sendWhatsApp } from '../lib/whatsapp'
import { requestPushPermission } from '../hooks/useAlarms'

const DEFAULT_FORM = {
  phone_number: '',
  whatsapp_enabled: false,
  call_enabled: false,
  notify_missed_task: true,
  notify_daily_brief: true,
  notify_penalty: true,
  quiet_hours_start: '23:00',
  quiet_hours_end: '06:00'
}

export default function NotificationSettings() {
  const { user, fetchProfile } = useStore()
  const navigate               = useNavigate()

  const [form, setForm]     = useState(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [pushGranted, setPush] = useState(Notification?.permission === 'granted')

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('phone_number, whatsapp_enabled, call_enabled, notify_missed_task, notify_daily_brief, notify_penalty, quiet_hours_start, quiet_hours_end')
          .eq('id', user.id)
          .maybeSingle()

        if (error) throw error
        setForm(data ?? DEFAULT_FORM)
      } catch {
        toast.error('Failed to load notification settings')
        setForm(DEFAULT_FORM)
      }
    }
    load()
  }, [user.id])

  async function handleSave() {
    setSaving(true)
    try {
      await supabase.from('profiles').update({
        whatsapp_enabled:   form.whatsapp_enabled,
        call_enabled:       form.call_enabled,
        notify_missed_task: form.notify_missed_task,
        notify_daily_brief: form.notify_daily_brief,
        notify_penalty:     form.notify_penalty,
        quiet_hours_start:  form.quiet_hours_start,
        quiet_hours_end:    form.quiet_hours_end
      }).eq('id', user.id)
      await fetchProfile(user.id)
      toast.success('Notification settings saved')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestWhatsApp() {
    if (!form.phone_number) return toast.error('Add phone number in Profile first')
    setTesting(true)
    try {
      await sendWhatsApp(
        `Iron Coach test ✅\nYour WhatsApp notifications are working.\nReply "help" to see available commands.`,
        'test', null
      )
      toast.success('Test message sent!')
    } catch (err) {
      toast.error(`Failed: ${err.message}`)
    } finally {
      setTesting(false)
    }
  }

  async function handleEnablePush() {
    const granted = await requestPushPermission()
    setPush(granted)
    toast(granted ? 'Push notifications enabled' : 'Denied — enable in browser settings')
  }

  if (!form) return <div className="spinner" />

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => navigate('/profile')}
          style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 6 }}
        >
          ← Back
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}>Notifications</h2>
      </div>

      {/* WhatsApp section */}
      <p className="section-header">WhatsApp</p>
      <div className="card" style={{ marginBottom: 12 }}>
        <ToggleRow
          label="WhatsApp alerts"
          desc={form.phone_number ? `Sending to ${form.phone_number}` : 'Add phone number in Profile first'}
          on={form.whatsapp_enabled && !!form.phone_number}
          onChange={v => setForm(f => ({ ...f, whatsapp_enabled: v }))}
          disabled={!form.phone_number}
        />
      </div>

      {form.whatsapp_enabled && form.phone_number && (
        <button
          className="btn btn-secondary"
          onClick={handleTestWhatsApp}
          disabled={testing}
          style={{ marginBottom: 12, fontSize: 13 }}
        >
          {testing ? 'Sending...' : '📲 Send test WhatsApp message'}
        </button>
      )}

      {/* Push notifications */}
      <p className="section-header">Push notifications</p>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>Browser push</p>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>
              {pushGranted ? '✓ Enabled' : 'Not enabled — works on Android Chrome'}
            </p>
          </div>
          {!pushGranted ? (
            <button
              onClick={handleEnablePush}
              style={{
                background: 'var(--info)', color: '#fff', border: 'none',
                borderRadius: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer'
              }}
            >
              Enable
            </button>
          ) : (
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--accent)'
            }} />
          )}
        </div>
      </div>

      {/* What to notify */}
      <p className="section-header">What to notify</p>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <ToggleRow
            label="Missed task alert"
            desc="When a task is 30+ min overdue"
            on={form.notify_missed_task}
            onChange={v => setForm(f => ({ ...f, notify_missed_task: v }))}
            divider
          />
          <ToggleRow
            label="Daily brief"
            desc="Morning plan at 7am + night review at 10pm"
            on={form.notify_daily_brief}
            onChange={v => setForm(f => ({ ...f, notify_daily_brief: v }))}
            divider
          />
          <ToggleRow
            label="Penalty issued"
            desc="When a new penalty is created"
            on={form.notify_penalty}
            onChange={v => setForm(f => ({ ...f, notify_penalty: v }))}
          />
        </div>
      </div>

      {/* Escalation call */}
      <p className="section-header">Escalation</p>
      <div className="card" style={{ marginBottom: 16 }}>
        <ToggleRow
          label="Phone call escalation"
          desc="AI calls you after 3 consecutive failure days"
          on={form.call_enabled}
          onChange={v => setForm(f => ({ ...f, call_enabled: v }))}
        />
      </div>

      {/* Quiet hours */}
      <p className="section-header">Quiet hours</p>
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
          No notifications sent during this window
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>From</label>
            <input
              type="time"
              value={form.quiet_hours_start}
              onChange={e => setForm(f => ({ ...f, quiet_hours_start: e.target.value }))}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Until</label>
            <input
              type="time"
              value={form.quiet_hours_end}
              onChange={e => setForm(f => ({ ...f, quiet_hours_end: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: 15 }}>
        {saving ? 'Saving...' : 'Save settings'}
      </button>
    </div>
  )
}

function ToggleRow({ label, desc, on, onChange, disabled = false, divider = false }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 0', opacity: disabled ? 0.4 : 1,
      borderBottom: divider ? '1px solid var(--border)' : 'none'
    }}>
      <div style={{ flex: 1, paddingRight: 12 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>{label}</p>
        <p style={{ fontSize: 12, color: 'var(--text2)' }}>{desc}</p>
      </div>
      <div
        onClick={() => !disabled && onChange(!on)}
        style={{
          width: 46, height: 26, borderRadius: 13, flexShrink: 0,
          background: on ? '#378ADD' : 'var(--bg3)',
          border: '1px solid var(--border)',
          position: 'relative', cursor: disabled ? 'default' : 'pointer',
          transition: 'background 0.2s'
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: on ? 22 : 3,
          width: 18, height: 18, borderRadius: '50%',
          background: '#fff', transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
        }} />
      </div>
    </div>
  )
}
