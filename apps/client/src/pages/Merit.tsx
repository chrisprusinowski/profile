import { useState, useMemo, useCallback } from 'react';
import type {
  Employee,
  Cycle,
  RecommendationMap,
  Recommendation,
  AppUser
} from '../types.js';
import { fmt, fmtK, initials, avatarColor, statusBadgeClass, getEligibility } from '../utils.js';
import { buildBudgetSnapshot } from '../comp.js';
import {
  lockAllRecommendations,
  reopenAllRecommendations,
  saveRecommendation,
  submitAllRecommendations
} from '../api/client.js';

interface Props {
  employees: Employee[];
  cycle: Cycle | null;
  recommendations: RecommendationMap;
  showToast: (msg: string) => void;
  refreshRecommendations: () => Promise<void>;
  readOnly?: boolean;
  currentUser: AppUser;
}

const PERFORMANCE_RATINGS: Array<1 | 2 | 3> = [1, 2, 3];

export function Merit({
  employees,
  cycle,
  recommendations,
  showToast,
  refreshRecommendations,
  readOnly = false,
  currentUser
}: Props) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modalId, setModalId] = useState<string | null>(null);
  const [modalData, setModalData] = useState<Partial<Recommendation>>({});
  const [savingEmployeeId, setSavingEmployeeId] = useState<string | null>(null);

  const guidelineMax = cycle?.guidelineMaxPercent ?? 10;
  const snapshot = buildBudgetSnapshot(employees, cycle, recommendations);
  const allocated = snapshot.meritAllocated;
  const bonusAllocated = snapshot.bonusAllocated;
  const budgetTotal = snapshot.meritBudgetTotal;
  const bonusBudgetTotal = snapshot.bonusBudgetTotal;
  const avgPct = snapshot.avgMeritPct;
  const remaining = snapshot.remainingMeritBudget;
  const pctUsed = snapshot.pctUsed;

  const depts = useMemo(
    () =>
      [
        ...new Set(employees.map((e) => e.department ?? '').filter(Boolean))
      ].sort(),
    [employees]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter((e) => {
      const rec = recommendations[e.id];
      const s = rec?.status ?? 'Draft';
      if (deptFilter && e.department !== deptFilter) return false;
      if (statusFilter && s !== statusFilter) return false;
      if (!q) return true;
      return [e.name, e.title, e.department]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [employees, recommendations, search, deptFilter, statusFilter]);

  const saveForEmployee = useCallback(
    async (employeeId: string, patch: Partial<Recommendation>) => {
      const current = recommendations[employeeId];
      const meritPct = patch.meritPct ?? current?.meritPct ?? 0;
      const eligibility = employees.find((emp) => emp.id === employeeId)
        ? getEligibility(
            employees.find((emp) => emp.id === employeeId)?.hireDate,
            cycle
          )
        : { ineligible: false };
      const locked =
        readOnly ||
        cycle?.status !== 'open' ||
        current?.status === 'Submitted' ||
        current?.status === 'Locked' ||
        (eligibility.ineligible && !cycle?.allowEligibilityOverride);
      if (locked) return;

      if (meritPct < 0) {
        showToast('Merit % cannot be negative');
        return;
      }

      const bonusPayoutPercent =
        patch.bonusPayoutPercent ?? current?.bonusPayoutPercent ?? 0;
      const bonusPayoutAmount =
        patch.bonusPayoutAmount ?? current?.bonusPayoutAmount ?? 0;
      if (bonusPayoutPercent < 0 || bonusPayoutAmount < 0) {
        showToast('Bonus values cannot be negative');
        return;
      }

      const next: Partial<Recommendation> = {
        meritPct,
        performanceRating: (patch.performanceRating ??
          current?.performanceRating ??
          2) as 1 | 2 | 3,
        bonusTargetPercent:
          patch.bonusTargetPercent ?? current?.bonusTargetPercent ?? null,
        bonusPayoutPercent,
        bonusPayoutAmount,
        notes: patch.notes ?? current?.notes ?? '',
        status:
          meritPct > guidelineMax
            ? 'Draft'
            : (patch.status ?? current?.status ?? 'Draft')
      };

      setSavingEmployeeId(employeeId);
      try {
        await saveRecommendation(employeeId, next);
        await refreshRecommendations();
      } catch (error) {
        showToast(
          error instanceof Error
            ? error.message
            : 'Failed to save recommendation'
        );
      } finally {
        setSavingEmployeeId(null);
      }
    },
    [
      cycle,
      employees,
      guidelineMax,
      readOnly,
      recommendations,
      refreshRecommendations,
      showToast
    ]
  );

  const openModal = (id: string) => {
    const rec = recommendations[id];
    setModalData({
      meritPct: rec?.meritPct ?? 0,
      performanceRating: rec?.performanceRating ?? 2,
      bonusTargetPercent: rec?.bonusTargetPercent ?? null,
      bonusPayoutPercent: rec?.bonusPayoutPercent ?? 0,
      bonusPayoutAmount: rec?.bonusPayoutAmount ?? 0,
      notes: rec?.notes ?? '',
      status: rec?.status ?? 'Draft'
    });
    setModalId(id);
  };

  const saveModal = async () => {
    if (!modalId || readOnly) return;
    await saveForEmployee(modalId, modalData);
    showToast('Recommendation saved');
    setModalId(null);
  };

  const submitAll = async () => {
    const draftIds = employees
      .filter((e) => (recommendations[e.id]?.status ?? 'Draft') === 'Draft')
      .map((e) => e.id);
    if (readOnly || cycle?.status !== 'open') {
      showToast('Recommendations can only be submitted while cycle is open');
      return;
    }
    if (!draftIds.length) {
      showToast('No draft recommendations to submit');
      return;
    }
    await submitAllRecommendations(draftIds);
    await refreshRecommendations();
    showToast(
      `${draftIds.length} recommendation${draftIds.length !== 1 ? 's' : ''} submitted`
    );
  };

  const modalEmployee = modalId
    ? employees.find((e) => e.id === modalId)
    : null;
  const isCycleOpen = cycle?.status === 'open';

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <div className="page-title">Comp Planning</div>
          <div className="page-subtitle">
            {readOnly ? 'Read-only mode · ' : ''}
            {!isCycleOpen ? 'Cycle closed/locked · ' : ''}
            {filtered.length} of {employees.length} employees
          </div>
        </div>
        <div className="topbar-right">
          {!readOnly && (
            <button
              className="btn btn-primary btn-sm"
              onClick={submitAll}
              disabled={!isCycleOpen}
            >
              Submit All Drafts
            </button>
          )}
          {currentUser.role === 'admin' && (
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  const r = await lockAllRecommendations();
                  await refreshRecommendations();
                  showToast(`Locked ${r.locked}`);
                }}
                style={{ marginLeft: 8 }}
              >
                Lock Submitted
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  const r = await reopenAllRecommendations();
                  await refreshRecommendations();
                  showToast(`Reopened ${r.reopened}`);
                }}
                style={{ marginLeft: 8 }}
              >
                Reopen Locked
              </button>
            </>
          )}
        </div>
      </header>

      <div className="page-content">
        <div className="budget-tracker">
          <div className="budget-grid">
            <div>
              <div className="budget-item-label">Merit Budget</div>
              <div className="budget-item-value">{fmtK(budgetTotal)}</div>
            </div>
            <div>
              <div className="budget-item-label">Merit Allocated</div>
              <div className="budget-item-value">{fmtK(allocated)}</div>
            </div>
            <div>
              <div className="budget-item-label">Bonus Budget</div>
              <div className="budget-item-value">{fmtK(bonusBudgetTotal)}</div>
            </div>
            <div>
              <div className="budget-item-label">Avg Merit %</div>
              <div className="budget-item-value">{avgPct.toFixed(2)}%</div>
            </div>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${pctUsed > 1 ? 'red' : pctUsed > 0.85 ? 'amber' : 'green'}`}
              style={{ width: `${Math.min(pctUsed * 100, 100)}%` }}
            />
          </div>
          <div className="metric-sub" style={{ marginTop: 8 }}>
            Remaining merit budget: {fmtK(remaining)} • Payroll basis:{' '}
            {fmtK(snapshot.payrollBasis)} • Bonus allocated: {fmtK(bonusAllocated)}
          </div>
        </div>

        <div className="toolbar">
          <div className="search-box">
            <span className="search-icon">⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees…"
            />
          </div>
          <select
            className="filter-select"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="">All Departments</option>
            {depts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option>Draft</option>
            <option>Submitted</option>
            <option>Locked</option>
          </select>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th className="numeric">Salary</th>
                <th>Eligibility</th>
                <th className="numeric">Proration %</th>
                <th>Pay Band</th>
                <th className="numeric">Compa</th>
                <th className="numeric">Merit %</th>
                <th className="numeric">Bonus %</th>
                <th className="numeric">Bonus $</th>
                <th>Performance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={11}
                    className="text-muted"
                    style={{ textAlign: 'center', padding: 20 }}
                  >
                    No employees match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((e) => {
                const rec = recommendations[e.id];
                const meritPct = rec?.meritPct ?? 0;
                const status = rec?.status ?? 'Draft';
                const eligibility = getEligibility(e.hireDate, cycle);
                const ineligible =
                  eligibility.ineligible && !cycle?.allowEligibilityOverride;
                const locked =
                  readOnly ||
                  cycle?.status !== 'open' ||
                  status === 'Submitted' ||
                  status === 'Locked' ||
                  savingEmployeeId === e.id ||
                  ineligible;

                const pay = e.payRange;
                const payBandLabel =
                  pay?.bandStatus === 'below_range'
                    ? 'Below range'
                    : pay?.bandStatus === 'above_range'
                      ? 'Above range'
                      : pay?.bandStatus === 'in_range'
                        ? 'In range'
                        : 'No range matched';

                return (
                  <tr key={e.id} className={ineligible ? 'row-ineligible' : ''}>
                    <td>
                      <div className="employee-cell">
                        <div
                          className="avatar"
                          style={{ background: avatarColor(e.name) }}
                        >
                          {initials(e.name)}
                        </div>
                        <div>
                          <div className="employee-name">{e.name}</div>
                          <div className="employee-title">
                            {e.department ?? '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="numeric">{fmt(e.salary)}</td>
                    <td>
                      {ineligible ? (
                        <span className="badge badge-red">Ineligible</span>
                      ) : (
                        eligibility.label
                      )}
                    </td>
                    <td className="numeric">
                      {(eligibility.eligibilityPercent * 100).toFixed(1)}%
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {pay?.matchedRangeMin != null &&
                      pay?.matchedRangeMax != null ? (
                        <div>
                          <div>
                            {fmt(pay.matchedRangeMin)} -{' '}
                            {fmt(pay.matchedRangeMax)}
                          </div>
                          <div className="employee-title">
                            {payBandLabel}
                            {pay?.matchedBy ? ` · ${pay.matchedBy}` : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted">No range matched</span>
                      )}
                    </td>
                    <td className="numeric">
                      {pay?.compaRatio != null
                        ? `${(pay.compaRatio * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td>
                      <input
                        className="merit-pct-input"
                        type="number"
                        step="0.01"
                        defaultValue={meritPct}
                        key={`${e.id}-m-${meritPct}`}
                        disabled={locked}
                        onBlur={(ev) =>
                          void saveForEmployee(e.id, {
                            meritPct: parseFloat(ev.target.value) || 0
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="merit-pct-input"
                        type="number"
                        step="0.01"
                        defaultValue={rec?.bonusPayoutPercent ?? 0}
                        key={`${e.id}-bp-${rec?.bonusPayoutPercent ?? 0}`}
                        disabled={locked}
                        onBlur={(ev) =>
                          void saveForEmployee(e.id, {
                            bonusPayoutPercent: parseFloat(ev.target.value) || 0
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="merit-pct-input"
                        type="number"
                        step="100"
                        defaultValue={rec?.bonusPayoutAmount ?? 0}
                        key={`${e.id}-ba-${rec?.bonusPayoutAmount ?? 0}`}
                        disabled={locked}
                        onBlur={(ev) =>
                          void saveForEmployee(e.id, {
                            bonusPayoutAmount: parseFloat(ev.target.value) || 0
                          })
                        }
                      />
                    </td>
                    <td>
                      <select
                        className="form-select"
                        value={rec?.performanceRating ?? 2}
                        disabled={locked}
                        onChange={(ev) =>
                          void saveForEmployee(e.id, {
                            performanceRating: Number(ev.target.value) as
                              | 1
                              | 2
                              | 3
                          })
                        }
                      >
                        {PERFORMANCE_RATINGS.map((rating) => (
                          <option key={rating} value={rating}>
                            {rating}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="actions">
                      <span className={`badge ${statusBadgeClass(status)}`}>
                        {status}
                      </span>
                      {meritPct > guidelineMax && (
                        <span className="badge badge-amber" style={{ marginRight: 6 }}>
                          Above guideline
                        </span>
                      )}
                      {!locked && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => openModal(e.id)}
                        >
                          Notes
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

      {modalId && modalEmployee && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalId(null);
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{modalEmployee.name}</div>
              <button className="modal-close" onClick={() => setModalId(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Bonus target % (optional)</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  value={modalData.bonusTargetPercent ?? ''}
                  onChange={(e) =>
                    setModalData((d) => ({
                      ...d,
                      bonusTargetPercent: e.target.value
                        ? parseFloat(e.target.value)
                        : null
                    }))
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-textarea"
                  value={modalData.notes ?? ''}
                  onChange={(e) =>
                    setModalData((d) => ({ ...d, notes: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setModalId(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void saveModal()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
