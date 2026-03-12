import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCompensationTotalSummaryCsv,
  bulkUpdateEmployeeCyclePlans,
  fetchCompensationCycles,
  fetchCompensationTotalSummary,
  fetchPlannerAudit,
  saveEmployeeCyclePlan,
  updateEmployeePlanStatus
} from '../api/client.js';
import type {
  CompensationCycle,
  CompensationTotalSummaryRow,
  EmployeeCyclePlanPayload,
  PlannerAuditChange,
  PlannerWorkflowStatus
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

const STATUS_OPTIONS: PlannerWorkflowStatus[] = ['not_started', 'in_progress', 'manager_submitted', 'exec_reviewed', 'finalized'];

const COLUMNS: FieldConfig[] = [
  { key: 'employeeId', label: 'Employee ID', sticky: true, width: 120 },
  { key: 'importedFullName', label: 'Name', sticky: true, width: 180 },
  { key: 'importedDepartment', label: 'Department', width: 150 },
  { key: 'enteredCurrentPerformanceRating', label: 'Perf', editable: true, planKey: 'currentPerformanceRating', width: 90 },
  { key: 'enteredMeritIncreasePercent', label: 'Merit %', editable: true, planKey: 'meritIncreasePercent', format: 'percent', width: 100 },
  { key: 'enteredGoalAttainmentCompany', label: 'Goal Co', editable: true, planKey: 'goalAttainmentCompany', format: 'percent', width: 100 },
  { key: 'enteredGoalAttainmentIndividual', label: 'Goal Ind', editable: true, planKey: 'goalAttainmentIndividual', format: 'percent', width: 100 },
  { key: 'enteredIsPromotion', label: 'Promo', editable: true, planKey: 'isPromotion', format: 'boolean', width: 90 },
  { key: 'derivedSalaryAfterMerit', label: 'Salary After Merit', format: 'currency', width: 150 },
  { key: 'derivedFinalTotalBonusProrated', label: 'Final Bonus', format: 'currency', width: 130 }
];

function parseInput(value: string, format?: FieldConfig['format']) {
  if (value.trim() === '') return null;
  if (format === 'currency' || format === 'percent' || format === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (format === 'boolean') return value === 'true' ? true : value === 'false' ? false : null;
  return value;
}

function fmt(value: unknown, format?: FieldConfig['format']): string {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'currency' && typeof value === 'number') return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (format === 'percent' && typeof value === 'number') return `${value.toFixed(2)}%`;
  return String(value);
}

export function Planner() {
  const [cycles, setCycles] = useState<CompensationCycle[]>([]);
  const [cycleId, setCycleId] = useState<number | null>(null);
  const [rows, setRows] = useState<CompensationTotalSummaryRow[]>([]);
  const [cellDrafts, setCellDrafts] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, 'idle' | 'dirty' | 'saving' | 'saved' | 'error'>>({});
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [promoOnly, setPromoOnly] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [audit, setAudit] = useState<PlannerAuditChange[]>([]);
  const [auditEmployeeId, setAuditEmployeeId] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => Object.fromEntries(COLUMNS.map((c) => [String(c.key), true])));
  const pendingRef = useRef<Record<string, Partial<EmployeeCyclePlanPayload>>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});

  const load = useCallback(async (id: number) => {
    const data = await fetchCompensationTotalSummary(id);
    setRows(data);
  }, []);

  useEffect(() => {
    void (async () => {
      const cycleData = await fetchCompensationCycles();
      setCycles(cycleData);
      if (cycleData[0]?.id) setCycleId(cycleData[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!cycleId) return;
    void load(cycleId);
  }, [cycleId, load]);

  const departments = useMemo(() => Array.from(new Set(rows.map((r) => r.importedDepartment).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !q || row.employeeId.toLowerCase().includes(q) || (row.importedFullName ?? '').toLowerCase().includes(q);
      const matchesDept = deptFilter === 'all' || row.importedDepartment === deptFilter;
      const matchesPromo = !promoOnly || row.enteredIsPromotion === true;
      return matchesSearch && matchesDept && matchesPromo;
    });
  }, [rows, search, deptFilter, promoOnly]);

  const visible = COLUMNS.filter((c) => visibleColumns[String(c.key)]);

  const queueSave = (employeeId: string, patch: Partial<EmployeeCyclePlanPayload>) => {
    if (!cycleId) return;
    pendingRef.current[employeeId] = { ...(pendingRef.current[employeeId] ?? {}), ...patch };
    setStatuses((prev) => ({ ...prev, [employeeId]: 'dirty' }));
    if (timersRef.current[employeeId]) clearTimeout(timersRef.current[employeeId]);
    timersRef.current[employeeId] = setTimeout(async () => {
      const payload = pendingRef.current[employeeId];
      if (!payload) return;
      setStatuses((prev) => ({ ...prev, [employeeId]: 'saving' }));
      try {
        await saveEmployeeCyclePlan(cycleId, employeeId, payload);
        delete pendingRef.current[employeeId];
        setStatuses((prev) => ({ ...prev, [employeeId]: 'saved' }));
        await load(cycleId);
      } catch {
        setStatuses((prev) => ({ ...prev, [employeeId]: 'error' }));
      }
    }, 450);
  };

  const handleKeyNav = (e: KeyboardEvent, rowIdx: number, colIdx: number) => {
    const next = (r: number, c: number) => inputRefs.current[`${r}:${c}`]?.focus();
    if (e.key === 'ArrowRight' || e.key === 'Tab') {
      e.preventDefault(); next(rowIdx, colIdx + 1);
    } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault(); next(rowIdx, colIdx - 1);
    } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault(); next(rowIdx + 1, colIdx);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); next(rowIdx - 1, colIdx);
    }
  };

  const onBulkEdit = async () => {
    if (!cycleId) return;
    const merit = window.prompt('Bulk merit % for selected/filtered rows (blank to skip):');
    const updates: Partial<EmployeeCyclePlanPayload> = {};
    if (merit !== null && merit !== '') updates.meritIncreasePercent = Number(merit);
    if (Object.keys(updates).length === 0) return;
    const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (!window.confirm(`Apply bulk update to ${selectedIds.length || filtered.length} employees?`)) return;
    await bulkUpdateEmployeeCyclePlans(cycleId, selectedIds.length ? { employeeIds: selectedIds, updates } : { filters: { department: deptFilter === 'all' ? '' : deptFilter, promotionOnly: promoOnly }, updates });
    await load(cycleId);
  };

  const onAudit = async (employeeId: string) => {
    if (!cycleId) return;
    setAuditEmployeeId(employeeId);
    setAudit(await fetchPlannerAudit(cycleId, employeeId, 20));
  };

  const onStatusChange = async (employeeId: string, status: PlannerWorkflowStatus) => {
    if (!cycleId) return;
    await updateEmployeePlanStatus(cycleId, employeeId, status);
    await load(cycleId);
  };

  const onExport = () => {
    const csv = buildCompensationTotalSummaryCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comp-total-summary-${cycleId ?? 'cycle'}-filtered.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="content" style={{ padding: 20 }}>
      <div className="card"><div className="card-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={cycleId ?? ''} onChange={(e) => setCycleId(Number(e.target.value))}>{cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}><option value="all">All departments</option>{departments.map((d) => <option key={d} value={d ?? ''}>{d}</option>)}</select>
        <label><input type="checkbox" checked={promoOnly} onChange={(e) => setPromoOnly(e.target.checked)} /> Promotion only</label>
        <button className="btn btn-primary" onClick={() => void onBulkEdit()}>Bulk edit selected / filtered</button>
        <button className="btn" onClick={onExport}>Export filtered</button>
      </div></div>

      <div className="card" style={{ marginTop: 12 }}><div className="card-body" style={{ padding: 0 }}>
        <div className="planner-grid-wrap"><table className="planner-grid"><thead><tr>
          <th className="sticky-col" style={{ left: 0, minWidth: 42 }}>✓</th>
          {visible.map((col, idx) => <th key={String(col.key)} className={col.sticky ? 'sticky-col' : ''} style={{ left: col.sticky ? 42 + idx * 120 : undefined, minWidth: col.width ?? 120 }}>{col.label}</th>)}
          <th>Status</th><th>Workflow</th><th>Audit</th>
        </tr></thead><tbody>
          {filtered.map((row, rowIdx) => <tr key={row.employeeId}>
            <td className="sticky-col" style={{ left: 0 }}><input type="checkbox" checked={Boolean(selected[row.employeeId])} onChange={(e) => setSelected((p) => ({ ...p, [row.employeeId]: e.target.checked }))} /></td>
            {visible.map((col, colIdx) => {
              const value = row[col.key];
              const ck = `${row.employeeId}:${String(col.key)}`;
              return <td key={String(col.key)} className={col.sticky ? 'sticky-col cell-sticky' : col.editable ? 'editable-cell' : 'derived-cell'} style={{ left: col.sticky ? 42 + colIdx * 120 : undefined, minWidth: col.width ?? 120 }}>
                {col.editable ? (col.format === 'boolean' ? (
                  <select ref={(el) => { inputRefs.current[`${rowIdx}:${colIdx}`] = el; }} value={cellDrafts[ck] ?? (value === null ? '' : String(value))} onChange={(e) => { setCellDrafts((p) => ({ ...p, [ck]: e.target.value })); if (col.planKey) queueSave(row.employeeId, { [col.planKey]: parseInput(e.target.value, col.format) } as Partial<EmployeeCyclePlanPayload>); }} onKeyDown={(e) => handleKeyNav(e, rowIdx, colIdx)}><option value="">—</option><option value="true">Yes</option><option value="false">No</option></select>
                ) : (
                  <input ref={(el) => { inputRefs.current[`${rowIdx}:${colIdx}`] = el; }} value={cellDrafts[ck] ?? (value === null || value === undefined ? '' : String(value))} onChange={(e) => setCellDrafts((p) => ({ ...p, [ck]: e.target.value }))} onBlur={(e) => { if (col.planKey) queueSave(row.employeeId, { [col.planKey]: parseInput(e.target.value, col.format) } as Partial<EmployeeCyclePlanPayload>); }} onPaste={(e) => { const text = e.clipboardData.getData('text/plain'); if (text.includes('\n')) { e.preventDefault(); const [head] = text.split(/\r?\n/); if (col.planKey) { setCellDrafts((p) => ({ ...p, [ck]: head })); queueSave(row.employeeId, { [col.planKey]: parseInput(head, col.format) } as Partial<EmployeeCyclePlanPayload>); } } }} onKeyDown={(e) => handleKeyNav(e, rowIdx, colIdx)} />
                )) : <span>{fmt(value, col.format)}</span>}
              </td>;
            })}
            <td>{statuses[row.employeeId] ?? 'idle'}</td>
            <td><select value={row.enteredPlanningStatus ?? 'not_started'} onChange={(e) => void onStatusChange(row.employeeId, e.target.value as PlannerWorkflowStatus)}>{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select></td>
            <td><button className="btn btn-sm" onClick={() => void onAudit(row.employeeId)}>View</button></td>
          </tr>)}
        </tbody></table></div>
      </div></div>

      <div className="card" style={{ marginTop: 12 }}><div className="card-body">
        <strong>Visible columns:</strong>{' '}
        {COLUMNS.map((col) => <label key={String(col.key)} style={{ marginRight: 8 }}><input type="checkbox" checked={visibleColumns[String(col.key)]} onChange={(e) => setVisibleColumns((p) => ({ ...p, [String(col.key)]: e.target.checked }))} /> {col.label}</label>)}
      </div></div>

      {auditEmployeeId && <div className="card" style={{ marginTop: 12 }}><div className="card-body"><h4>Recent audit changes for {auditEmployeeId}</h4>
        <ul>{audit.map((a) => <li key={a.id}>{a.changedAt}: {a.fieldName} {JSON.stringify(a.oldValue)} → {JSON.stringify(a.newValue)} ({a.changedBy})</li>)}</ul>
      </div></div>}
    </div>
  );
}
