import { useEffect, useState } from 'react';
import type { AppRole, Cycle, Employee, PayRange, RecommendationMap } from '../types.js';
import {
  createAppUser,
  createPayRange,
  deactivatePayRange,
  fetchPayRanges,
  importPayRangesCsv,
  updateAppUser,
  updatePayRange,
  type AppUserRecord,
  saveCycle,
  type PayRangeImportSummary,
} from '../api/client.js';

interface Props {
  employees: Employee[];
  cycle: Cycle | null;
  recommendations: RecommendationMap;
  showToast: (msg: string) => void;
  setCycle: (cycle: Cycle) => void;
  demoUsers: AppUserRecord[];
  refreshAll: () => Promise<void>;
}

const EMPTY_RANGE: PayRange = {
  rangeName: '',
  jobFamily: '',
  positionType: '',
  jobTitleReference: '',
  level: '',
  geography: '',
  geoTier: '',
  currency: 'USD',
  salaryMin: 0,
  salaryMid: 0,
  salaryMax: 0,
  effectiveDate: '',
  isActive: true,
};

export function Admin({ employees, cycle, showToast, setCycle, demoUsers, refreshAll }: Props) {
  const [form, setForm] = useState<Cycle | null>(null);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<AppRole>('manager');
  const [newManagerName, setNewManagerName] = useState('');
  const [payRanges, setPayRanges] = useState<PayRange[]>([]);
  const [rangeForm, setRangeForm] = useState<PayRange>(EMPTY_RANGE);
  const [editingRangeId, setEditingRangeId] = useState<number | null>(null);
  const [importText, setImportText] = useState('');
  const [importSummary, setImportSummary] = useState<PayRangeImportSummary | null>(null);

  async function loadPayRanges() {
    const rows = await fetchPayRanges(true);
    setPayRanges(rows);
  }

  useEffect(() => {
    if (cycle) setForm({ ...cycle });
    void loadPayRanges();
  }, [cycle]);

  if (!form) return null;

  function update<K extends keyof Cycle>(key: K, value: Cycle[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (!form) return;
      const saved = await saveCycle(form);
      setCycle(saved);
      showToast('Cycle settings saved');
    } catch {
      showToast('Failed to save cycle settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateUser() {
    try {
      await createAppUser({ email: newEmail, role: newRole, managerName: newRole === 'manager' ? newManagerName : '' });
      showToast('App user created');
      setNewEmail('');
      setNewRole('manager');
      setNewManagerName('');
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create app user');
    }
  }

  async function handleToggleActive(user: AppUserRecord) {
    try {
      await updateAppUser(user.email, { isActive: !user.isActive });
      showToast(`User ${user.isActive ? 'deactivated' : 'activated'}`);
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update user');
    }
  }

  async function handleSaveRange() {
    try {
      if (editingRangeId) {
        await updatePayRange(editingRangeId, rangeForm);
        showToast('Pay range updated');
      } else {
        await createPayRange(rangeForm);
        showToast('Pay range created');
      }
      setRangeForm(EMPTY_RANGE);
      setEditingRangeId(null);
      await loadPayRanges();
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save pay range');
    }
  }

  async function handleDeactivateRange(id?: number) {
    if (!id) return;
    try {
      await deactivatePayRange(id);
      showToast('Pay range deactivated');
      await loadPayRanges();
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to deactivate pay range');
    }
  }

  async function handleImportRanges() {
    if (!importText.trim()) {
      showToast('Paste pay range CSV first');
      return;
    }
    try {
      const summary = await importPayRangesCsv({ csvContent: importText });
      setImportSummary(summary);
      showToast(`Pay ranges imported: ${summary.inserted} inserted, ${summary.updated} updated`);
      await loadPayRanges();
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Pay range CSV import failed');
    }
  }

  const totalPayroll = employees.reduce((s, e) => s + e.salary, 0);

  return (
    <>
      <header className="topbar"><div className="page-title">Admin Settings</div></header>
      <div className="page-content">
        <form onSubmit={handleSubmit} style={{ maxWidth: 760 }}>
          <div className="card mb-20">
            <div className="card-header"><div className="card-title">Cycle Configuration</div></div>
            <div className="card-body">
              <div className="form-group"><label className="form-label">Cycle Name</label><input className="form-input" value={form.name} onChange={(e) => update('name', e.target.value)} /></div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Budget %</label><input className="form-input" type="number" value={form.budgetPct} onChange={(e) => update('budgetPct', Number(e.target.value) || 0)} /></div>
                <div className="form-group"><label className="form-label">Guideline Max %</label><input className="form-input" type="number" value={form.guidelineMax} onChange={(e) => update('guidelineMax', Number(e.target.value) || 0)} /></div>
              </div>
              <div className="form-hint">Loaded payroll: ${Math.round(totalPayroll).toLocaleString()}</div>
            </div>
            <div className="card-footer"><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Cycle Settings'}</button></div>
          </div>
        </form>

        <div className="card mb-20">
          <div className="card-header"><div className="card-title">Pay Ranges</div></div>
          <div className="card-body">
            <p style={{ marginTop: 0, color: 'var(--gray-500)' }}>CSV required fields: position_type, geography, salary_min, salary_mid, salary_max. Optional: job_family, title/job_title_reference, level, geo_tier, currency, effective_date, range_name.</p>
            <textarea className="form-input" rows={5} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="position_type,geography,salary_min,salary_mid,salary_max" />
            <div style={{ marginTop: 10 }}><button className="btn btn-secondary" type="button" onClick={() => void handleImportRanges()}>Import Pay Range CSV</button></div>
            {importSummary && <div style={{ marginTop: 10, fontSize: 13 }}>Processed {importSummary.processed} • Inserted {importSummary.inserted} • Updated {importSummary.updated} • Rejected {importSummary.rejected}</div>}
            <div className="divider" />
            <div className="form-row">
              <div className="form-group"><label className="form-label">Position Type</label><input className="form-input" value={rangeForm.positionType ?? ''} onChange={(e) => setRangeForm((r) => ({ ...r, positionType: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Job Family</label><input className="form-input" value={rangeForm.jobFamily ?? ''} onChange={(e) => setRangeForm((r) => ({ ...r, jobFamily: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Geography</label><input className="form-input" value={rangeForm.geography ?? ''} onChange={(e) => setRangeForm((r) => ({ ...r, geography: e.target.value }))} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Level</label><input className="form-input" value={rangeForm.level ?? ''} onChange={(e) => setRangeForm((r) => ({ ...r, level: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Min</label><input className="form-input" type="number" value={rangeForm.salaryMin} onChange={(e) => setRangeForm((r) => ({ ...r, salaryMin: Number(e.target.value) || 0 }))} /></div>
              <div className="form-group"><label className="form-label">Mid</label><input className="form-input" type="number" value={rangeForm.salaryMid} onChange={(e) => setRangeForm((r) => ({ ...r, salaryMid: Number(e.target.value) || 0 }))} /></div>
              <div className="form-group"><label className="form-label">Max</label><input className="form-input" type="number" value={rangeForm.salaryMax} onChange={(e) => setRangeForm((r) => ({ ...r, salaryMax: Number(e.target.value) || 0 }))} /></div>
            </div>
            <button className="btn btn-primary" type="button" onClick={() => void handleSaveRange()}>{editingRangeId ? 'Update Pay Range' : 'Add Pay Range'}</button>
            {editingRangeId && <button className="btn btn-secondary" style={{ marginLeft: 8 }} type="button" onClick={() => { setEditingRangeId(null); setRangeForm(EMPTY_RANGE); }}>Cancel</button>}
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <table className="data-table">
              <thead><tr><th>Position Type</th><th>Geography</th><th>Level</th><th className="numeric">Min</th><th className="numeric">Mid</th><th className="numeric">Max</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {payRanges.map((row) => (
                  <tr key={row.id}>
                    <td>{row.positionType || row.jobFamily || '—'}</td>
                    <td>{row.geography || '—'}</td>
                    <td>{row.level || '—'}</td>
                    <td className="numeric">{Math.round(row.salaryMin).toLocaleString()}</td>
                    <td className="numeric">{Math.round(row.salaryMid).toLocaleString()}</td>
                    <td className="numeric">{Math.round(row.salaryMax).toLocaleString()}</td>
                    <td>{row.isActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => { setEditingRangeId(row.id ?? null); setRangeForm({ ...row }); }}>Edit</button>
                      {row.isActive && <button className="btn btn-danger btn-sm" style={{ marginLeft: 8 }} type="button" onClick={() => void handleDeactivateRange(row.id)}>Deactivate</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">User Permissions (Demo)</div></div>
          <div className="card-body">
            <p style={{ marginTop: 0, color: 'var(--gray-500)' }}>Demo-only local user mapping by email. This will be replaced by real auth later.</p>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Email</label><input className="form-input" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new.manager@demo.com" /></div>
              <div className="form-group"><label className="form-label">Role</label><select className="form-select" value={newRole} onChange={(e) => setNewRole(e.target.value as AppRole)}><option value="admin">admin</option><option value="executive">executive</option><option value="manager">manager</option></select></div>
              {newRole === 'manager' && <div className="form-group"><label className="form-label">Manager Scope Name</label><input className="form-input" value={newManagerName} onChange={(e) => setNewManagerName(e.target.value)} placeholder="Jamie Rivera" /></div>}
            </div>
            <button className="btn btn-secondary" onClick={handleCreateUser} type="button">Add App User</button>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <table className="data-table">
              <thead><tr><th>Email</th><th>Role</th><th>Manager Scope</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {demoUsers.map((user) => (
                  <tr key={user.email}>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>{user.managerName || '—'}</td>
                    <td>{user.isActive ? 'Active' : 'Inactive'}</td>
                    <td><button className="btn btn-secondary btn-sm" type="button" onClick={() => void handleToggleActive(user)}>{user.isActive ? 'Deactivate' : 'Activate'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
