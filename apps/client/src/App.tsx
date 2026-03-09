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
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  // Poll for employee updates when running with the live API (file-watching backend)
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL as string;
    if (!apiUrl) return;
    const interval = setInterval(async () => {
      const emps = await fetchEmployees().catch(() => null);
      if (emps) setEmployees(emps);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const flaggedCount = Object.values(recommendations).filter((r) => r.status === 'Flagged').length;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--gray-500)', fontSize: 15 }}>
        Loading…
      </div>
    );
  }

  const shared = { employees, cycle, recommendations, showToast, refreshRecommendations, setCycle };

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
