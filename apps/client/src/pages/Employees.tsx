import { useEffect, useMemo, useState } from 'react';
import type { Employee, Cycle, RecommendationMap } from '../types.js';
import { fmt, fmtDate, initials, avatarColor } from '../utils.js';
import {
  createEmployee,
  deleteEmployee,
  importEmployeesCsv,
  updateEmployee,
  type CsvImportSummary,
} from '../api/client.js';

interface Props {
  employees: Employee[];
  cycle: Cycle | null;
  recommendations: RecommendationMap;
  showToast: (msg: string) => void;
  refreshAll: () => Promise<void>;
  readOnly?: boolean;
}

interface EmployeeFormState {
  id: string;
  name: string;
  email: string;
  department: string;
  title: string;
  positionType: string;
  geography: string;
  level: string;
  salary: string;
  manager: string;
  managerEmail: string;
  hireDate: string;
}

const EMPTY_FORM: EmployeeFormState = {
  id: '',
  name: '',
  email: '',
  department: '',
  title: '',
  positionType: '',
  geography: '',
  level: '',
  salary: '0',
  manager: '',
  managerEmail: '',
  hireDate: '',
};

function employeeToForm(employee: Employee): EmployeeFormState {
  return {
    id: employee.id,
    name: employee.name,
    email: employee.email ?? '',
    department: employee.department ?? '',
    title: employee.title ?? '',
    positionType: employee.positionType ?? '',
    geography: employee.geography ?? '',
    level: employee.level ?? '',
    salary: String(employee.salary ?? 0),
    manager: employee.manager ?? '',
    managerEmail: employee.managerEmail ?? '',
    hireDate: employee.hireDate ?? '',
  };
}


function isIsoDate(value: string): boolean {
  if (!value.trim()) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
}

export function Employees({ employees, showToast, refreshAll, readOnly = false }: Props) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [rows, setRows] = useState(employees);
  const [form, setForm] = useState<EmployeeFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<CsvImportSummary | null>(null);

  useEffect(() => {
    setRows(employees);
  }, [employees]);

  const departments = useMemo(
    () => [...new Set(rows.map((e) => e.department ?? '').filter(Boolean))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((e) => {
      if (deptFilter && e.department !== deptFilter) return false;
      if (!q) return true;
      return [e.name, e.department, e.title, e.positionType, e.geography, e.level, e.manager, e.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, deptFilter]);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
  }

  async function handleSubmitEmployee(e: React.FormEvent) {
    e.preventDefault();
    const parsedSalary = Number.parseFloat(form.salary);
    const trimmedId = form.id.trim();
    const trimmedName = form.name.trim();
    const trimmedEmail = form.email.trim();
    const trimmedManager = form.manager.trim();
    const trimmedManagerEmail = form.managerEmail.trim().toLowerCase();
    setFormError(null);

    if (!trimmedId && !editingId) {
      setFormError('Employee ID is required for new records.');
      return;
    }
    if (!trimmedName) {
      setFormError('Employee name is required.');
      return;
    }
    if (trimmedEmail && !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setFormError('Email must be in a valid format (example: name@company.com).');
      return;
    }
    if (trimmedManagerEmail && !/^\S+@\S+\.\S+$/.test(trimmedManagerEmail)) {
      setFormError('Manager email must be in a valid format (example: manager@company.com).');
      return;
    }
    if (Number.isNaN(parsedSalary) || parsedSalary < 0 || !Number.isFinite(parsedSalary)) {
      setFormError('Salary must be a non-negative number.');
      return;
    }
    if (!isIsoDate(form.hireDate)) {
      setFormError('Hire date must be a valid YYYY-MM-DD date.');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const updated = await updateEmployee(editingId, {
          name: trimmedName,
          email: trimmedEmail || undefined,
          department: form.department || undefined,
          title: form.title || undefined,
          positionType: form.positionType || undefined,
          geography: form.geography || undefined,
          level: form.level || undefined,
          salary: parsedSalary,
          manager: trimmedManager || undefined,
          managerEmail: trimmedManagerEmail || undefined,
          hireDate: form.hireDate || undefined,
        });
        setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
        showToast('Employee updated');
      } else {
        const created = await createEmployee({
          id: trimmedId,
          name: trimmedName,
          email: trimmedEmail || undefined,
          department: form.department || undefined,
          title: form.title || undefined,
          positionType: form.positionType || undefined,
          geography: form.geography || undefined,
          level: form.level || undefined,
          salary: parsedSalary,
          manager: trimmedManager || undefined,
          managerEmail: trimmedManagerEmail || undefined,
          hireDate: form.hireDate || undefined,
        });
        setRows((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
        showToast('Employee added');
      }
      resetForm();
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save employee');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const employee = rows.find((row) => row.id === id);
    if (!employee) return;
    const confirmed = window.confirm(`Delete ${employee.name}? This also removes their recommendations.`);
    if (!confirmed) return;

    try {
      await deleteEmployee(id);
      setRows((current) => current.filter((row) => row.id !== id));
      showToast('Employee deleted');
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete employee');
    }
  }

  async function handleImportCsv(csvContent: string) {
    if (!csvContent.trim()) {
      showToast('Paste CSV content or upload a CSV file first');
      return;
    }

    setImporting(true);
    setImportSummary(null);
    try {
      const summary = await importEmployeesCsv({ csvContent });
      setImportSummary(summary);

      const persisted = summary.rowsInserted + summary.rowsUpdated;
      if (persisted === 0) {
        showToast(`CSV import warning: no rows persisted (${summary.rowsRejected} rejected)`);
        return;
      }

      showToast(`CSV import complete: ${summary.rowsInserted} inserted, ${summary.rowsUpdated} updated`);
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'CSV import failed');
    } finally {
      setImporting(false);
    }
  }

  async function handleImportFromPaste() {
    await handleImportCsv(importText);
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    try {
      const fileText = await file.text();
      setImportText(fileText);
      await handleImportCsv(fileText);
    } catch {
      showToast('Failed to read CSV file');
    } finally {
      event.target.value = '';
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <div className="page-title">Employee Roster</div>
          <div className="page-subtitle">{rows.length} employee{rows.length !== 1 ? 's' : ''} in PostgreSQL</div>
        </div>
      </header>

      <div className="page-content">
        {!readOnly && <div className="card mb-20">
          <div className="card-header"><div className="card-title">Add / Edit Employee</div></div>
          <div className="card-body">
            <form onSubmit={handleSubmitEmployee}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Employee ID</label>
                  <input className="form-input" value={form.id} disabled={Boolean(editingId)} onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input className="form-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Department</label><input className="form-input" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Position Type</label><input className="form-input" value={form.positionType} onChange={(e) => setForm((f) => ({ ...f, positionType: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Geography</label><input className="form-input" value={form.geography} onChange={(e) => setForm((f) => ({ ...f, geography: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Level</label><input className="form-input" value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Manager</label><input className="form-input" value={form.manager} onChange={(e) => setForm((f) => ({ ...f, manager: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Manager Email</label><input className="form-input" type="email" value={form.managerEmail} onChange={(e) => setForm((f) => ({ ...f, managerEmail: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Salary</label><input className="form-input" type="number" min="0" step="0.01" value={form.salary} onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Hire Date</label><input className="form-input" type="date" value={form.hireDate} onChange={(e) => setForm((f) => ({ ...f, hireDate: e.target.value }))} /></div>
              </div>
              {formError && <div className="alert alert-red" style={{ marginBottom: 12 }}><div className="alert-icon">✕</div><div>{formError}</div></div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save Employee' : 'Add Employee'}</button>
                {editingId && <button className="btn btn-secondary" type="button" onClick={resetForm}>Cancel Edit</button>}
              </div>
            </form>
          </div>
        </div>}

        {!readOnly && <div className="card mb-20">
          <div className="card-header"><div className="card-title">Import Employees from CSV</div></div>
          <div className="card-body">
            <p style={{ marginTop: 0, color: 'var(--gray-500)' }}>Paste CSV or upload a .csv file (required columns: id, name, email, department, title, salary, manager, hire_date). Optional: position_type, geography, level.</p>
            <div style={{ marginBottom: 10 }}>
              <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                Upload CSV
                <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} style={{ display: 'none' }} />
              </label>
              {importFileName && <span style={{ marginLeft: 8, color: 'var(--gray-500)' }}>{importFileName}</span>}
            </div>
            <textarea className="form-input" rows={6} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="id,name,email,department,title,position_type,geography,level,salary,manager,hire_date" />
            <div style={{ marginTop: 10 }}><button className="btn btn-secondary" onClick={handleImportFromPaste} disabled={importing}>{importing ? 'Importing…' : 'Import CSV to PostgreSQL'}</button></div>
            {importSummary && (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <div>Received {importSummary.rowsReceived} • Valid {importSummary.rowsValid} • Inserted {importSummary.rowsInserted} • Updated {importSummary.rowsUpdated} • Rejected {importSummary.rowsRejected}</div>
                {importSummary.validationErrors.length > 0 && (
                  <div style={{ marginTop: 6, color: 'var(--red-600)' }}>
                    First errors: {importSummary.validationErrors.slice(0, 3).map((e) => `row ${e.row}: ${e.error}`).join(' | ')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>}

        {readOnly && <div className="alert" style={{ marginBottom: 12 }}>Read-only employee roster for your role.</div>}

        {rows.length === 0 ? (
          <div className="table-wrap">
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <div className="empty-state-title">No employees in PostgreSQL yet</div>
              <div className="empty-state-sub">Use the Add form or CSV import to seed your demo data.</div>
            </div>
          </div>
        ) : (
          <>
            <div className="toolbar">
              <div className="search-box">
                <span className="search-icon">🔍</span>
                <input type="search" placeholder="Search by name, manager, title, or department" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="filter-select" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                <option value="">All departments</option>
                {departments.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th><th>Department</th><th>Title</th><th>Position/Geo</th><th className="numeric">Salary</th><th>Manager</th><th>Hire Date</th>{!readOnly && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={readOnly ? 7 : 8} className="text-muted" style={{ textAlign: 'center', padding: 20 }}>No employees match the current filters.</td></tr>
                  )}
                  {filtered.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <div className="employee-cell">
                          <div className="avatar" style={{ background: avatarColor(e.name) }}>{initials(e.name)}</div>
                          <div><div className="employee-name">{e.name}</div>{e.email && <div className="employee-title">{e.email}</div>}</div>
                        </div>
                      </td>
                      <td>{e.department ? <span className="chip">{e.department}</span> : '—'}</td>
                      <td>{e.title ?? '—'}</td>
                      <td>{e.positionType ?? '—'} / {e.geography ?? '—'}</td>
                      <td className="numeric">{fmt(e.salary)}</td>
                      <td>{e.manager ?? '—'}{e.managerEmail ? <div className="employee-title">{e.managerEmail}</div> : null}</td>
                      <td>{fmtDate(e.hireDate)}</td>
                      {!readOnly && <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setEditingId(e.id); setForm(employeeToForm(e)); }}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => { void handleDelete(e.id); }}>Delete</button>
                        </div>
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
