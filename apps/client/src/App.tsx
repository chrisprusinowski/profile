import { useState, useEffect, useCallback } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { Dashboard } from './pages/Dashboard.js';
import { Employees } from './pages/Employees.js';
import { Merit } from './pages/Merit.js';
import { Admin } from './pages/Admin.js';
import { Executive } from './pages/Executive.js';
import {
  fetchAppUsers,
  fetchCurrentUser,
  fetchCycle,
  fetchEmployees,
  fetchRecommendations,
  getDemoUserEmail,
  setDemoUserEmail,
  type AppUserRecord,
} from './api/client.js';
import type { AppUser, Cycle, Employee, RecommendationMap } from './types.js';

export default function App() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationMap>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [demoUsers, setDemoUsers] = useState<AppUserRecord[]>([]);

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
      const [user, emps, cyc, recs] = await Promise.all([
        fetchCurrentUser(),
        fetchEmployees(),
        fetchCycle(),
        fetchRecommendations(),
      ]);
      setCurrentUser(user);
      setEmployees(emps);
      setCycle(cyc);
      setRecommendations(recs);
      if (user.role === 'admin') {
        const users = await fetchAppUsers();
        setDemoUsers(users);
      } else {
        setDemoUsers([]);
      }
      setLoadError(null);
    } catch (err) {
      console.error('Failed to load data:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load application data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('mc_demo_user_email')) {
      setDemoUserEmail(getDemoUserEmail());
    }
    void refreshAll();
  }, [refreshAll]);

  const flaggedCount = Object.values(recommendations).filter((r) => r.status === 'Flagged').length;

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading…</div>;
  }

  if (loadError || !currentUser) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 24 }}>
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-header"><div className="card-title">Unable to load app data</div></div>
          <div className="card-body">
            <p style={{ marginTop: 0 }}>{loadError ?? 'Unknown error'}</p>
          </div>
        </div>
      </div>
    );
  }

  const canManageUsers = currentUser.role === 'admin';
  const isReadOnly = currentUser.role === 'executive';

  return (
    <>
      <Layout
        cycle={cycle}
        flaggedCount={flaggedCount}
        currentUser={currentUser}
        onSwitchUser={async (email) => {
          setDemoUserEmail(email);
          await refreshAll();
          showToast(`Switched demo user to ${email}`);
        }}
      >
        <Routes>
          <Route path="/" element={<Dashboard employees={employees} cycle={cycle} recommendations={recommendations} />} />
          <Route path="/employees" element={<Employees employees={employees} cycle={cycle} recommendations={recommendations} showToast={showToast} refreshAll={refreshAll} readOnly={isReadOnly || currentUser.role === 'manager'} />} />
          <Route path="/merit" element={<Merit employees={employees} cycle={cycle} recommendations={recommendations} showToast={showToast} refreshRecommendations={refreshRecommendations} readOnly={isReadOnly} />} />
          <Route path="/admin" element={canManageUsers ? <Admin employees={employees} cycle={cycle} recommendations={recommendations} showToast={showToast} setCycle={setCycle} demoUsers={demoUsers} refreshAll={refreshAll} /> : <Navigate to="/" replace />} />
          <Route path="/executive" element={<Executive employees={employees} cycle={cycle} recommendations={recommendations} />} />
        </Routes>
      </Layout>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
