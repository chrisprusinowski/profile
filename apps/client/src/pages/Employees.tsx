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
}

interface EmployeeFormState {
  id: string;
  name: string;
  email: string;
  department: string;
  title: string;
  salary: string;
  manager: string;
  hireDate: string;
}

const EMPTY_FORM: EmployeeFormState = {
  id: '',
  name: '',
  email: '',
  department: '',
  title: '',
  salary: '0',
  manager: '',
  hireDate: '',
};

function employeeToForm(employee: Employee): EmployeeFormState {
  return {
    id: employee.id,
    name: employee.name,
    email: employee.email ?? '',
    department: employee.department ?? '',
    title: employee.title ?? '',
    salary: String(employee.salary ?? 0),
    manager: employee.manager ?? '',
    hireDate: employee.hireDate ?? '',
  };
}

export function Employees({ employees, showToast, refreshAll }: Props) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [rows, setRows] = useState(employees);
  const [form, setForm] = useState<EmployeeFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importText, setImportText] = useState('');
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
      return [e.name, e.department, e.title, e.manager, e.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, deptFilter]);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  async function handleSubmitEmployee(e: React.FormEvent) {
    e.preventDefault();
    const parsedSalary = Number.parseFloat(form.salary);
    if (!form.id.trim() && !editingId) {
      showToast('Employee ID is required');
      return;
    }
    if (!form.name.trim()) {
      showToast('Employee name is required');
      return;
    }
    if (Number.isNaN(parsedSalary) || parsedSalary < 0) {
      showToast('Salary must be a non-negative number');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const updated = await updateEmployee(editingId, {
          name: form.name,
          email: form.email || undefined,
          department: form.department || undefined,
          title: form.title || undefined,
          salary: parsedSalary,
          manager: form.manager || undefined,
          hireDate: form.hireDate || undefined,
        });
        setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
        showToast('Employee updated');
      } else {
        const created = await createEmployee({
          id: form.id,
          name: form.name,
          email: form.email || undefined,
          department: form.department || undefined,
          title: form.title || undefined,
          salary: parsedSalary,
          manager: form.manager || undefined,
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

  async function handleImportCsv() {
    if (!importText.trim()) {
      showToast('Paste CSV content first');
      return;
    }

    setImporting(true);
    setImportSummary(null);
    try {
      const summary = await importEmployeesCsv({ csvContent: importText });
      setImportSummary(summary);
      showToast(`CSV import complete: ${summary.inserted} inserted, ${summary.updated} updated`);
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'CSV import failed');
    } finally {
      setImporting(false);
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
        <div className="card mb-20">
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
                <div className="form-group"><label className="form-label">Manager</label><input className="form-input" value={form.manager} onChange={(e) => setForm((f) => ({ ...f, manager: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Salary</label><input className="form-input" type="number" min="0" step="0.01" value={form.salary} onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Hire Date</label><input className="form-input" type="date" value={form.hireDate} onChange={(e) => setForm((f) => ({ ...f, hireDate: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save Employee' : 'Add Employee'}</button>
                {editingId && <button className="btn btn-secondary" type="button" onClick={resetForm}>Cancel Edit</button>}
              </div>
            </form>
          </div>
        </div>

        <div className="card mb-20">
          <div className="card-header"><div className="card-title">Import Employees from CSV</div></div>
          <div className="card-body">
            <p style={{ marginTop: 0, color: 'var(--gray-500)' }}>Paste CSV (required columns: id, name, email, department, title, salary, manager, hire_date).</p>
            <textarea className="form-input" rows={6} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="id,name,email,department,title,salary,manager,hire_date" />
            <div style={{ marginTop: 10 }}><button className="btn btn-secondary" onClick={handleImportCsv} disabled={importing}>{importing ? 'Importing…' : 'Import CSV to PostgreSQL'}</button></div>
            {importSummary && (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                Processed {importSummary.rowsProcessed} • Inserted {importSummary.inserted} • Updated {importSummary.updated} • Rejected {importSummary.rejected}
              </div>
            )}
          </div>
        </div>

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
                    <th>Name</th><th>Department</th><th>Title</th><th className="numeric">Salary</th><th>Manager</th><th>Hire Date</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
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
                      <td className="numeric">{fmt(e.salary)}</td>
                      <td>{e.manager ?? '—'}</td>
                      <td>{fmtDate(e.hireDate)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setEditingId(e.id); setForm(employeeToForm(e)); }}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => { void handleDelete(e.id); }}>Delete</button>
                        </div>
                      </td>
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
