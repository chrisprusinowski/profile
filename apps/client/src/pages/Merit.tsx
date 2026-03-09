import { useState, useMemo, useCallback } from 'react';
import type { Employee, Cycle, RecommendationMap, Recommendation } from '../types.js';
import { fmt, fmtK, initials, avatarColor, statusBadgeClass, ratingBadgeClass } from '../utils.js';
import { saveRecommendation, submitAllRecommendations } from '../api/client.js';

interface Props {
  employees: Employee[];
  cycle: Cycle | null;
  recommendations: RecommendationMap;
  showToast: (msg: string) => void;
  refreshRecommendations: () => Promise<void>;
}

const RATINGS = ['Exceptional', 'Exceeds Expectations', 'Meets Expectations', 'Needs Improvement'];

export function Merit({ employees, cycle, recommendations, showToast, refreshRecommendations }: Props) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalId, setModalId] = useState<string | null>(null);
  const [modalData, setModalData] = useState<Partial<Recommendation>>({});

  const guidelineMax = cycle?.guidelineMax ?? 10;

  // ── Budget ──────────────────────────────────────────────────
  const totalActualPayroll = employees.reduce((s, e) => s + e.salary, 0);
  const budgetTotal = cycle?.budgetTotal
    ? Number(cycle.budgetTotal)
    : totalActualPayroll * ((cycle?.budgetPct ?? 3.5) / 100);

  let allocated = 0;
  let sumPct = 0;
  for (const e of employees) {
    const pct = recommendations[e.id]?.meritPct ?? 0;
    allocated += e.salary * (pct / 100);
    sumPct += pct;
  }
  const avgPct = employees.length ? sumPct / employees.length : 0;
  const remaining = budgetTotal - allocated;
  const pctUsed = budgetTotal ? allocated / budgetTotal : 0;

  const depts = useMemo(
    () => [...new Set(employees.map((e) => e.department ?? '').filter(Boolean))].sort(),
    [employees],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter((e) => {
      const rec = recommendations[e.id];
      const s = rec?.status ?? 'Draft';
      if (deptFilter && e.department !== deptFilter) return false;
      if (statusFilter && s !== statusFilter) return false;
      if (!q) return true;
      return [e.name, e.title, e.department].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [employees, recommendations, search, deptFilter, statusFilter]);

  // ── Inline edit ─────────────────────────────────────────────
  const updatePct = useCallback(async (id: string, val: number) => {
    const pct = isNaN(val) ? 0 : Math.max(0, Math.min(25, val));
    const current = recommendations[id];
    const locked = current?.status === 'Approved';
    if (locked) return;
    const newStatus: Recommendation['status'] = pct > guidelineMax ? 'Flagged' : 'Submitted';
    await saveRecommendation(id, {
      meritPct: pct,
      rating: current?.rating ?? 'Meets Expectations',
      notes: current?.notes ?? '',
      status: newStatus,
    });
    await refreshRecommendations();
  }, [recommendations, guidelineMax, refreshRecommendations]);

  // ── Modal ───────────────────────────────────────────────────
  const openModal = (id: string) => {
    const rec = recommendations[id];
    setModalData({
      meritPct: rec?.meritPct ?? 0,
      rating: rec?.rating ?? 'Meets Expectations',
      notes: rec?.notes ?? '',
      status: rec?.status ?? 'Draft',
    });
    setModalId(id);
  };

  const closeModal = () => setModalId(null);

  const saveModal = async () => {
    if (!modalId) return;
    const pct = Math.max(0, Math.min(25, modalData.meritPct ?? 0));
    const newStatus: Recommendation['status'] = pct > guidelineMax ? 'Flagged' : 'Submitted';
    await saveRecommendation(modalId, { ...modalData, meritPct: pct, status: newStatus });
    await refreshRecommendations();
    const emp = employees.find((e) => e.id === modalId);
    showToast(`Saved — ${emp?.name ?? 'Employee'}`);
    closeModal();
  };

  const submitAll = async () => {
    const draftIds = employees
      .filter((e) => (recommendations[e.id]?.status ?? 'Draft') === 'Draft')
      .map((e) => e.id);
    if (!draftIds.length) { showToast('No draft recommendations to submit'); return; }
    await submitAllRecommendations(draftIds);
    await refreshRecommendations();
    showToast(`${draftIds.length} recommendation${draftIds.length !== 1 ? 's' : ''} submitted`);
  };

  const exportCsv = () => {
    if (!employees.length) { showToast('No data to export'); return; }
    const header = ['Name', 'Department', 'Title', 'Current Salary', 'Merit %', 'Proposed Salary', 'Performance Rating', 'Notes', 'Status'];
    const rows = employees.map((e) => {
      const rec = recommendations[e.id];
      const pct = rec?.meritPct ?? 0;
      return [e.name, e.department ?? '', e.title ?? '', e.salary, pct.toFixed(1), Math.round(e.salary * (1 + pct / 100)), rec?.rating ?? 'Meets Expectations', rec?.notes ?? '', rec?.status ?? 'Draft'];
    });
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'merit-recommendations.csv';
    a.click();
    showToast('Exported merit-recommendations.csv');
  };

  const modalEmployee = modalId ? employees.find((e) => e.id === modalId) : null;
  const modalSalary = modalEmployee?.salary ?? 0;
  const modalProposed = modalSalary * (1 + (modalData.meritPct ?? 0) / 100);
  const modalFlagged = (modalData.meritPct ?? 0) > guidelineMax;

  if (!employees.length) {
    return (
      <>
        <header className="topbar">
          <div className="topbar-left">
            <div className="page-title">Merit Recommendations</div>
            <div className="page-subtitle">Review and edit merit increases</div>
          </div>
        </header>
        <div className="page-content">
          <div className="table-wrap">
            <div className="empty-state">
              <div className="empty-state-icon">↑</div>
              <div className="empty-state-title">No employees in this cycle yet</div>
              <div className="empty-state-sub">
                Add your employee data to <code>data/employees.csv</code> to begin planning merit increases.
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <div className="page-title">Merit Recommendations</div>
          <div className="page-subtitle">{filtered.length} of {employees.length} employees</div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}>⬇ Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={submitAll}>Submit All Drafts</button>
        </div>
      </header>

      <div className="page-content">
        {/* Budget tracker */}
        <div className="budget-tracker">
          <div className="budget-tracker-header">
            <div className="budget-tracker-title">Budget Tracker</div>
            <span className={`badge ${pctUsed > 1 ? 'badge-red' : pctUsed > 0.85 ? 'badge-amber' : 'badge-green'}`}>
              {pctUsed > 1 ? 'Over Budget' : pctUsed > 0.85 ? 'Near Limit' : 'On Track'}
            </span>
          </div>
          <div className="budget-grid">
            <div>
              <div className="budget-item-label">Total Budget</div>
              <div className="budget-item-value">{fmtK(budgetTotal)}</div>
            </div>
            <div>
              <div className="budget-item-label">Allocated</div>
              <div className="budget-item-value">{fmtK(allocated)}</div>
            </div>
            <div>
              <div className="budget-item-label">Remaining</div>
              <div className="budget-item-value" style={{ color: remaining < 0 ? 'var(--red-600)' : undefined }}>
                {fmtK(remaining)}
              </div>
            </div>
            <div>
              <div className="budget-item-label">Avg Merit %</div>
              <div className="budget-item-value">{avgPct.toFixed(1)}%</div>
            </div>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${pctUsed > 1 ? 'red' : pctUsed > 0.85 ? 'amber' : 'green'}`}
              style={{ width: `${Math.min(pctUsed * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon">⌕</span>
            <input
              type="text"
              placeholder="Search employees…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="filter-select" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {depts.map((d) => <option key={d}>{d}</option>)}
          </select>
          <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option>Draft</option>
            <option>Submitted</option>
            <option>Approved</option>
            <option>Flagged</option>
          </select>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th className="numeric">Current Salary</th>
                <th className="numeric">Merit %</th>
                <th className="numeric">Proposed Salary</th>
                <th>Performance</th>
                <th>Notes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const rec = recommendations[e.id];
                const pct = rec?.meritPct ?? 0;
                const status = rec?.status ?? 'Draft';
                const proposed = e.salary * (1 + pct / 100);
                const flagged = pct > guidelineMax;
                const locked = status === 'Approved';
                const color = avatarColor(e.name);
                return (
                  <tr key={e.id} style={flagged ? { background: 'var(--amber-50)' } : undefined}>
                    <td>
                      <div className="employee-cell">
                        <div className="avatar" style={{ background: color }}>{initials(e.name)}</div>
                        <div>
                          <div className="employee-name">{e.name}</div>
                          <div className="employee-title">{e.title ?? ''}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="chip">{e.department ?? '—'}</span></td>
                    <td className="numeric">{fmt(e.salary)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <input
                        className="merit-pct-input"
                        type="number"
                        step="0.1"
                        min="0"
                        max="25"
                        defaultValue={pct}
                        key={`${e.id}-${pct}`}
                        disabled={locked}
                        onBlur={(ev) => updatePct(e.id, parseFloat(ev.target.value))}
                        onKeyDown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur(); }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--gray-400)', marginLeft: 2 }}>%</span>
                      {flagged && <span title={`Exceeds ${guidelineMax}% guideline`} style={{ color: 'var(--amber-600)', marginLeft: 4 }}>⚠</span>}
                    </td>
                    <td className="numeric fw-700">{fmt(proposed)}</td>
                    <td>
                      <span className={`badge ${ratingBadgeClass(rec?.rating ?? 'Meets Expectations')}`} style={{ fontSize: 11 }}>
                        {rec?.rating ?? 'Meets Expectations'}
                      </span>
                    </td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--gray-500)', fontSize: 12.5 }}>
                      {rec?.notes || <span style={{ color: 'var(--gray-300)' }}>—</span>}
                    </td>
                    <td className="actions">
                      <span className={`badge ${statusBadgeClass(status)}`}>{status}</span>
                      {!locked && (
                        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4 }} onClick={() => openModal(e.id)}>
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {modalId && modalEmployee && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-title">{modalEmployee.name}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                  {[modalEmployee.title, modalEmployee.department].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Current Salary</label>
                  <input className="form-input" readOnly value={fmt(modalSalary)} style={{ background: 'var(--gray-50)', color: 'var(--gray-600)' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Proposed Salary</label>
                  <input className="form-input" readOnly value={fmt(modalProposed)} style={{ background: 'var(--green-50)', color: 'var(--green-700)', fontWeight: 700 }} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Merit Increase %</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.1"
                  min="0"
                  max="25"
                  value={modalData.meritPct ?? 0}
                  style={{ fontSize: 16, fontWeight: 700 }}
                  onChange={(e) => setModalData((d) => ({ ...d, meritPct: parseFloat(e.target.value) || 0 }))}
                />
                {(modalData.meritPct ?? 0) > 0 && (
                  <div className="form-hint" style={{ color: modalFlagged ? 'var(--amber-600)' : 'var(--green-600)' }}>
                    +{fmt(modalProposed - modalSalary)} increase
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Performance Rating</label>
                <select
                  className="form-select"
                  value={modalData.rating ?? 'Meets Expectations'}
                  onChange={(e) => setModalData((d) => ({ ...d, rating: e.target.value }))}
                >
                  {RATINGS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Justification / Notes</label>
                <textarea
                  className="form-textarea"
                  placeholder="Add context for this recommendation…"
                  value={modalData.notes ?? ''}
                  onChange={(e) => setModalData((d) => ({ ...d, notes: e.target.value }))}
                />
              </div>
              {modalFlagged && (
                <div className="alert alert-amber" style={{ marginTop: 0 }}>
                  <div className="alert-icon">⚠</div>
                  <div>This increase exceeds the <strong>{guidelineMax}%</strong> guideline and will be flagged for additional approval.</div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={saveModal}>Save &amp; Submit</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
