import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useStore = create((set, get) => ({
  // Auth
  user: null,
  profile: null,
  authReady: false,

  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setAuthReady: (ready = true) => set({ authReady: ready }),

  // Fetch profile from DB after login
  fetchProfile: async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) throw error
    if (data) set({ profile: data })
    return data
  },

  // Ensure every authenticated user has a profile row.
  ensureProfile: async (user) => {
    if (!user) {
      set({ profile: null })
      return null
    }

    const existing = await get().fetchProfile(user.id)
    if (existing) return existing

    const baseUsername = (user.email?.split('@')[0] ?? 'user')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 18) || 'user'

    const fallbackProfile = {
      id: user.id,
      username: `${baseUsername}_${user.id.slice(0, 6)}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      utc_offset_mins: -new Date().getTimezoneOffset()
    }

    const { error } = await supabase
      .from('profiles')
      .upsert(fallbackProfile, { onConflict: 'id' })

    if (error) throw error

    return await get().fetchProfile(user.id)
  },

  // Sign out
  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null })
  },

  // Today's task instances (loaded by Dashboard)
  todayInstances: [],
  setTodayInstances: (instances) => set({ todayInstances: instances }),

  // Active timer state (one timer at a time)
  activeTimer: null,
  setActiveTimer: (timer) => set({ activeTimer: timer }),
  clearActiveTimer: () => set({ activeTimer: null }),
}))
