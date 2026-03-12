import { NavLink } from 'react-router-dom';
import type { AppUser, Cycle } from '../types.js';

interface Props {
  cycle: Cycle | null;
  flaggedCount?: number;
  currentUser: AppUser;
  onSwitchUser: (email: string) => Promise<void>;
  children: React.ReactNode;
}

const DEMO_SWITCH_USERS = ['admin@demo.com', 'executive@demo.com', 'manager1@demo.com', 'manager2@demo.com'];

export function Layout({ cycle, flaggedCount = 0, currentUser, onSwitchUser, children }: Props) {
  const cycleName = cycle?.name ?? 'Loading cycle…';
  const cycleOpen = cycle?.status === 'open';

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">M</div>
          <div>
            <div className="logo-text">MeritCycle</div>
            <div className="logo-sub">Compensation Planning</div>
          </div>
        </div>

        <div className="sidebar-cycle-badge">
          <div className="cycle-name">{cycleName}</div>
          <div className="cycle-status">
            <span className="status-dot" style={cycleOpen ? {} : { background: '#9CA3AF' }} />
            {cycleOpen ? 'Open' : 'Closed'}
            {cycle?.closeDate ? ` — closes ${formatDate(cycle.closeDate)}` : ''}
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Cycle</div>
          <NavLink to="/" end className={navClass}><span className="nav-icon">⊞</span> Dashboard</NavLink>
          <NavLink to="/merit" className={navClass}>
            <span className="nav-icon">↑</span> Merit Recommendations
            {flaggedCount > 0 && <span className="nav-badge">{flaggedCount}</span>}
          </NavLink>
          <NavLink to="/employees" className={navClass}><span className="nav-icon">◎</span> Employee Roster</NavLink>
          <NavLink to="/planner" className={navClass}><span className="nav-icon">▦</span> Cycle Planner</NavLink>
          <div className="nav-section-label">Reports</div>
          <NavLink to="/executive" className={navClass}><span className="nav-icon">◈</span> Executive Summary</NavLink>
          {currentUser.role === 'admin' && (
            <>
              <div className="nav-section-label">Admin</div>
              <NavLink to="/admin" className={navClass}><span className="nav-icon">⚙</span> Admin Settings</NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="role-switcher">
            <label>Local Demo Mode</label>
            <select value={currentUser.email} onChange={(e) => void onSwitchUser(e.target.value)}>
              {DEMO_SWITCH_USERS.map((email) => <option key={email} value={email}>{email}</option>)}
            </select>
            <div style={{ marginTop: 8, color: 'var(--gray-500)', fontSize: 12 }}>
              Active role: <strong style={{ color: 'var(--gray-700)' }}>{currentUser.role}</strong>
              {currentUser.managerName ? ` (${currentUser.managerName})` : ''}
            </div>
          </div>
        </div>
      </aside>

      <div className="main">{children}</div>
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return `nav-item${isActive ? ' active' : ''}`;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
