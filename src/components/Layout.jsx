import { Outlet, useNavigate, useLocation } from 'react-router-dom'

const NAV = [
  {
    path: '/',
    label: 'Today',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
        <rect x="3" y="4" width="18" height="18" rx="3"/>
        <line x1="3" y1="9" x2="21" y2="9"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
      </svg>
    )
  },
  {
    path: '/chat',
    label: 'Coach',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    )
  },
  {
    path: '/habits',
    label: 'Habits',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
        <rect x="3" y="3" width="4" height="4" rx="1"/>
        <rect x="10" y="3" width="4" height="4" rx="1"/>
        <rect x="17" y="3" width="4" height="4" rx="1"/>
        <rect x="3" y="10" width="4" height="4" rx="1"/>
        <rect x="10" y="10" width="4" height="4" rx="1"/>
        <rect x="17" y="10" width="4" height="4" rx="1"/>
        <rect x="3" y="17" width="4" height="4" rx="1"/>
        <rect x="10" y="17" width="4" height="4" rx="1"/>
        <rect x="17" y="17" width="4" height="4" rx="1"/>
      </svg>
    )
  },
  {
    path: '/history',
    label: 'History',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    )
  },
  {
    path: '/performance',
    label: 'Stats',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    )
  },
  {
    path: '/profile',
    label: 'Profile',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
    )
  }
]

export default function Layout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Outlet />
      </div>
      <nav className="bottom-nav">
        {NAV.map(({ path, label, icon }) => {
          const active = pathname === path
          return (
            <button
              key={path}
              className={`nav-item ${active ? 'active' : ''}`}
              onClick={() => navigate(path)}
              style={{ background: 'none', border: 'none' }}
            >
              {icon(active)}
              <span>{label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
