import type { Employee, Cycle, RecommendationMap } from '../types.js';
import { fmt, fmtK } from '../utils.js';

interface Props {
  employees: Employee[];
  cycle: Cycle | null;
  recommendations: RecommendationMap;
}

export function Executive({ employees, cycle, recommendations }: Props) {
  const guidelineMax = cycle?.guidelineMax ?? 10;
  const totalActualPayroll = employees.reduce((s, e) => s + e.salary, 0);
  const budgetTotal = cycle?.budgetTotal
    ? Number(cycle.budgetTotal)
    : totalActualPayroll * ((cycle?.budgetPct ?? 3.5) / 100);

  // ── Status counts ──────────────────────────────────────────
  const statusCounts = { Draft: 0, Submitted: 0, Locked: 0 };
  let allocated = 0;
  let bonusAllocated = 0;
  let sumPct = 0;
  let flaggedDollar = 0;
  const performanceDistribution: Record<string, number> = {
    '1': 0,
    '2': 0,
    '3': 0,
    Unrated: 0
  };

  for (const e of employees) {
    const rec = recommendations[e.id];
    const pct = rec?.meritPct ?? 0;
    const inc = e.salary * (pct / 100);
    allocated += inc;
    bonusAllocated += rec?.bonusPayoutAmount ?? 0;
    sumPct += pct;
    const ratingKey = rec?.performanceRating
      ? String(rec.performanceRating)
      : 'Unrated';
    performanceDistribution[ratingKey] =
      (performanceDistribution[ratingKey] ?? 0) + 1;
    const s = (rec?.status ?? 'Draft') as keyof typeof statusCounts;
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    if (pct > guidelineMax) flaggedDollar += inc;
  }

  const avgPct = employees.length ? sumPct / employees.length : 0;
  const pctUsed = budgetTotal ? allocated / budgetTotal : 0;
  const submitted = statusCounts.Submitted + statusCounts.Locked;
  const guidelineFlagged = employees.filter((e) => (recommendations[e.id]?.meritPct ?? 0) > guidelineMax).length;

  const belowRange = employees.filter((e) => e.payRange?.bandStatus === 'below_range').length;
  const aboveRange = employees.filter((e) => e.payRange?.bandStatus === 'above_range').length;
  const noRange = employees.filter((e) => !e.payRange || e.payRange.bandStatus === 'no_range').length;

  const compaByDept: Record<string, { total: number; count: number }> = {};
  for (const e of employees) {
    const ratio = e.payRange?.compaRatio;
    if (ratio == null) continue;
    const key = e.department ?? 'Unassigned';
    compaByDept[key] = compaByDept[key] ?? { total: 0, count: 0 };
    compaByDept[key].total += ratio;
    compaByDept[key].count += 1;
  }
  const avgCompaByDept = Object.entries(compaByDept).map(([dept, v]) => ({ dept, avg: v.total / v.count })).sort((a, b) => b.avg - a.avg);

  // ── Department rollup ──────────────────────────────────────
  const deptMap: Record<
    string,
    { payroll: number; allocated: number; headcount: number; submitted: number }
  > = {};
  for (const e of employees) {
    const d = e.department ?? 'Unassigned';
    deptMap[d] = deptMap[d] ?? {
      payroll: 0,
      allocated: 0,
      headcount: 0,
      submitted: 0
    };
    deptMap[d].payroll += e.salary;
    deptMap[d].headcount += 1;
    const rec = recommendations[e.id];
    const pct = rec?.meritPct ?? 0;
    deptMap[d].allocated += e.salary * (pct / 100);
    if (rec && rec.status !== 'Draft') deptMap[d].submitted += 1;
  }

  const deptRows = Object.entries(deptMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dept, stats]) => ({
      dept,
      headcount: stats.headcount,
      payroll: stats.payroll,
      allocated: stats.allocated,
      meritPct: stats.payroll ? (stats.allocated / stats.payroll) * 100 : 0,
      submittedPct: stats.headcount ? stats.submitted / stats.headcount : 0
    }));

  const barPalette = [
    '#4F46E5',
    '#0891B2',
    '#059669',
    '#D97706',
    '#DC2626',
    '#7C3AED'
  ];

  // ── Distribution of merit % ────────────────────────────────
  const buckets = [
    { label: '0%', count: 0 },
    { label: '0–2%', count: 0 },
    { label: '2–4%', count: 0 },
    { label: '4–6%', count: 0 },
    { label: '6–8%', count: 0 },
    { label: `8–${guidelineMax}%`, count: 0 },
    { label: `>${guidelineMax}%`, count: 0 }
  ];
  for (const e of employees) {
    const pct = recommendations[e.id]?.meritPct ?? 0;
    if (pct === 0) buckets[0].count++;
    else if (pct < 2) buckets[1].count++;
    else if (pct < 4) buckets[2].count++;
    else if (pct < 6) buckets[3].count++;
    else if (pct < 8) buckets[4].count++;
    else if (pct <= guidelineMax) buckets[5].count++;
    else buckets[6].count++;
  }
  const maxBucket = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <div className="page-title">Executive Summary</div>
          <div className="page-subtitle">{cycle?.name ?? 'Merit Cycle'}</div>
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

        {employees.length === 0 && (
          <div className="alert alert-blue" style={{ marginBottom: 20 }}>
            <div className="alert-icon">ℹ</div>
            <div>No employee data loaded yet. Import employees and pay ranges to unlock executive metrics.</div>
          </div>
        )}
        {/* KPI row */}
        <div
          className="metrics-grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))'
          }}
        >
          <div className="metric-card">
            <div className="metric-icon blue">$</div>
            <div className="metric-label">Total Budget</div>
            <div className="metric-value">{fmtK(budgetTotal)}</div>
            <div className="metric-sub">
              {(cycle?.budgetPct ?? 3.5).toFixed(1)}% of payroll
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon green">↑</div>
            <div className="metric-label">Merit Allocated</div>
            <div className="metric-value">{fmtK(allocated)}</div>
            <div className="metric-sub">
              {Math.round(pctUsed * 100)}% of budget
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon blue">%</div>
            <div className="metric-label">Avg Merit %</div>
            <div className="metric-value">{avgPct.toFixed(1)}%</div>
            <div className="metric-sub">Across all employees</div>
          </div>
          <div className="metric-card">
            <div className="metric-icon amber">⚠</div>
            <div className="metric-label">Over Guideline</div>
            <div className="metric-value">{guidelineFlagged}</div>
            <div className="metric-sub">
              {fmtK(flaggedDollar)} in flagged increases
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon green">✓</div>
            <div className="metric-label">Bonus Payout</div>
            <div className="metric-value">{fmtK(bonusAllocated)}</div>
            <div className="metric-sub">Total planned payout</div>
          </div>
          <div className="metric-card">
            <div className="metric-icon green">✓</div>
            <div className="metric-label">Submitted</div>
            <div className="metric-value">
              {submitted} / {employees.length}
            </div>
            <div className="metric-sub">
              {employees.length - submitted} still pending
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon amber">↓</div>
            <div className="metric-label">Below Range</div>
            <div className="metric-value">{belowRange}</div>
            <div className="metric-sub">Employees below pay band</div>
          </div>
          <div className="metric-card">
            <div className="metric-icon red">↑</div>
            <div className="metric-label">Above Range</div>
            <div className="metric-value">{aboveRange}</div>
            <div className="metric-sub">Employees above pay band</div>
          </div>
          <div className="metric-card">
            <div className="metric-icon blue">∅</div>
            <div className="metric-label">No Match</div>
            <div className="metric-value">{noRange}</div>
            <div className="metric-sub">Employees without range mapping</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div className="card-title">Performance Rating Distribution</div>
          </div>
          <div
            className="card-body"
            style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
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

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><div className="card-title">Average Compa-Ratio by Department</div></div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {avgCompaByDept.length === 0 ? (
              <div className="text-muted">No matched pay ranges yet.</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Department</th><th className="numeric">Avg Compa-Ratio</th></tr></thead>
                <tbody>
                  {avgCompaByDept.map((row) => (
                    <tr key={row.dept}><td>{row.dept}</td><td className="numeric">{(row.avg * 100).toFixed(1)}%</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Department breakdown + distribution */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '3fr 2fr',
            gap: 20,
            marginBottom: 20
          }}
        >
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Budget by Department</div>
                <div className="card-subtitle">
                  Merit allocation vs headcount
                </div>
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th style={{ textAlign: 'right' }}>HC</th>
                    <th style={{ textAlign: 'right' }}>Payroll</th>
                    <th style={{ textAlign: 'right' }}>Allocated</th>
                    <th style={{ textAlign: 'right' }}>Avg %</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {deptRows.map((row, i) => (
                    <tr key={row.dept}>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: 3,
                            background: barPalette[i % barPalette.length],
                            marginRight: 8
                          }}
                        />
                        {row.dept}
                      </td>
                      <td className="numeric">{row.headcount}</td>
                      <td className="numeric">{fmtK(row.payroll)}</td>
                      <td className="numeric">{fmt(row.allocated)}</td>
                      <td className="numeric">{row.meritPct.toFixed(1)}%</td>
                      <td style={{ width: 80 }}>
                        <div className="progress-bar" style={{ marginTop: 0 }}>
                          <div
                            className="progress-fill blue"
                            style={{ width: `${row.submittedPct * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-footer">
              <span className="text-muted">Total allocated</span>
              <span className="fw-700">
                {fmt(allocated)} of {fmtK(budgetTotal)}
              </span>
            </div>
          </div>

          {/* Merit % distribution */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Merit % Distribution</div>
                <div className="card-subtitle">
                  Employee count by increase range
                </div>
              </div>
            </div>
            <div className="card-body">
              <div className="bar-chart">
                {buckets.map((b, i) => {
                  const width = maxBucket
                    ? Math.max((b.count / maxBucket) * 100, b.count ? 4 : 0)
                    : 0;
                  const color =
                    i === 0
                      ? '#9CA3AF'
                      : i === buckets.length - 1
                        ? '#DC2626'
                        : barPalette[i % barPalette.length];
                  return (
                    <div className="bar-chart-row" key={b.label}>
                      <div className="bar-chart-label" style={{ width: 80 }}>
                        {b.label}
                      </div>
                      <div className="bar-chart-bar-wrap">
                        <div
                          className="bar-chart-bar"
                          style={{ width: `${width}%`, background: color }}
                        />
                      </div>
                      <div className="bar-chart-val" style={{ width: 40 }}>
                        {b.count}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="divider" />
              <div style={{ fontSize: 12.5, color: 'var(--gray-500)' }}>
                {guidelineFlagged > 0 && (
                  <div
                    className="alert alert-amber"
                    style={{ margin: 0, padding: '8px 12px' }}
                  >
                    <div className="alert-icon" style={{ fontSize: 13 }}>
                      ⚠
                    </div>
                    <div>
                      {guidelineFlagged} increase
                      {guidelineFlagged !== 1 ? 's' : ''} exceed{' '}
                      {guidelineMax}% guideline
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Budget health */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Budget Health</div>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: 40, alignItems: 'center' }}>
              <div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--gray-500)',
                    marginBottom: 4
                  }}
                >
                  Total Budget
                </div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>
                  {fmtK(budgetTotal)}
                </div>
              </div>
              <div style={{ fontSize: 28, color: 'var(--gray-300)' }}>→</div>
              <div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--gray-500)',
                    marginBottom: 4
                  }}
                >
                  Allocated
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: pctUsed > 1 ? 'var(--red-600)' : 'var(--green-600)'
                  }}
                >
                  {fmtK(allocated)}
                </div>
              </div>
              <div style={{ fontSize: 28, color: 'var(--gray-300)' }}>→</div>
              <div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--gray-500)',
                    marginBottom: 4
                  }}
                >
                  Remaining
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color:
                      budgetTotal - allocated < 0
                        ? 'var(--red-600)'
                        : 'var(--gray-900)'
                  }}
                >
                  {fmtK(budgetTotal - allocated)}
                </div>
              </div>
            </div>
            <div className="progress-bar mt-16">
              <div
                className={`progress-fill ${pctUsed > 1 ? 'red' : pctUsed > 0.85 ? 'amber' : 'green'}`}
                style={{ width: `${Math.min(pctUsed * 100, 100)}%` }}
              />
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                color: 'var(--gray-500)',
                display: 'flex',
                justifyContent: 'space-between'
              }}
            >
              <span>0%</span>
              <span style={{ fontWeight: 600, color: 'var(--gray-800)' }}>
                {Math.round(pctUsed * 100)}% used
              </span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
