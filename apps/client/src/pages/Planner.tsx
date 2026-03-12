import { useEffect, useMemo, useState } from 'react';
import {
  buildCompensationTotalSummaryCsv,
  fetchCompensationCycles,
  fetchCompensationTotalSummary,
  saveEmployeeCyclePlan
} from '../api/client.js';
import type {
  CompensationCycle,
  CompensationTotalSummaryRow,
  EmployeeCyclePlanPayload
} from '../types.js';

type FieldConfig = {
  key: keyof CompensationTotalSummaryRow;
  label: string;
  editable?: boolean;
  planKey?: keyof EmployeeCyclePlanPayload;
  format?: 'currency' | 'percent' | 'number' | 'text' | 'boolean';
  sticky?: boolean;
  width?: number;
};

const COLUMNS: FieldConfig[] = [
  { key: 'employeeId', label: 'Employee ID', sticky: true, width: 120 },
  { key: 'importedFullName', label: 'Name', sticky: true, width: 180 },
  { key: 'importedDepartment', label: 'Department', width: 160 },
  { key: 'importedTitle', label: 'Current Title', width: 180 },
  { key: 'importedSalary', label: 'Current Salary', format: 'currency', width: 130 },
  { key: 'enteredPriorPerformanceRating', label: '2024 Perf', editable: true, planKey: 'priorPerformanceRating', width: 120 },
  { key: 'enteredCurrentPerformanceRating', label: '2025 Perf', editable: true, planKey: 'currentPerformanceRating', width: 120 },
  { key: 'enteredMeritIncreaseAmount', label: 'Merit $', editable: true, planKey: 'meritIncreaseAmount', format: 'currency', width: 120 },
  { key: 'enteredMeritIncreasePercent', label: 'Merit %', editable: true, planKey: 'meritIncreasePercent', format: 'percent', width: 110 },
  { key: 'enteredRecommendedMeritAmount', label: 'Rec Merit $', editable: true, planKey: 'recommendedMeritAmount', format: 'currency', width: 130 },
  { key: 'enteredRecommendedMeritPercent', label: 'Rec Merit %', editable: true, planKey: 'recommendedMeritPercent', format: 'percent', width: 130 },
  { key: 'enteredIsPromotion', label: 'Promotion?', editable: true, planKey: 'isPromotion', format: 'boolean', width: 110 },
  { key: 'enteredPromotionType', label: 'Promotion Type', editable: true, planKey: 'promotionType', width: 140 },
  { key: 'enteredNewJobTitle', label: 'New Job Title', editable: true, planKey: 'newJobTitle', width: 180 },
  { key: 'enteredPromotionRationale', label: 'Promotion Rationale', editable: true, planKey: 'promotionRationale', width: 210 },
  { key: 'enteredPromotionIncreaseAmount', label: 'Promotion $', editable: true, planKey: 'promotionIncreaseAmount', format: 'currency', width: 130 },
  { key: 'enteredBonusOverrideAmount', label: 'Bonus Override $', editable: true, planKey: 'bonusOverrideAmount', format: 'currency', width: 140 },
  { key: 'enteredBonusOverridePercent', label: 'Bonus Override %', editable: true, planKey: 'bonusOverridePercent', format: 'percent', width: 140 },
  { key: 'enteredBonusWeightCompany', label: 'Weight Co', editable: true, planKey: 'bonusWeightCompany', format: 'percent', width: 120 },
  { key: 'enteredBonusWeightIndividual', label: 'Weight Ind', editable: true, planKey: 'bonusWeightIndividual', format: 'percent', width: 120 },
  { key: 'enteredGoalAttainmentCompany', label: 'Goal Co', editable: true, planKey: 'goalAttainmentCompany', format: 'percent', width: 110 },
  { key: 'enteredGoalAttainmentIndividual', label: 'Goal Ind', editable: true, planKey: 'goalAttainmentIndividual', format: 'percent', width: 110 },
  { key: 'enteredExecReview', label: 'Exec Review', editable: true, planKey: 'execReview', width: 180 },
  { key: 'enteredNotes', label: 'Notes', editable: true, planKey: 'notes', width: 200 },
  { key: 'derivedCompaRatio', label: 'Compa Ratio', format: 'number', width: 110 },
  { key: 'derivedSalaryAfterMerit', label: 'Salary After Merit', format: 'currency', width: 150 },
  { key: 'derivedFinalSalaryWithPromo', label: 'Final Salary', format: 'currency', width: 140 },
  { key: 'derivedCurrentBonusTargetAmount', label: 'Current Bonus Target', format: 'currency', width: 170 },
  { key: 'derivedFinalCompanyBonusProrated', label: 'Final Co Bonus', format: 'currency', width: 140 },
  { key: 'derivedFinalIndividualBonusProrated', label: 'Final Ind Bonus', format: 'currency', width: 140 },
  { key: 'derivedFinalTotalBonusProrated', label: 'Final Total Bonus', format: 'currency', width: 140 },
  { key: 'derivedVarianceFromRecommendation', label: 'Variance from Rec', format: 'currency', width: 150 }
];

function parseInput(value: string, format?: FieldConfig['format']) {
  if (value.trim() === '') return null;
  if (format === 'currency' || format === 'percent' || format === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (format === 'boolean') {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  }
  return value;
}

function fmt(value: unknown, format?: FieldConfig['format']): string {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'currency' && typeof value === 'number') return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (format === 'percent' && typeof value === 'number') return `${value.toFixed(2)}%`;
  if (format === 'number' && typeof value === 'number') return value.toFixed(3);
  if (format === 'boolean' && typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export function Planner() {
  const [cycles, setCycles] = useState<CompensationCycle[]>([]);
  const [cycleId, setCycleId] = useState<number | null>(null);
  const [rows, setRows] = useState<CompensationTotalSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [sortBy, setSortBy] = useState<keyof CompensationTotalSummaryRow>('employeeId');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [drafts, setDrafts] = useState<Record<string, Partial<EmployeeCyclePlanPayload>>>({});
  const [statuses, setStatuses] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});

  useEffect(() => {
    void (async () => {
      const cycleData = await fetchCompensationCycles();
      setCycles(cycleData);
      setCycleId(cycleData[0]?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    if (!cycleId) return;
    setLoading(true);
    void fetchCompensationTotalSummary(cycleId)
      .then((data) => setRows(data))
      .finally(() => setLoading(false));
  }, [cycleId]);

  const departments = useMemo(
    () => Array.from(new Set(rows.map((r) => r.importedDepartment).filter(Boolean))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((row) => {
      const matchesSearch = !q ||
        row.employeeId.toLowerCase().includes(q) ||
        (row.importedFullName ?? '').toLowerCase().includes(q) ||
        (row.importedDepartment ?? '').toLowerCase().includes(q);
      const matchesDept = deptFilter === 'all' || row.importedDepartment === deptFilter;
      return matchesSearch && matchesDept;
    });

    out.sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      const dir = sortDir === 'asc' ? 1 : -1;
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
    });

    return out;
  }, [rows, search, deptFilter, sortBy, sortDir]);

  async function saveField(row: CompensationTotalSummaryRow, col: FieldConfig, value: string) {
    if (!cycleId || !col.planKey) return;
    const parsed = parseInput(value, col.format) as EmployeeCyclePlanPayload[keyof EmployeeCyclePlanPayload];
    const nextDraft = { ...(drafts[row.employeeId] ?? {}), [col.planKey]: parsed };
    setDrafts((prev) => ({ ...prev, [row.employeeId]: nextDraft }));
    setStatuses((prev) => ({ ...prev, [row.employeeId]: 'saving' }));

    try {
      await saveEmployeeCyclePlan(cycleId, row.employeeId, nextDraft);
      const refreshed = await fetchCompensationTotalSummary(cycleId);
      setRows(refreshed);
      setStatuses((prev) => ({ ...prev, [row.employeeId]: 'saved' }));
    } catch {
      setStatuses((prev) => ({ ...prev, [row.employeeId]: 'error' }));
    }
  }

  function onExport() {
    const csv = buildCompensationTotalSummaryCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comp-total-summary-${cycleId ?? 'cycle'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="content" style={{ padding: 20 }}>
      <div className="topbar" style={{ position: 'static', borderRadius: 12 }}>
        <div className="topbar-left">
          <div className="page-title">Cycle Planner</div>
          <div className="page-subtitle">Spreadsheet-style compensation planning and export</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-body" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={cycleId ?? ''} onChange={(e) => setCycleId(Number(e.target.value))}>
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>{cycle.name}</option>
            ))}
          </select>
          <input placeholder="Search employee, name, department" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="all">All departments</option>
            {departments.map((dep) => <option key={dep ?? 'unknown'} value={dep ?? ''}>{dep}</option>)}
          </select>
          <button className="btn btn-primary" onClick={onExport}>Export CSV</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 16 }}>Loading…</div> : (
            <div className="planner-grid-wrap">
              <table className="planner-grid">
                <thead>
                  <tr>
                    {COLUMNS.map((col, idx) => (
                      <th
                        key={String(col.key)}
                        onClick={() => {
                          if (sortBy === col.key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                          else {
                            setSortBy(col.key);
                            setSortDir('asc');
                          }
                        }}
                        className={col.sticky ? 'sticky-col' : ''}
                        style={{ left: col.sticky ? idx * 120 : undefined, minWidth: col.width ?? 120 }}
                      >
                        {col.label}
                      </th>
                    ))}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.employeeId}>
                      {COLUMNS.map((col, idx) => {
                        const value = row[col.key];
                        const missingReasons = !value ? row.derivedMissingDataReasons ?? [] : [];
                        return (
                          <td
                            key={String(col.key)}
                            className={col.sticky ? 'sticky-col cell-sticky' : col.editable ? 'editable-cell' : 'derived-cell'}
                            style={{ left: col.sticky ? idx * 120 : undefined, minWidth: col.width ?? 120 }}
                          >
                            {col.editable ? (
                              col.format === 'boolean' ? (
                                <select
                                  defaultValue={value === null ? '' : String(value)}
                                  onBlur={(e) => void saveField(row, col, e.target.value)}
                                >
                                  <option value="">—</option>
                                  <option value="true">Yes</option>
                                  <option value="false">No</option>
                                </select>
                              ) : (
                                <input
                                  defaultValue={value === null || value === undefined ? '' : String(value)}
                                  onBlur={(e) => void saveField(row, col, e.target.value)}
                                />
                              )
                            ) : (
                              <div>
                                <span>{fmt(value, col.format)}</span>
                                {!value && missingReasons.length > 0 && (
                                  <div className="gap-help">{missingReasons.join(', ')}</div>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td>{statuses[row.employeeId] ?? 'idle'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
