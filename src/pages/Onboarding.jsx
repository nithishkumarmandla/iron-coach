import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { createTask } from '../lib/tasks'

const STEPS = [
  {
    id:      'goal',
    question: 'What is your main goal?',
    subtitle: 'Be honest — this shapes your entire schedule',
    options: [
      { value: 'fitness',  label: 'Get fit & healthy', icon: '💪' },
      { value: 'study',    label: 'Study / exam prep', icon: '📚' },
      { value: 'business', label: 'Build a side business', icon: '⚡' },
      { value: 'habits',   label: 'Fix my daily habits', icon: '🎯' },
      { value: 'all',      label: 'All of the above', icon: '🔥' }
    ]
  },
  {
    id:      'hours',
    question: 'How many free hours do you have per day?',
    subtitle: 'Outside work/college — be realistic',
    options: [
      { value: 1, label: '1–2 hours', icon: '⏱' },
      { value: 3, label: '3–4 hours', icon: '⏰' },
      { value: 5, label: '5–6 hours', icon: '🕐' },
      { value: 7, label: '7+ hours',  icon: '📅' }
    ]
  },
  {
    id:      'weakness',
    question: 'What is your biggest weakness?',
    subtitle: 'The system will specifically target this',
    options: [
      { value: 'morning',      label: 'Mornings — can\'t wake up', icon: '🌅' },
      { value: 'consistency',  label: 'Starting strong, fading out', icon: '📉' },
      { value: 'distraction',  label: 'Distracted by phone/social', icon: '📱' },
      { value: 'procrastination', label: 'Postponing everything', icon: '😤' }
    ]
  }
]

// Generate starter tasks based on answers
function generateStarterTasks(goal, hours, weakness) {
  const tasks = []

  // Wake up — always added
  tasks.push({
    title:          'Wake up',
    category:       'wake_up',
    task_type:      'fixed',
    scheduled_time: weakness === 'morning' ? '06:00' : '07:00',
    duration_mins:  5,
    days_of_week:   [1,2,3,4,5,6,7],
    proof_type:     ['photo'],
    difficulty:     weakness === 'morning' ? 2 : 1
  })

  // Sleep
  tasks.push({
    title:          'Sleep on time',
    category:       'sleep',
    task_type:      'fixed',
    scheduled_time: '23:00',
    duration_mins:  5,
    days_of_week:   [1,2,3,4,5,6,7],
    proof_type:     ['timer'],
    difficulty:     1
  })

  // Goal-specific tasks
  if (goal === 'fitness' || goal === 'all') {
    tasks.push({
      title:          'Morning exercise',
      category:       'exercise',
      task_type:      'flexible',
      scheduled_time: '07:30',
      duration_mins:  45,
      days_of_week:   [1,2,3,4,5],
      proof_type:     ['photo'],
      difficulty:     2
    })
  }

  if (goal === 'study' || goal === 'all') {
    const studyMins = hours >= 5 ? 120 : hours >= 3 ? 90 : 60
    tasks.push({
      title:          'Study session',
      category:       'study',
      task_type:      'flexible',
      scheduled_time: '09:00',
      duration_mins:  studyMins,
      days_of_week:   [1,2,3,4,5,6],
      proof_type:     ['timer'],
      difficulty:     2
    })
  }

  if (goal === 'business' || goal === 'all') {
    const hustleMins = hours >= 5 ? 90 : 60
    tasks.push({
      title:          'Side hustle work',
      category:       'hustle',
      task_type:      'flexible',
      scheduled_time: '19:00',
      duration_mins:  hustleMins,
      days_of_week:   [1,2,3,4,5,6,7],
      proof_type:     ['timer'],
      difficulty:     2
    })
  }

  if (goal === 'habits' || goal === 'all') {
    if (hours >= 3) {
      tasks.push({
        title:          'Evening walk / wind-down',
        category:       'exercise',
        task_type:      'flexible',
        scheduled_time: '20:00',
        duration_mins:  30,
        days_of_week:   [1,2,3,4,5,6,7],
        proof_type:     ['timer'],
        difficulty:     1
      })
    }
  }

  return tasks
}

export default function Onboarding() {
  const { user, fetchProfile } = useStore()
  const navigate               = useNavigate()

  const [step, setStep]         = useState(0)
  const [answers, setAnswers]   = useState({})
  const [saving, setSaving]     = useState(false)
  const [preview, setPreview]   = useState(null)  // generated tasks preview

  function handleSelect(value) {
    const current = STEPS[step]
    const newAnswers = { ...answers, [current.id]: value }
    setAnswers(newAnswers)

    if (step < STEPS.length - 1) {
      setTimeout(() => setStep(s => s + 1), 200)
    } else {
      // Last step — generate preview
      const tasks = generateStarterTasks(
        newAnswers.goal,
        newAnswers.hours,
        newAnswers.weakness
      )
      setPreview(tasks)
    }
  }

  async function handleConfirm() {
    setSaving(true)
    try {
      // Create all tasks
      for (const task of preview) {
        await createTask(user.id, task)
      }

      // Update profile timezone (already set on signup, just refresh)
      await fetchProfile(user.id)

      toast.success('Schedule created. Day 1 starts now.')
      localStorage.setItem('did_onboard', '1')
      navigate('/')
    } catch {
      toast.error('Failed to create schedule')
    } finally {
      setSaving(false)
    }
  }

  const current = STEPS[step]
  const progress = ((step) / STEPS.length) * 100

  // Preview screen
  if (preview) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg)',
        display: 'flex', flexDirection: 'column', padding: '32px 24px'
      }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'var(--accent)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, fontSize: 22
          }}>🔥</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Your starting schedule
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
            AI has built this based on your answers. You can edit tasks anytime.
          </p>
        </div>

        <div style={{ flex: 1, marginBottom: 20 }}>
          {preview.map((task, i) => (
            <div key={i} className="card" style={{ marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                background: 'var(--bg3)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 18
              }}>
                {{ wake_up:'🌅', sleep:'🌙', exercise:'💪', study:'📚', hustle:'⚡', custom:'✦' }[task.category]}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>{task.title}</p>
                <p style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {task.scheduled_time?.slice(0,5)} · {task.duration_mins} min ·{' '}
                  {[1,2,3,4,5].includes(task.days_of_week?.length) && task.days_of_week?.length === 5
                    ? 'Weekdays' : task.days_of_week?.length === 7 ? 'Daily' : `${task.days_of_week?.length} days/week`}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={saving}
            style={{ fontSize: 16, padding: '14px 0' }}
          >
            {saving ? 'Creating...' : 'Start Iron Coach →'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => { setPreview(null); setStep(0); setAnswers({}) }}
            style={{ fontSize: 14 }}
          >
            Start over
          </button>
        </div>
      </div>
    )
  }

  // Question steps
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', padding: '48px 24px 32px'
    }}>
      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--bg3)', borderRadius: 2, marginBottom: 40, overflow: 'hidden' }}>
        <div style={{
          height: '100%', background: 'var(--accent)', borderRadius: 2,
          width: `${progress}%`, transition: 'width 0.3s ease'
        }} />
      </div>

      {/* Step indicator */}
      <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        {step + 1} of {STEPS.length}
      </p>

      {/* Question */}
      <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginBottom: 8, lineHeight: 1.3 }}>
        {current.question}
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 32 }}>
        {current.subtitle}
      </p>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {current.options.map(opt => {
          const selected = answers[current.id] === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                background: selected ? 'var(--accent-dim)' : 'var(--bg2)',
                border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                textAlign: 'left', transition: 'all 0.15s'
              }}
            >
              <span style={{ fontSize: 24 }}>{opt.icon}</span>
              <span style={{ fontSize: 15, fontWeight: 500, color: selected ? 'var(--accent)' : 'var(--text)' }}>
                {opt.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}