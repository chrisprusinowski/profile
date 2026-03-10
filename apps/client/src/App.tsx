import { useState, useEffect, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { Dashboard } from './pages/Dashboard.js';
import { Employees } from './pages/Employees.js';
import { Merit } from './pages/Merit.js';
import { Admin } from './pages/Admin.js';
import { Executive } from './pages/Executive.js';
import { fetchEmployees, fetchCycle, fetchRecommendations } from './api/client.js';
import type { Employee, Cycle, RecommendationMap } from './types.js';

export default function App() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationMap>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const refreshRecommendations = useCallback(async () => {
    const recs = await fetchRecommendations();
    setRecommendations(recs);
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [emps, cyc, recs] = await Promise.all([
        fetchEmployees(),
        fetchCycle(),
        fetchRecommendations(),
      ]);
      setEmployees(emps);
      setCycle(cyc);
      setRecommendations(recs);
      setLoadError(null);
    } catch (err) {
      console.error('Failed to load data:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load application data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);


  const flaggedCount = Object.values(recommendations).filter((r) => r.status === 'Flagged').length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--gray-500)', fontSize: 15 }}>
        Loading…
      </div>
    );
  }


  if (loadError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 24 }}>
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-header"><div className="card-title">Unable to load app data</div></div>
          <div className="card-body">
            <p style={{ marginTop: 0 }}>{loadError}</p>
            <p style={{ color: 'var(--gray-500)', marginBottom: 0 }}>
              Check that the API is running and can connect to PostgreSQL, then refresh.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const shared = { employees, cycle, recommendations, showToast, refreshRecommendations, setCycle, refreshAll };

  return (
    <>
      <Layout cycle={cycle} flaggedCount={flaggedCount}>
        <Routes>
          <Route path="/" element={<Dashboard {...shared} />} />
          <Route path="/employees" element={<Employees {...shared} />} />
          <Route path="/merit" element={<Merit {...shared} />} />
          <Route path="/admin" element={<Admin {...shared} />} />
          <Route path="/executive" element={<Executive {...shared} />} />
        </Routes>
      </Layout>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
