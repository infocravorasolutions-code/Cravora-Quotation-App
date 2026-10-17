import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { apiJson } from '../utils/api';

export default function RequireAuth() {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('cravora.token')) {
      setAllowed(false);
      setReady(true);
      return;
    }
    apiJson('/api/auth/me')
      .then(() => setAllowed(true))
      .catch(() => setAllowed(false))
      .finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="min-h-screen bg-gray-50" />;
  if (!allowed) return <Navigate to="/login" replace />;
  return <Outlet />;
}
