import { useState, useEffect } from 'react';
import type { Cycle, Employee, RecommendationMap } from '../types.js';
import { saveCycle } from '../api/client.js';

interface Props {
  employees: Employee[];
  cycle: Cycle | null;
  recommendations: RecommendationMap;
  showToast: (msg: string) => void;
  setCycle: (cycle: Cycle) => void;
}

export function Admin({ employees, cycle, showToast, setCycle }: Props) {
  const [form, setForm] = useState<Cycle | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (cycle) setForm({ ...cycle });
  }, [cycle]);

  if (!form) return null;

  function update<K extends keyof Cycle>(key: K, value: Cycle[K]) {
    setForm((f) => f ? { ...f, [key]: value } : f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const saved = await saveCycle(form);
      setCycle(saved);
      showToast('Cycle settings saved');
    } catch (err) {
      showToast('Failed to save — check API connection');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const totalPayroll = employees.reduce((s, e) => s + e.salary, 0);
  const derivedBudget = totalPayroll * ((form.budgetPct ?? 3.5) / 100);

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <div className="page-title">Cycle Settings</div>
          <div className="page-subtitle">Configure the active merit cycle</div>
        </div>
        <div className="topbar-right">
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </header>

      <div className="page-content">
        <form onSubmit={handleSubmit} style={{ maxWidth: 720 }}>

          {/* Basic info */}
          <div className="card mb-20">
            <div className="card-header">
              <div>
                <div className="card-title">Cycle Information</div>
                <div className="card-subtitle">Name, type, and timeline</div>
              </div>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Cycle Name</label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="2026 Annual Merit Cycle"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Open Date</label>
                  <input className="form-input" type="date" value={form.openDate ?? ''} onChange={(e) => update('openDate', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Close Date</label>
                  <input className="form-input" type="date" value={form.closeDate ?? ''} onChange={(e) => update('closeDate', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Effective Date</label>
                  <input className="form-input" type="date" value={form.effectiveDate ?? ''} onChange={(e) => update('effectiveDate', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={form.status} onChange={(e) => update('status', e.target.value)}>
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="finalized">Finalized</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Budget */}
          <div className="card mb-20">
            <div className="card-header">
              <div>
                <div className="card-title">Budget Configuration</div>
                <div className="card-subtitle">Merit budget as a percentage of payroll</div>
              </div>
            </div>
            <div className="card-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Merit Budget %</label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.1"
                    min="0"
                    max="20"
                    value={form.budgetPct}
                    onChange={(e) => update('budgetPct', parseFloat(e.target.value) || 0)}
                  />
                  <div className="form-hint">
                    {totalPayroll > 0
                      ? `→ $${Math.round(derivedBudget).toLocaleString()} based on $${Math.round(totalPayroll).toLocaleString()} loaded payroll`
                      : 'Load employees to see the computed budget'}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Budget Override ($)</label>
                  <input
                    className="form-input"
                    type="number"
                    step="1000"
                    min="0"
                    value={form.budgetTotal ?? ''}
                    placeholder="Leave blank to use % above"
                    onChange={(e) => update('budgetTotal', parseFloat(e.target.value) || 0)}
                  />
                  <div className="form-hint">If set, overrides the % calculation above</div>
                </div>
              </div>
            </div>
          </div>

          {/* Guidelines */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Merit Guidelines</div>
                <div className="card-subtitle">Increases outside this range will be flagged</div>
              </div>
            </div>
            <div className="card-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Minimum Increase %</label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.guidelineMin}
                    onChange={(e) => update('guidelineMin', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Maximum Increase %</label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.1"
                    min="0"
                    value={form.guidelineMax}
                    onChange={(e) => update('guidelineMax', parseFloat(e.target.value) || 0)}
                  />
                  <div className="form-hint">Increases above this will be flagged for approval</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Cycle Settings'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
