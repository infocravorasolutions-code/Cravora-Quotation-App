import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import { apiJson } from '../utils/api';
import {
  Users,
  FileText,
  Landmark,
  Home,
  Receipt,
  Settings,
  Plus,
  Menu,
  X,
} from 'lucide-react';

const primaryItems = [
  { path: '/home', label: 'Home', icon: Home },
  { path: '/clients', label: 'Clients', icon: Users },
  { path: '/history', label: 'Quotations', icon: FileText },
  { path: '/invoices', label: 'Invoices & Payments', icon: Receipt },
  { path: '/accounts', label: 'Accounts', icon: Landmark },
];

const wizardPaths = ['/', '/modules', '/summary', '/pdf-preview'];
const invoicePaths = ['/invoices', '/payments', '/receipts'];

function isActive(path: string, pathname: string) {
  if (path === '/history') return pathname === '/history' || wizardPaths.includes(pathname);
  if (path === '/invoices') return invoicePaths.some((item) => pathname === item || pathname.startsWith(`${item}/`));
  if (path === '/accounts') return pathname.startsWith('/accounts');
  return pathname === path;
}

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const inWizard = wizardPaths.includes(location.pathname);

  const signOut = async () => {
    try {
      await apiJson('/api/auth/logout', { method: 'POST' });
    } catch {
      localStorage.removeItem('cravora.token');
    }
    localStorage.removeItem('cravora.token');
    navigate('/login', { replace: true });
  };

  const itemClass = (active: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      active
        ? 'bg-purple-50 text-cravora-purple'
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link to="/home" className="flex shrink-0 items-center" onClick={() => setOpen(false)}>
          <BrandLogo className="h-10 w-auto" />
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center gap-1 lg:flex">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.path} to={item.path} className={itemClass(isActive(item.path, location.pathname))}>
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/"
            className="hidden items-center gap-1.5 rounded-lg bg-cravora-purple px-3.5 py-2 text-sm font-medium text-white hover:bg-cravora-purple-dark sm:flex"
          >
            <Plus className="h-4 w-4" />
            New quotation
          </Link>
          <Link
            to="/settings"
            className={`${itemClass(location.pathname === '/settings')} hidden sm:flex`}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <button type="button" onClick={signOut} className="hidden px-2 text-sm font-medium text-gray-600 hover:text-gray-900 sm:inline">
            Sign out
          </button>
          <button
            type="button"
            className="rounded-lg p-2 text-gray-700 hover:bg-gray-100 lg:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 bg-white px-4 py-3 lg:hidden">
          <div className="grid grid-cols-2 gap-1">
            {primaryItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.path} to={item.path} className={itemClass(isActive(item.path, location.pathname))} onClick={() => setOpen(false)}>
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            <Link to="/" className={itemClass(inWizard)} onClick={() => setOpen(false)}>
              <Plus className="h-4 w-4" />
              New quotation
            </Link>
            <Link to="/settings" className={itemClass(location.pathname === '/settings')} onClick={() => setOpen(false)}>
              <Settings className="h-4 w-4" />
              Settings
            </Link>
            <button type="button" className={itemClass(false)} onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
