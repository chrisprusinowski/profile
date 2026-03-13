import { useEffect, useState } from 'react';
import { roundTo } from '../comp.js';
import type {
  AppRole,
  Cycle,
  Employee,
  PayRange,
  RecommendationMap
} from '../types.js';
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
  downloadExport,
  type PayRangeImportSummary
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
  isActive: true
};

export function Admin({
  employees,
  cycle,
  showToast,
  setCycle,
  demoUsers,
  refreshAll
}: Props) {
  const [form, setForm] = useState<Cycle | null>(null);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<AppRole>('manager');
  const [newManagerName, setNewManagerName] = useState('');
  const [newManagerEmail, setNewManagerEmail] = useState('');
  const [payRanges, setPayRanges] = useState<PayRange[]>([]);
  const [rangeForm, setRangeForm] = useState<PayRange>(EMPTY_RANGE);
  const [editingRangeId, setEditingRangeId] = useState<number | null>(null);
  const [importText, setImportText] = useState('');
  const [importSummary, setImportSummary] =
    useState<PayRangeImportSummary | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

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


  function parsePercentInput(value: string) {
    return roundTo(Math.max(0, Number(value) || 0));
  }

  function isIsoDate(value?: string | null) {
    if (!value || !value.trim()) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() + 1 === m &&
      dt.getUTCDate() === d
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (!form || !validateCycleForm()) return;
      const saved = await saveCycle({
        ...form,
        budgetPct: form.meritBudgetPercent,
        guidelineMax: form.guidelineMaxPercent
      });
      setCycle(saved);
      showToast('Cycle settings saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save cycle settings';
      setFormError(msg);
      showToast(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateUser() {
    const email = newEmail.trim().toLowerCase();
    setUserError(null);

    if (!email) {
      setUserError('Email is required.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setUserError('Enter a valid email address.');
      return;
    }
    if (
      newRole === 'executive' &&
      !newManagerName.trim() &&
      !newManagerEmail.trim()
    ) {
      setUserError(
        'Executive users need an assigned Executive Email.'
      );
      return;
    }

    try {
      await createAppUser({
        email,
        role: newRole,
        executiveName: newRole === 'executive' ? newManagerName.trim() : '',
        executiveEmail: newRole === 'executive' ? newManagerEmail.trim() : ''
      });
      showToast('App user created');
      setNewEmail('');
      setNewRole('executive');
      setNewManagerName('');
      setNewManagerEmail('');
      await refreshAll();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to create app user'
      );
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
    if (!rangeForm.positionType?.trim() && !rangeForm.jobFamily?.trim()) {
      showToast('Pay range needs Position Type or Job Family');
      return;
    }
    if (!rangeForm.geography?.trim()) {
      showToast('Pay range geography is required');
      return;
    }
    if (
      rangeForm.salaryMin <= 0 ||
      rangeForm.salaryMid <= 0 ||
      rangeForm.salaryMax <= 0
    ) {
      showToast('Pay range salary values must be positive');
      return;
    }
    if (
      !(
        rangeForm.salaryMin <= rangeForm.salaryMid &&
        rangeForm.salaryMid <= rangeForm.salaryMax
      )
    ) {
      showToast('Pay range must satisfy Min ≤ Mid ≤ Max');
      return;
    }
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
      showToast(
        err instanceof Error ? err.message : 'Failed to save pay range'
      );
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
      showToast(
        err instanceof Error ? err.message : 'Failed to deactivate pay range'
      );
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
      showToast(
        `Pay ranges imported: ${summary.inserted} inserted, ${summary.updated} updated`
      );
      await loadPayRanges();
      await refreshAll();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Pay range CSV import failed'
      );
    }
  }

  const totalPayroll = employees.reduce((s, e) => s + e.salary, 0);

  const validateCycleForm = () => {
    if (!form.name.trim()) {
      setFormError('Cycle name is required');
      return false;
    }
    if (
      form.meritBudgetPercent < 0 ||
      form.meritBudgetPercent > 100 ||
      form.bonusBudgetPercent < 0 ||
      form.bonusBudgetPercent > 100 ||
      form.guidelineMaxPercent < 0 ||
      form.guidelineMaxPercent > 100
    ) {
      const msg = 'All percentages must be between 0 and 100';
      setFormError(msg);
      showToast(msg);
      return false;
    }
    if (form.minTenureDays < 0) {
      const msg = 'Minimum tenure days cannot be negative';
      setFormError(msg);
      showToast(msg);
      return false;
    }
    if (!isIsoDate(form.openDate)) {
      const msg = 'Open date must be a valid YYYY-MM-DD date';
      setFormError(msg);
      showToast(msg);
      return false;
    }
    if (!isIsoDate(form.closeDate)) {
      const msg = 'Close date must be a valid YYYY-MM-DD date';
      setFormError(msg);
      showToast(msg);
      return false;
    }
    if (!isIsoDate(form.effectiveDate)) {
      const msg = 'Effective date must be a valid YYYY-MM-DD date';
      setFormError(msg);
      showToast(msg);
      return false;
    }
    if (!isIsoDate(form.prorationStartDate)) {
      const msg = 'Proration start date must be a valid YYYY-MM-DD date';
      setFormError(msg);
      showToast(msg);
      return false;
    }
    if (!isIsoDate(form.eligibilityCutoffDate)) {
      const msg = 'Eligibility cutoff date must be a valid YYYY-MM-DD date';
      setFormError(msg);
      showToast(msg);
      return false;
    }
    if (form.enableProration) {
      if (!form.prorationStartDate || !form.eligibilityCutoffDate) {
        const msg = 'Proration start and eligibility cutoff dates are required when proration is enabled';
        setFormError(msg);
        showToast(msg);
        return false;
      }
      if (
        new Date(form.prorationStartDate) >=
        new Date(form.eligibilityCutoffDate)
      ) {
        const msg = 'Eligibility cutoff date must be after proration start date';
        setFormError(msg);
        showToast(msg);
        return false;
      }
    }
    return true;
  };

  return (
    <>
      <header className="topbar">
        <div className="page-title">Admin Settings</div>
      </header>
      <div className="page-content">
        <form onSubmit={handleSubmit} style={{ maxWidth: 760 }}>
          <div className="card mb-20">
            <div className="card-header">
              <div className="card-title">Cycle Configuration</div>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Cycle Name</label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Cycle Status</label>
                  <select
                    className="form-select"
                    value={form.status}
                    onChange={(e) => update('status', e.target.value)}
                  >
                    <option value="open">open</option>
                    <option value="closed">closed</option>
                    <option value="locked">locked</option>
                  </select>
                  <div className="form-hint">
                    {form.status === 'open'
                      ? 'Managers can edit recommendations'
                      : form.status === 'closed'
                        ? 'No new edits allowed'
                        : 'All recommendations locked'}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Minimum tenure days</label>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    step={1}
                    value={form.minTenureDays}
                    onChange={(e) =>
                      update('minTenureDays', Math.max(0, Math.round(Number(e.target.value) || 0)))
                    }
                  />
                  <div className="form-hint">Employees with fewer days of tenure are ineligible</div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Effective Date</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.effectiveDate || ''}
                    onChange={(e) => update('effectiveDate', e.target.value)}
                  />
                  <div className="form-hint">Used for tenure and proration calculations</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Open Date</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.openDate || ''}
                    onChange={(e) => update('openDate', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Close Date</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.closeDate || ''}
                    onChange={(e) => update('closeDate', e.target.value)}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Total Payroll Reference ($)</label>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.totalPayroll}
                    onChange={(e) => update('totalPayroll', roundTo(Math.max(0, Number(e.target.value) || 0)))}
                  />
                  <div className="form-hint">Optional: when set, this becomes the payroll basis for budget calculations.</div>
                </div>
              </div>
              <div className="divider" />
              <h4 style={{ marginBottom: 10 }}>Comp Budget</h4>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Merit Budget %</label>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={form.meritBudgetPercent}
                    onChange={(e) =>
                      update('meritBudgetPercent', parsePercentInput(e.target.value))
                    }
                  />
                  <div className="form-hint">
                    ≈ ${Math.round((form.totalPayroll > 0 ? form.totalPayroll : totalPayroll) * (form.meritBudgetPercent / 100)).toLocaleString()} of {' '}
                    ${Math.round(form.totalPayroll > 0 ? form.totalPayroll : totalPayroll).toLocaleString()} payroll basis
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Bonus Budget %</label>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={form.bonusBudgetPercent}
                    onChange={(e) =>
                      update('bonusBudgetPercent', parsePercentInput(e.target.value))
                    }
                  />
                  <div className="form-hint">
                    ≈ ${Math.round((form.totalPayroll > 0 ? form.totalPayroll : totalPayroll) * (form.bonusBudgetPercent / 100)).toLocaleString()} of payroll basis
                  </div>
                </div>
              </div>
              <h4 style={{ marginBottom: 10 }}>Guidelines</h4>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Guideline Max %</label>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={form.guidelineMaxPercent}
                    onChange={(e) =>
                      update('guidelineMaxPercent', parsePercentInput(e.target.value))
                    }
                  />
                  <div className="form-hint">Merit increases above this threshold are flagged for review</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Allow override</label>
                  <div>
                    <input
                      type="checkbox"
                      checked={form.allowEligibilityOverride}
                      onChange={(e) =>
                        update('allowEligibilityOverride', e.target.checked)
                      }
                    />{' '}
                    <span style={{ marginLeft: 6 }}>
                      Allow override for ineligible employees
                    </span>
                  </div>
                </div>
              </div>
              <h4 style={{ marginBottom: 10 }}>Proration Settings</h4>
              <div className="form-group">
                <label className="form-label">Enable proration</label>
                <div>
                  <input
                    type="checkbox"
                    checked={form.enableProration}
                    onChange={(e) =>
                      update('enableProration', e.target.checked)
                    }
                  />{' '}
                  <span style={{ marginLeft: 6 }}>
                    Enable proration by hire date
                  </span>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Proration start date</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.prorationStartDate || ''}
                    onChange={(e) =>
                      update('prorationStartDate', e.target.value)
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Eligibility cutoff date</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.eligibilityCutoffDate || ''}
                    onChange={(e) =>
                      update('eligibilityCutoffDate', e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="form-hint">
                Example: Hired Jan 1–Mar 31: prorated. Hired Apr 1+: ineligible.
              </div>
              <div className="form-hint">
                Loaded employee payroll: ${Math.round(totalPayroll).toLocaleString()} · Budget payroll basis: ${Math.round(form.totalPayroll > 0 ? form.totalPayroll : totalPayroll).toLocaleString()}
              </div>
            </div>
            <div className="card-footer">
              {formError && <div className="alert alert-red" style={{ marginBottom: 10 }}>{formError}</div>}
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save Cycle Settings'}
              </button>
            </div>
          </div>
        </form>

        <div className="card mb-20">
          <div className="card-header">
            <div className="card-title">Pay Ranges</div>
          </div>
          <div className="card-body">
            <p style={{ marginTop: 0, color: 'var(--gray-500)' }}>
              CSV required fields: position_type, geography, salary_min,
              salary_mid, salary_max. Optional: job_family,
              title/job_title_reference, level, geo_tier, currency,
              effective_date, range_name.
            </p>
            <textarea
              className="form-input"
              rows={5}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="position_type,geography,salary_min,salary_mid,salary_max"
            />
            <div style={{ marginTop: 10 }}>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => void handleImportRanges()}
              >
                Import Pay Range CSV
              </button>
            </div>
            {importSummary && (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <div>
                  Processed {importSummary.processed} • Inserted{' '}
                  {importSummary.inserted} • Updated {importSummary.updated} •
                  Rejected {importSummary.rejected}
                </div>
                {importSummary.validationErrors.length > 0 && (
                  <div style={{ marginTop: 6, color: 'var(--red-600)' }}>
                    First errors:{' '}
                    {importSummary.validationErrors
                      .slice(0, 3)
                      .map((e) => `row ${e.row}: ${e.error}`)
                      .join(' | ')}
                  </div>
                )}
              </div>
            )}
            <div className="divider" />
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Position Type</label>
                <input
                  className="form-input"
                  value={rangeForm.positionType ?? ''}
                  onChange={(e) =>
                    setRangeForm((r) => ({
                      ...r,
                      positionType: e.target.value
                    }))
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Job Family</label>
                <input
                  className="form-input"
                  value={rangeForm.jobFamily ?? ''}
                  onChange={(e) =>
                    setRangeForm((r) => ({ ...r, jobFamily: e.target.value }))
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Geography</label>
                <input
                  className="form-input"
                  value={rangeForm.geography ?? ''}
                  onChange={(e) =>
                    setRangeForm((r) => ({ ...r, geography: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Level</label>
                <input
                  className="form-input"
                  value={rangeForm.level ?? ''}
                  onChange={(e) =>
                    setRangeForm((r) => ({ ...r, level: e.target.value }))
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Min</label>
                <input
                  className="form-input"
                  type="number"
                  value={rangeForm.salaryMin}
                  onChange={(e) =>
                    setRangeForm((r) => ({
                      ...r,
                      salaryMin: Number(e.target.value) || 0
                    }))
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Mid</label>
                <input
                  className="form-input"
                  type="number"
                  value={rangeForm.salaryMid}
                  onChange={(e) =>
                    setRangeForm((r) => ({
                      ...r,
                      salaryMid: Number(e.target.value) || 0
                    }))
                  }
                />
              </div>
              <div className="form-group">
                <label className="form-label">Max</label>
                <input
                  className="form-input"
                  type="number"
                  value={rangeForm.salaryMax}
                  onChange={(e) =>
                    setRangeForm((r) => ({
                      ...r,
                      salaryMax: Number(e.target.value) || 0
                    }))
                  }
                />
              </div>
            </div>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => void handleSaveRange()}
            >
              {editingRangeId ? 'Update Pay Range' : 'Add Pay Range'}
            </button>
            {editingRangeId && (
              <button
                className="btn btn-secondary"
                style={{ marginLeft: 8 }}
                type="button"
                onClick={() => {
                  setEditingRangeId(null);
                  setRangeForm(EMPTY_RANGE);
                }}
              >
                Cancel
              </button>
            )}
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Position Type</th>
                  <th>Geography</th>
                  <th>Level</th>
                  <th className="numeric">Min</th>
                  <th className="numeric">Mid</th>
                  <th className="numeric">Max</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payRanges.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="text-muted"
                      style={{ textAlign: 'center', padding: 20 }}
                    >
                      No pay ranges loaded yet.
                    </td>
                  </tr>
                )}
                {payRanges.map((row) => (
                  <tr key={row.id}>
                    <td>{row.positionType || row.jobFamily || '—'}</td>
                    <td>{row.geography || '—'}</td>
                    <td>{row.level || '—'}</td>
                    <td className="numeric">
                      {Math.round(row.salaryMin).toLocaleString()}
                    </td>
                    <td className="numeric">
                      {Math.round(row.salaryMid).toLocaleString()}
                    </td>
                    <td className="numeric">
                      {Math.round(row.salaryMax).toLocaleString()}
                    </td>
                    <td>{row.isActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        type="button"
                        onClick={() => {
                          setEditingRangeId(row.id ?? null);
                          setRangeForm({ ...row });
                        }}
                      >
                        Edit
                      </button>
                      {row.isActive && (
                        <button
                          className="btn btn-danger btn-sm"
                          style={{ marginLeft: 8 }}
                          type="button"
                          onClick={() => void handleDeactivateRange(row.id)}
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card mb-20">
          <div className="card-header">
            <div className="card-title">Exports</div>
          </div>
          <div className="card-body">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={async () => {
                try {
                  const text = await downloadExport('employees.csv');
                  const blob = new Blob([text], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'employees.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                  showToast('Employee export downloaded');
                } catch (err) {
                  showToast(
                    err instanceof Error
                      ? err.message
                      : 'Employee export failed'
                  );
                }
              }}
            >
              Export Employees CSV
            </button>
            <button
              className="btn btn-secondary"
              style={{ marginLeft: 8 }}
              type="button"
              onClick={async () => {
                try {
                  const text = await downloadExport('recommendations.csv');
                  const blob = new Blob([text], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'recommendations.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                  showToast('Recommendations export downloaded');
                } catch (err) {
                  showToast(
                    err instanceof Error
                      ? err.message
                      : 'Recommendations export failed'
                  );
                }
              }}
            >
              Export Recommendations CSV
            </button>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">User Permissions (Demo)</div>
          </div>
          <div className="card-body">
            <p style={{ marginTop: 0, color: 'var(--gray-500)' }}>
              Demo-only local user mapping by email. This will be replaced by
              real auth later.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="new.executive@demo.com"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select
                  className="form-select"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as AppRole)}
                >
                  <option value="admin">admin</option>
                  <option value="executive">executive</option>
                  <option value="manager">manager</option>
                </select>
              </div>
              {newRole === 'executive' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Executive</label>
                    <input
                      className="form-input"
                      value={newManagerName}
                      onChange={(e) => setNewManagerName(e.target.value)}
                      placeholder="Jamie Rivera"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Executive Email
                    </label>
                    <input
                      className="form-input"
                      value={newManagerEmail}
                      onChange={(e) => setNewManagerEmail(e.target.value)}
                      placeholder="manager1@demo.com"
                    />
                  </div>
                </>
              )}
            </div>
            {userError && (
              <div className="alert alert-red" style={{ marginBottom: 12 }}>
                <div className="alert-icon">✕</div>
                <div>{userError}</div>
              </div>
            )}
            <button
              className="btn btn-secondary"
              onClick={handleCreateUser}
              type="button"
            >
              Add App User
            </button>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Assigned Executive</th>
                  <th>Executive Email</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {demoUsers.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-muted"
                      style={{ textAlign: 'center', padding: 20 }}
                    >
                      No demo users found.
                    </td>
                  </tr>
                )}
                {demoUsers.map((user) => (
                  <tr key={user.email}>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>{user.executiveName || '—'}</td>
                    <td>{user.executiveEmail || '—'}</td>
                    <td>{user.isActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        type="button"
                        onClick={() => void handleToggleActive(user)}
                      >
                        {user.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
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
