import { useEffect, useState } from 'react';
import { apiJson } from '../utils/api';

export function useFinanceRole() {
  const [role, setRole] = useState('admin');

  useEffect(() => {
    apiJson('/api/auth/me')
      .then((data) => setRole(data.role || 'admin'))
      .catch(() => setRole('admin'));
  }, []);

  return { role, canPost: role === 'admin' || role === 'accounts' };
}
