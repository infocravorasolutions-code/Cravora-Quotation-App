import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { apiJson } from '../utils/api';

export default function Login() {
  const navigate = useNavigate();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiJson('/api/auth/status')
      .then((data) => setNeedsSetup(Boolean(data.needsSetup)))
      .catch(() => setError('Could not reach the server. Start the backend, then try again.'));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await apiJson(needsSetup ? '/api/auth/setup' : '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('cravora.token', String(result.token || ''));
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-50 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 space-y-5">
        <BrandLogo className="h-12 w-auto" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{needsSetup ? 'Create your login' : 'Sign in'}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {needsSetup ? 'This account is the only way into quotations, bills, and email.' : 'Sign in to open quotations, bills, and settings.'}
          </p>
        </div>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Email</span>
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Password</span>
          <input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy || needsSetup === null} className="w-full bg-cravora-purple text-white rounded-lg py-2.5 font-medium disabled:opacity-60">
          {needsSetup ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
