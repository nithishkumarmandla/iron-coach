import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import {
  getOrCreateConversation,
  appendMessage
} from '../lib/ai'

const QUICK_REPLIES = ['I completed my task', 'I need help', 'I feel tired', 'Status update']

export default function CoachChat() {
  const { user } = useStore()

  const [convId, setConvId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessionType, setSessionType] = useState('coaching')

  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    async function load() {
      try {
        const hour = new Date().getHours()
        const type = hour < 10 ? 'morning_plan' : hour >= 21 ? 'night_review' : 'coaching'
        setSessionType(type)

        const conv = await getOrCreateConversation(user.id, type)
        setConvId(conv.id)
        setMessages(conv.messages ?? [])

        if ((conv.messages ?? []).length === 0 && type !== 'coaching') {
          await triggerOpeningMessage(conv.id, type)
        }
      } catch (err) {
        toast.error(err?.message ?? 'Failed to load chat')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function triggerOpeningMessage(currentConvId, type) {
    try {
      const reply = await callAICoach(user.id, null, type)
      const updated = await appendMessage(currentConvId, 'assistant', reply)
      setMessages(updated)
    } catch {
      // Silent fail: user can still type manually.
    }
  }

  async function handleSend(text) {
    const content = (text ?? input).trim()
    if (!content || sending) return

    setInput('')
    setSending(true)

    const optimistic = [...messages, {
      role: 'user',
      content,
      ts: new Date().toISOString()
    }]
    setMessages(optimistic)

    try {
      await appendMessage(convId, 'user', content)
      const reply = await callAICoach(user.id, content, sessionType)
      const updated = await appendMessage(convId, 'assistant', reply)
      setMessages(updated)
    } catch (err) {
      toast.error(err?.message ?? 'Failed to send')
      setMessages(messages)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  async function callAICoach(userId, userMessage, currentSessionType) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error('Not authenticated')

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const res = await fetch(`${supabaseUrl}/functions/v1/ai-coach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ userId, userMessage, sessionType: currentSessionType })
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error ?? `AI call failed (${res.status})`)
    }

    const data = await res.json()
    return data.reply
  }

  const sessionLabel = {
    morning_plan: 'Morning plan',
    night_review: 'Night review',
    coaching: 'Iron Coach'
  }[sessionType]

  if (loading) return <div className="spinner" />

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{
        padding: '14px 16px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
              {sessionLabel}
            </h2>
            <p style={{ fontSize: 11, color: 'var(--text3)' }}>
              {format(new Date(), 'EEEE, MMM d')}
            </p>
          </div>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--accent-dim)',
            border: '1px solid var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16
          }}>
            🤖
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && !sending && (
          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 6 }}>
              {sessionType === 'morning_plan'
                ? 'Good morning. Starting your daily plan...'
                : sessionType === 'night_review'
                ? 'Starting your night review...'
                : 'Your AI coach is ready.'}
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))}

        {sending && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'var(--bg3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              flexShrink: 0
            }}>🤖</div>
            <div style={{
              background: 'var(--bg3)',
              borderRadius: '16px 16px 16px 4px',
              padding: '10px 14px',
              maxWidth: '75%'
            }}>
              <TypingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {messages.length < 3 && (
        <div style={{
          padding: '8px 16px 0',
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          flexShrink: 0
        }}>
          {QUICK_REPLIES.map((reply) => (
            <button
              key={reply}
              onClick={() => handleSend(reply)}
              disabled={sending}
              style={{
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 20,
                padding: '6px 12px',
                fontSize: 12,
                color: 'var(--text2)',
                cursor: 'pointer'
              }}
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      <div style={{
        padding: '10px 16px 16px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg2)',
        display: 'flex',
        gap: 8,
        flexShrink: 0
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Message your coach..."
          disabled={sending}
          style={{ flex: 1, borderRadius: 22, padding: '10px 14px', fontSize: 14 }}
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || sending}
          style={{
            width: 42,
            height: 42,
            borderRadius: '50%',
            background: input.trim() ? 'var(--accent)' : 'var(--bg3)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            flexShrink: 0,
            transition: 'background 0.15s'
          }}
        >
          ↑
        </button>
      </div>
    </div>
  )
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  const time = message.ts
    ? new Date(message.ts).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    : ''

  return (
    <div style={{
      display: 'flex',
      gap: 8,
      alignItems: 'flex-end',
      flexDirection: isUser ? 'row-reverse' : 'row'
    }}>
      {!isUser && (
        <div style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: 'var(--bg3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          flexShrink: 0
        }}>🤖</div>
      )}
      <div style={{ maxWidth: '78%' }}>
        <div style={{
          background: isUser ? 'var(--accent)' : 'var(--bg3)',
          color: isUser ? '#000' : 'var(--text)',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          padding: '10px 14px',
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          {message.content}
        </div>
        {time && (
          <p style={{
            fontSize: 10,
            color: 'var(--text3)',
            marginTop: 3,
            textAlign: isUser ? 'right' : 'left'
          }}>{time}</p>
        )}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '2px 0' }}>
      {[0, 1, 2].map((index) => (
        <div key={index} style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--text3)',
          animation: `pulse 1.2s ease-in-out ${index * 0.2}s infinite`
        }} />
      ))}
      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
