import type { Employee, Cycle, RecommendationMap } from '../types.js';
import { fmt, fmtK, avatarColor, initials, getEligibility } from '../utils.js';
import { buildBudgetSnapshot } from '../comp.js';

interface Props {
  employees: Employee[];
  cycle: Cycle | null;
  recommendations: RecommendationMap;
}

export function Dashboard({ employees, cycle, recommendations }: Props) {
  // ── Budget computations ──────────────────────────────────────
  const meritBudgetPct = cycle?.meritBudgetPercent ?? cycle?.budgetPct ?? 3.5;
  const guidelineMax = cycle?.guidelineMaxPercent ?? cycle?.guidelineMax ?? 10;

  const snapshot = buildBudgetSnapshot(employees, cycle, recommendations);
  const allocated = snapshot.meritAllocated;
  const bonusAllocated = snapshot.bonusAllocated;
  const statusCounts = { Draft: 0, Submitted: 0, Locked: 0 };
  const performanceDistribution: Record<string, number> = {
    '1': 0,
    '2': 0,
    '3': 0,
    Unrated: 0
  };

  for (const e of employees) {
    const rec = recommendations[e.id];
    const eligibility = getEligibility(e.hireDate, cycle);
    const eligibleBase = e.salary * eligibility.eligibilityPercent;
    const useOverride =
      eligibility.ineligible && Boolean(cycle?.allowEligibilityOverride);
    const budgetBase = useOverride ? e.salary : eligibleBase;

    const pct = rec?.meritPct ?? 0;

    const ratingKey = rec?.performanceRating
      ? String(rec.performanceRating)
      : 'Unrated';
    performanceDistribution[ratingKey] =
      (performanceDistribution[ratingKey] ?? 0) + 1;
    const s = (rec?.status ?? 'Draft') as keyof typeof statusCounts;
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const budgetTotal = snapshot.meritBudgetTotal;
  const avgPct = snapshot.avgMeritPct;
  const remaining = snapshot.remainingMeritBudget;
  const pctUsed = snapshot.pctUsed;
  const submitted = statusCounts.Submitted + statusCounts.Locked;
  const flagged = employees.filter(
    (e) => (recommendations[e.id]?.meritPct ?? 0) > guidelineMax
  ).length;

  // ── Department breakdown ──────────────────────────────────────
  const deptMap: Record<string, { payroll: number; headcount: number }> = {};
  for (const e of employees) {
    const d = e.department ?? 'Unassigned';
    deptMap[d] = deptMap[d] ?? { payroll: 0, headcount: 0 };
    deptMap[d].payroll += e.salary;
    deptMap[d].headcount += 1;
  }
  const meritPct = meritBudgetPct;
  const deptRows = Object.entries(deptMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dept, stats]) => ({
      dept,
      headcount: stats.headcount,
      payroll: stats.payroll,
      meritBudget: stats.payroll * (meritPct / 100)
    }));
  const maxMerit = Math.max(...deptRows.map((r) => r.meritBudget), 1);

  const depts = Object.keys(deptMap);
  const hasEmployees = employees.length > 0;

  const barColor = (pct: number) => {
    if (pct > 1) return '#DC2626';
    if (pct > 0.85) return '#D97706';
    return '#059669';
  };

  // ── Manager list (unique managers from employee data) ─────────
  const managerMap: Record<
    string,
    { name: string; reports: number; submitted: number }
  > = {};
  for (const e of employees) {
    const mgr = e.manager ?? 'Unassigned';
    managerMap[mgr] = managerMap[mgr] ?? {
      name: mgr,
      reports: 0,
      submitted: 0
    };
    managerMap[mgr].reports += 1;
    const rec = recommendations[e.id];
    if (rec && rec.status !== 'Draft') managerMap[mgr].submitted += 1;
  }
  const managers = Object.values(managerMap)
    .sort((a, b) => b.reports - a.reports)
    .slice(0, 8);

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">
            {cycle?.name ?? 'No active cycle'}
          </div>
        </div>
        <div className="topbar-right">
          <span
            className={`badge ${cycle?.status === 'open' ? 'badge-green' : 'badge-gray'}`}
          >
            {cycle?.status === 'open' ? '● Cycle Open' : cycle?.status === 'locked' ? '● Cycle Locked' : '○ Cycle Closed'}
          </span>
        </div>
      </header>

      <div className="page-content">
        {!hasEmployees && (
          <div className="alert alert-blue" style={{ marginBottom: 20 }}>
            <div className="alert-icon">⬆</div>
            <div style={{ flex: 1 }}>
              <strong>No employees loaded.</strong> Add rows to{' '}
              <code>data/employees.csv</code> and restart the API, or run the
              Vite build with the CSV in place to see real data.
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="timeline mb-20">
          {[
            'Cycle Open',
            'Manager Input',
            'HR Review',
            'Approvals',
            'Finalized'
          ].map((label, i) => {
            const done = i < 2;
            const active = i === 2;
            return (
              <div
                key={label}
                className={`timeline-step ${done ? 'done' : active ? 'active' : ''}`}
              >
                <div className="timeline-dot">{done ? '✓' : i + 1}</div>
                <div className="timeline-label">{label}</div>
              </div>
            );
          })}
        </div>

        {/* Metric cards */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon blue">$</div>
            <div className="metric-label">Cycle Budget</div>
            <div className="metric-value">{fmtK(budgetTotal)}</div>
            <div className="metric-sub">
              {meritBudgetPct.toFixed(2)}% of payroll basis
            </div>
          </div>

          <div className="metric-card">
            <div
              className="metric-icon"
              style={{
                background: 'var(--green-50)',
                color: 'var(--green-600)'
              }}
            >
              ✓
            </div>
            <div className="metric-label">Budget Allocated</div>
            <div className="metric-value">{fmtK(allocated)}</div>
            <div className="metric-sub">
              {(pctUsed * 100).toFixed(2)}% of budget used
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(pctUsed * 100, 100)}%`,
                  background: barColor(pctUsed)
                }}
              />
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon amber">◷</div>
            <div className="metric-label">Submitted</div>
            <div className="metric-value">
              {submitted} / {employees.length}
            </div>
            <div className="metric-sub">
              {employees.length - submitted} still pending
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill amber"
                style={{
                  width: employees.length
                    ? `${(submitted / employees.length) * 100}%`
                    : '0%'
                }}
              />
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon blue">◎</div>
            <div className="metric-label">Bonus Payout</div>
            <div className="metric-value">{fmtK(bonusAllocated)}</div>
            <div className="metric-sub">
              Payroll basis {fmt(snapshot.payrollBasis)} · {depts.length
                ? `Across ${depts.length} department${depts.length !== 1 ? 's' : ''}`
                : 'No departments mapped'}
            </div>
          </div>
        </div>

        {/* Two-column grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 20,
            marginBottom: 20
          }}
        >
          {/* Manager completion */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Manager Completion</div>
                <div className="card-subtitle">
                  Who has submitted recommendations
                </div>
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {managers.length === 0 ? (
                <div
                  style={{
                    padding: '24px 20px',
                    color: 'var(--gray-400)',
                    fontSize: 13,
                    textAlign: 'center'
                  }}
                >
                  No manager data available
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Manager</th>
                      <th style={{ textAlign: 'right' }}>Reports</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managers.map((m) => {
                      const done = m.submitted === m.reports;
                      const color = avatarColor(m.name);
                      return (
                        <tr key={m.name}>
                          <td>
                            <div className="employee-cell">
                              <div
                                className="avatar"
                                style={{ background: color, fontSize: 10 }}
                              >
                                {initials(m.name)}
                              </div>
                              <div className="employee-name">{m.name}</div>
                            </div>
                          </td>
                          <td className="numeric">{m.reports}</td>
                          <td>
                            {done ? (
                              <span className="badge badge-green">
                                Submitted
                              </span>
                            ) : m.submitted > 0 ? (
                              <span className="badge badge-amber">
                                In Progress ({m.submitted}/{m.reports})
                              </span>
                            ) : (
                              <span className="badge badge-gray">
                                Not Started
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Budget by department */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Budget by Department</div>
                <div className="card-subtitle">
                  Merit budget at {meritBudgetPct.toFixed(2)}% of payroll
                </div>
              </div>
            </div>
            <div className="card-body">
              {deptRows.length === 0 ? (
                <div
                  style={{
                    color: 'var(--gray-400)',
                    fontSize: 13,
                    textAlign: 'center',
                    padding: 20
                  }}
                >
                  No department data
                </div>
              ) : (
                <div className="bar-chart">
                  {deptRows.map((row, i) => {
                    const barPalette = [
                      '#4F46E5',
                      '#0891B2',
                      '#059669',
                      '#D97706',
                      '#DC2626',
                      '#7C3AED'
                    ];
                    const color = barPalette[i % barPalette.length];
                    const width = maxMerit
                      ? Math.max((row.meritBudget / maxMerit) * 100, 8)
                      : 0;
                    return (
                      <div className="bar-chart-row" key={row.dept}>
                        <div className="bar-chart-label">{row.dept}</div>
                        <div className="bar-chart-bar-wrap">
                          <div
                            className="bar-chart-bar"
                            style={{ width: `${width}%`, background: color }}
                          />
                        </div>
                        <div className="bar-chart-val">
                          {fmtK(row.meritBudget)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="divider" />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13
                }}
              >
                <span className="text-muted">Allocated so far</span>
                <span className="fw-700">
                  {fmt(allocated)} of {fmtK(budgetTotal)}
                </span>
              </div>
              <div className="progress-bar mt-8">
                <div
                  className="progress-fill blue"
                  style={{ width: `${Math.min(pctUsed * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Performance Rating Distribution</div>
            </div>
          </div>
          <div
            className="card-body"
            style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}
          >
            {Object.entries(performanceDistribution).map(([label, count]) => (
              <span
                key={label}
                className="badge badge-gray"
                style={{ fontSize: 13, padding: '8px 10px' }}
              >
                {label}: {count}
              </span>
            ))}
          </div>
        </div>

        {/* Action items */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Action Items</div>
              <div className="card-subtitle">
                Things that need attention before the cycle closes
              </div>
            </div>
          </div>
          <div
            className="card-body"
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {employees.length - submitted > 0 && (
              <div className="alert alert-amber" style={{ margin: 0 }}>
                <div className="alert-icon">⚠</div>
                <div>
                  <strong>
                    {employees.length - submitted} employee
                    {employees.length - submitted !== 1 ? 's' : ''} pending
                    recommendations
                  </strong>{' '}
                  — go to Merit Recommendations to complete them.
                </div>
              </div>
            )}
            {remaining > 0 && pctUsed < 0.5 && hasEmployees && (
              <div className="alert alert-blue" style={{ margin: 0 }}>
                <div className="alert-icon">ℹ</div>
                <div>
                  <strong>{fmtK(remaining)} remaining in budget</strong> — avg
                  merit % is {avgPct.toFixed(1)}%.
                </div>
              </div>
            )}
            {flagged > 0 && (
              <div className="alert alert-amber" style={{ margin: 0 }}>
                <div className="alert-icon">⚠</div>
                <div>
                  <strong>
                    {flagged} recommendation{flagged !== 1 ? 's' : ''} exceed{' '}
                    {guidelineMax}% guideline max
                  </strong>{' '}
                  — review flagged increases in Merit Recommendations.
                </div>
              </div>
            )}
            {pctUsed > 1 && (
              <div className="alert alert-red" style={{ margin: 0 }}>
                <div className="alert-icon">✕</div>
                <div>
                  <strong>
                    Over budget by {fmtK(allocated - budgetTotal)}
                  </strong>{' '}
                  — reduce some merit increases to stay within the cycle budget.
                </div>
              </div>
            )}
            {hasEmployees &&
              employees.length - submitted === 0 &&
              flagged === 0 &&
              pctUsed <= 1 && (
                <div className="alert alert-green" style={{ margin: 0 }}>
                  <div className="alert-icon">✓</div>
                  <div>
                    <strong>
                      All recommendations submitted and within budget.
                    </strong>{' '}
                    Ready for final approval.
                  </div>
                </div>
              )}
            {!hasEmployees && (
              <div className="alert alert-blue" style={{ margin: 0 }}>
                <div className="alert-icon">⬆</div>
                <div>
                  Add employees to <code>data/employees.csv</code> to begin
                  planning. See the README for the expected column format.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
