import { useState, useMemo } from 'react';
import type { Employee, Cycle, RecommendationMap } from '../types.js';
import { fmt, fmtDate, initials, avatarColor } from '../utils.js';

interface Props {
  employees: Employee[];
  cycle: Cycle | null;
  recommendations: RecommendationMap;
  showToast: (msg: string) => void;
}

export function Employees({ employees, showToast }: Props) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department ?? '').filter(Boolean))].sort(),
    [employees],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter((e) => {
      if (deptFilter && e.department !== deptFilter) return false;
      if (!q) return true;
      return [e.name, e.department, e.title, e.manager].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [employees, search, deptFilter]);

  function exportCsv() {
    if (!filtered.length) { showToast('No employees to export'); return; }
    const header = ['Name', 'Department', 'Title', 'Salary', 'Manager', 'Hire Date'];
    const rows = filtered.map((e) => [
      e.name,
      e.department ?? '',
      e.title ?? '',
      e.salary,
      e.manager ?? '',
      e.hireDate ?? '',
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'employees.csv';
    a.click();
    showToast('Exported employees.csv');
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <div className="page-title">Employee Roster</div>
          <div className="page-subtitle">{employees.length} employee{employees.length !== 1 ? 's' : ''} in cycle</div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}>⬇ Export</button>
        </div>
      </header>

      <div className="page-content">
        {employees.length === 0 ? (
          <div className="table-wrap">
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <div className="empty-state-title">No employees loaded</div>
              <div className="empty-state-sub">
                Add your employee data to <code>data/employees.csv</code> in the repo root.
                The expected columns are:<br />
                <code>id, name, email, department, title, salary, manager, hire_date</code>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="toolbar">
              <div className="search-box">
                <span className="search-icon">🔍</span>
                <input
                  type="search"
                  placeholder="Search by name, manager, title, or department"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                className="filter-select"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                <option value="">All departments</option>
                {departments.map((d) => <option key={d}>{d}</option>)}
              </select>
              <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--gray-500)' }}>
                {filtered.length} of {employees.length} employees
              </div>
            </div>

            <div className="table-wrap">
              {filtered.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🔍</div>
                  <div className="empty-state-title">No matches</div>
                  <div className="empty-state-sub">Try adjusting your search or department filter.</div>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Department</th>
                      <th>Title</th>
                      <th className="numeric">Salary</th>
                      <th>Manager</th>
                      <th>Hire Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <div className="employee-cell">
                            <div className="avatar" style={{ background: avatarColor(e.name) }}>
                              {initials(e.name)}
                            </div>
                            <div>
                              <div className="employee-name">{e.name}</div>
                              {e.email && <div className="employee-title">{e.email}</div>}
                            </div>
                          </div>
                        </td>
                        <td>{e.department ? <span className="chip">{e.department}</span> : '—'}</td>
                        <td>{e.title ?? '—'}</td>
                        <td className="numeric">{fmt(e.salary)}</td>
                        <td>{e.manager ?? '—'}</td>
                        <td>{fmtDate(e.hireDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
