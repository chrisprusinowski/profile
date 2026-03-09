import { NavLink, useNavigate } from 'react-router-dom';
import type { Cycle } from '../types.js';

interface Props {
  cycle: Cycle | null;
  flaggedCount?: number;
  children: React.ReactNode;
}

export function Layout({ cycle, flaggedCount = 0, children }: Props) {
  const navigate = useNavigate();

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
          <NavLink to="/" end className={navClass}>
            <span className="nav-icon">⊞</span> Dashboard
          </NavLink>
          <NavLink to="/merit" className={navClass}>
            <span className="nav-icon">↑</span> Merit Recommendations
            {flaggedCount > 0 && <span className="nav-badge">{flaggedCount}</span>}
          </NavLink>
          <NavLink to="/employees" className={navClass}>
            <span className="nav-icon">◎</span> Employee Roster
          </NavLink>
          <div className="nav-section-label">Reports</div>
          <NavLink to="/executive" className={navClass}>
            <span className="nav-icon">◈</span> Executive Summary
          </NavLink>
          <div className="nav-section-label">Admin</div>
          <NavLink to="/admin" className={navClass}>
            <span className="nav-icon">⚙</span> Cycle Settings
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="role-switcher">
            <label>Navigation</label>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) navigate(e.target.value);
                e.target.value = '';
              }}
            >
              <option value="">Jump to page…</option>
              <option value="/">Dashboard</option>
              <option value="/merit">Merit Recommendations</option>
              <option value="/employees">Employee Roster</option>
              <option value="/executive">Executive Summary</option>
              <option value="/admin">Cycle Settings</option>
            </select>
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
