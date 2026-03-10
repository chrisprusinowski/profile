import { useEffect, useState } from 'react';
import type { AppRole, Cycle, Employee, RecommendationMap } from '../types.js';
import { createAppUser, updateAppUser, type AppUserRecord, saveCycle } from '../api/client.js';

interface Props {
  employees: Employee[];
  cycle: Cycle | null;
  recommendations: RecommendationMap;
  showToast: (msg: string) => void;
  setCycle: (cycle: Cycle) => void;
  demoUsers: AppUserRecord[];
  refreshAll: () => Promise<void>;
}

export function Admin({ employees, cycle, showToast, setCycle, demoUsers, refreshAll }: Props) {
  const [form, setForm] = useState<Cycle | null>(null);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<AppRole>('manager');
  const [newManagerName, setNewManagerName] = useState('');

  useEffect(() => {
    if (cycle) setForm({ ...cycle });
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
