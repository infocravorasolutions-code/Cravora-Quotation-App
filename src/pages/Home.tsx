import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiJson, asBody } from '../utils/api';
import { formatCurrency, formatMoneyMap } from '../utils/currency';
import { activityLabel } from '../utils/labels';

interface MoneyMap { INR?: number; USD?: number }

interface FinanceSummary {
  receivables: MoneyMap;
  overdue: MoneyMap;
  overdueCount: number;
  moneyReceived: MoneyMap;
  moneySpent?: MoneyMap;
  vendorPayables: MoneyMap;
  unpaidExpenses: MoneyMap;
  partnerPayables?: Array<{ paidByName?: string; INR: number; USD: number }>;
  statementReviewCount?: number;
  accounts: Array<{ _id: string; name: string; currency: 'INR' | 'USD'; balance: number }>;
  overdueInvoices: Array<{ invoiceNumber: string; party: string; balanceDue: number; currency: 'INR' | 'USD'; dueDate?: string }>;
  dueSoonInvoices?: Array<{ invoiceNumber: string; party: string; balanceDue: number; currency: 'INR' | 'USD'; dueDate?: string }>;
  upcoming: Array<{ id: string; kind: string; label: string; partyName: string; dueDate?: string; amount: number; currency: 'INR' | 'USD' }>;
  recent: Array<{ _id: string; kind: string; amount: number; currency?: 'INR' | 'USD'; partyName?: string; postedAt?: string }>;
}

interface SalesSummary {
  quotations: Record<string, number>;
  invoices: { total: number; unpaid: number; overdue: number };
}

function monthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function Home() {
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [sales, setSales] = useState<SalesSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const from = monthStart();
    const to = today();
    apiJson(`/api/finance/summary?from=${from}&to=${to}`)
      .then((data) => setFinance(asBody<FinanceSummary>(data)))
      .catch((err: Error) => setError(err.message));
    apiJson('/api/reports/summary')
      .then((data) => setSales(asBody<SalesSummary>(data)))
      .catch(() => setSales(null));
  }, []);

  const cash = (finance?.accounts || []).reduce<MoneyMap>((totals, account) => {
    const key = account.currency === 'USD' ? 'USD' : 'INR';
    totals[key] = (totals[key] || 0) + account.balance;
    return totals;
  }, {});

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-50 py-8">
      <div className="container mx-auto max-w-6xl px-4">
        <h1 className="mb-2 text-2xl font-bold text-gray-800">Home</h1>
        <p className="mb-6 text-sm text-gray-600">
          Cash, what clients owe, and what we owe are current. Received and spent use this month.
        </p>
        {error && <p className="mb-4 text-red-600">{error}</p>}
        {finance && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link to="/accounts/register" className="rounded-xl bg-white p-4 shadow">
              <p className="text-sm text-gray-500">Cash and bank now</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">{formatMoneyMap(cash)}</p>
              <p className="mt-1 text-xs text-gray-400">Current balances, kept by currency</p>
            </Link>
            <Link to="/accounts" className="rounded-xl bg-white p-4 shadow">
              <p className="text-sm text-gray-500">Received this month</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">{formatMoneyMap(finance.moneyReceived)}</p>
              <p className="mt-1 text-xs text-gray-400">Invoice payments and advances. Transfers excluded.</p>
            </Link>
            <Link to="/accounts" className="rounded-xl bg-white p-4 shadow">
              <p className="text-sm text-gray-500">Spent this month</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">{formatMoneyMap(finance.moneySpent)}</p>
              <p className="mt-1 text-xs text-gray-400">Expenses and supplier payments. Transfers and reimbursements excluded.</p>
            </Link>
            <Link to="/accounts/receivables" className="rounded-xl bg-white p-4 shadow">
              <p className="text-sm text-gray-500">Clients owe us</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">{formatMoneyMap(finance.receivables)}</p>
              <p className="mt-1 text-xs text-gray-400">Issued invoices only</p>
            </Link>
            <Link to="/accounts/collections" className="rounded-xl bg-white p-4 shadow">
              <p className="text-sm text-gray-500">Overdue</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">{formatMoneyMap(finance.overdue)}</p>
              <p className="mt-1 text-xs text-gray-400">{finance.overdueCount} invoice{finance.overdueCount === 1 ? '' : 's'}</p>
            </Link>
            <Link to="/accounts/expenses" className="rounded-xl bg-white p-4 shadow">
              <p className="text-sm text-gray-500">Owed to suppliers</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">{formatMoneyMap(finance.vendorPayables)}</p>
              <p className="mt-1 text-xs text-gray-400">Open expenses {formatMoneyMap(finance.unpaidExpenses)}</p>
            </Link>
            <Link to="/accounts/expenses" className="rounded-xl bg-white p-4 shadow">
              <p className="text-sm text-gray-500">Owed to partners</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">{formatMoneyMap((finance.partnerPayables || []).reduce<MoneyMap>((totals, row) => ({
                INR: (totals.INR || 0) + (row.INR || 0),
                USD: (totals.USD || 0) + (row.USD || 0),
              }), {}))}</p>
              <p className="mt-1 text-xs text-gray-400">{(finance.partnerPayables || []).map((row) => row.paidByName || 'Partner').join(', ') || 'Nothing owed to a partner'}</p>
            </Link>
            <Link to="/accounts/statements" className="rounded-xl bg-white p-4 shadow">
              <p className="text-sm text-gray-500">Statements to review</p>
              <p className="mt-1 text-2xl font-bold text-gray-800">{finance.statementReviewCount || 0}</p>
              <p className="mt-1 text-xs text-gray-400">Lines not confirmed yet</p>
            </Link>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl bg-white p-6 shadow">
            <h2 className="mb-3 font-semibold text-gray-800">Needs attention</h2>
            <ul className="space-y-2 text-sm">
              {(finance?.overdueInvoices || []).map((invoice) => (
                <li key={invoice.invoiceNumber}>
                  <Link to={`/invoices/${invoice.invoiceNumber}`} className="flex justify-between border-b py-2">
                    <span>Overdue invoice {invoice.invoiceNumber} · {invoice.party}</span>
                    <span>{formatCurrency(invoice.balanceDue, invoice.currency || 'INR')}</span>
                  </Link>
                </li>
              ))}
              {(finance?.dueSoonInvoices || []).map((invoice) => (
                <li key={`soon-${invoice.invoiceNumber}`}>
                  <Link to={`/invoices/${invoice.invoiceNumber}`} className="flex justify-between border-b py-2">
                    <span>Due soon {invoice.invoiceNumber} · {invoice.party}</span>
                    <span>{formatCurrency(invoice.balanceDue, invoice.currency || 'INR')}</span>
                  </Link>
                </li>
              ))}
              {(finance?.upcoming || []).map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <Link to="/accounts/expenses" className="flex justify-between border-b py-2">
                    <span>{item.kind === 'vendor_bill' ? 'Supplier bill' : 'Expense'} {item.label} · {item.partyName}</span>
                    <span>{formatCurrency(item.amount, item.currency || 'INR')}</span>
                  </Link>
                </li>
              ))}
              {finance && finance.overdueInvoices.length === 0 && (finance.dueSoonInvoices || []).length === 0 && finance.upcoming.length === 0 && (
                <li>Nothing needs attention right now.</li>
              )}
            </ul>
          </section>
          <section className="rounded-2xl bg-white p-6 shadow">
            <h2 className="mb-3 font-semibold text-gray-800">Recent activity</h2>
            <ul className="space-y-2 text-sm">
              {(finance?.recent || []).map((entry) => (
                <li key={entry._id} className="flex justify-between border-b py-2">
                  <span>{activityLabel(entry.kind)}{entry.partyName ? ` · ${entry.partyName}` : ''}</span>
                  <span>{formatCurrency(entry.amount, entry.currency || 'INR')}</span>
                </li>
              ))}
              {finance && finance.recent.length === 0 && <li>No payments, expenses, or transfers yet.</li>}
            </ul>
          </section>
        </div>

        {sales && (
          <section className="mt-6 rounded-2xl bg-white p-6 shadow">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Quotations and invoices</h2>
              <Link to="/history" className="text-sm font-medium text-cravora-purple">Open quotations</Link>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <p>Quotations: {sales.quotations.total || 0}</p>
              <p>Drafts: {sales.quotations.draft || 0}</p>
              <p>Accepted: {sales.quotations.accepted || 0}</p>
              <p>Unpaid invoices: {sales.invoices.unpaid || 0}</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
