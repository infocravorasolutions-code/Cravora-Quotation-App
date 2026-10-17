import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useFinanceRole } from '../hooks/useFinanceRole';

const links = [
  { path: '/accounts', label: 'Overview' },
  { path: '/accounts/receivables', label: 'Money to receive' },
  { path: '/accounts/collections', label: 'Income & collections' },
  { path: '/accounts/expenses', label: 'Money to pay' },
  { path: '/accounts/register', label: 'Cash & bank' },
  { path: '/accounts/statements', label: 'Statements' },
];

export default function FinanceNav() {
  const location = useLocation();
  const { role, canPost } = useFinanceRole();

  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-2">
        {links.map((link) => {
          const active = link.path === '/accounts/expenses'
            ? location.pathname === '/accounts/expenses' || location.pathname === '/accounts/payables'
            : location.pathname === link.path;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                active ? 'bg-cravora-purple text-white' : 'bg-white text-gray-700 shadow'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
      {!canPost && (
        <p className="mt-3 text-sm text-amber-700">The {role} role can view accounts but cannot post changes.</p>
      )}
    </div>
  );
}

export function FinancePage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <FinanceNav />
        <h1 className="text-2xl font-bold text-gray-800 mb-6">{title}</h1>
        {children}
      </div>
    </div>
  );
}
