import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FinancePage } from '../components/FinanceNav';
import { SpendCharts, SpendBreakdown } from '../components/SpendCharts';
import { apiJson, asBody } from '../utils/api';
import { formatCurrency, formatMoneyMap } from '../utils/currency';
import { activityLabel } from '../utils/labels';

interface MoneyMap {
  INR?: number;
  USD?: number;
}

interface Summary {
  receivables: MoneyMap;
  overdue: MoneyMap;
  overdueCount: number;
  moneyReceived: MoneyMap;
  moneySpent?: MoneyMap;
  spendBreakdown?: SpendBreakdown;
  vendorPayables: MoneyMap;
  unpaidExpenses: MoneyMap;
  partnerPayables?: Array<{ paidByName?: string; INR: number; USD: number }>;
  statementReviewCount?: number;
  upcomingTotal: MoneyMap;
  unassignedReceipts: number;
  from: string;
  to: string;
  accounts: Array<{ _id: string; name: string; type: string; currency: 'INR' | 'USD'; balance: number; isActive: boolean }>;
  overdueInvoices: Array<{ invoiceNumber: string; party: string; balanceDue: number; currency: 'INR' | 'USD'; dueDate?: string }>;
  dueSoonInvoices?: Array<{ invoiceNumber: string; party: string; balanceDue: number; currency: 'INR' | 'USD'; dueDate?: string }>;
  upcoming: Array<{ id: string; kind: string; label: string; partyName: string; dueDate?: string; amount: number; currency: 'INR' | 'USD' }>;
  recent: Array<{ _id: string; entryNumber?: string; kind: string; amount: number; currency: 'INR' | 'USD'; partyName?: string; postedAt?: string; direction: string }>;
}

function monthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function today() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

export default function Accounts() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  const load = async (start = from, end = to) => {
    const data = await apiJson(`/api/finance/summary?from=${start}&to=${end}`);
    setSummary(asBody<Summary>(data));
  };

  useEffect(() => {
    apiJson(`/api/finance/summary?from=${monthStart()}&to=${today()}`)
      .then((data) => setSummary(asBody<Summary>(data)))
      .catch((err: Error) => setError(err.message));
  }, []);

  const card = (label: string, value: string, hint: string) => (
    <div className="bg-white rounded-xl shadow p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{hint}</p>
    </div>
  );

  return (
    <FinancePage title="Overview">
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <div className="bg-white rounded-2xl shadow p-4 mb-6 flex flex-wrap gap-3 items-end">
        <p className="w-full text-sm text-gray-600">These dates apply to money received, money spent, and recent activity. Cash, what clients owe, and what we owe stay as of today.</p>
        <label className="text-sm text-gray-600">From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block border rounded-lg px-3 py-2" />
        </label>
        <label className="text-sm text-gray-600">To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block border rounded-lg px-3 py-2" />
        </label>
        <button type="button" className="bg-gray-800 text-white px-4 py-2 rounded-lg" onClick={() => load().catch((err: Error) => setError(err.message))}>Apply</button>
        <Link to="/accounts/reports" className="text-sm font-medium text-cravora-purple">Reports</Link>
      </div>
      {summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link to="/accounts/register" className="block">{card('Cash and bank now', formatMoneyMap(summary.accounts.reduce<MoneyMap>((totals, account) => {
              const key = account.currency === 'USD' ? 'USD' : 'INR';
              totals[key] = (totals[key] || 0) + account.balance;
              return totals;
            }, {})), 'Current balances')}</Link>
            {card('Received this month', formatMoneyMap(summary.moneyReceived), 'Only the dates above. Transfers excluded.')}
            {card('Spent this month', formatMoneyMap(summary.moneySpent || {}), 'Company expenses and supplier payments. Transfers and reimbursements excluded.')}
            <Link to="/accounts/receivables" className="block">{card('Clients owe us', formatMoneyMap(summary.receivables), 'Issued invoices only')}</Link>
            <Link to="/accounts/collections" className="block">{card('Overdue', formatMoneyMap(summary.overdue), `${summary.overdueCount} invoice${summary.overdueCount === 1 ? '' : 's'}`)}</Link>
            <Link to="/accounts/expenses" className="block">{card('Owed to suppliers', formatMoneyMap(summary.vendorPayables), `Open expenses ${formatMoneyMap(summary.unpaidExpenses)}`)}</Link>
            <Link to="/accounts/expenses" className="block">{card('Owed to partners', formatMoneyMap((summary.partnerPayables || []).reduce<MoneyMap>((totals, row) => ({
              INR: (totals.INR || 0) + (row.INR || 0),
              USD: (totals.USD || 0) + (row.USD || 0),
            }), {})), (summary.partnerPayables || []).map((row) => `${row.paidByName || 'Partner'} ${formatMoneyMap(row)}`).join(' · ') || 'Nothing owed to a partner')}</Link>
            <Link to="/accounts/statements" className="block">{card('Statements to review', String(summary.statementReviewCount || 0), 'Lines not confirmed yet')}</Link>
          </div>
          {summary.unassignedReceipts > 0 && (
            <p className="mt-4 text-sm text-gray-600">{summary.unassignedReceipts} receipt{summary.unassignedReceipts === 1 ? '' : 's'} are not linked to a cash or bank account.</p>
          )}
          <SpendCharts breakdown={summary.spendBreakdown} title="Company and partner spend" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <section className="bg-white rounded-2xl shadow p-6">
              <h2 className="font-semibold text-gray-800 mb-3">Cash and bank</h2>
              <ul className="space-y-2 text-sm">
                {summary.accounts.map((account) => (
                  <li key={account._id} className="flex justify-between border-b py-2">
                    <span>{account.name} · {account.type}{account.isActive ? '' : ' · inactive'}</span>
                    <span>{formatCurrency(account.balance, account.currency)}</span>
                  </li>
                ))}
                {summary.accounts.length === 0 && <li>No accounts yet. Add one in the register.</li>}
              </ul>
            </section>
            <section className="bg-white rounded-2xl shadow p-6">
              <h2 className="font-semibold text-gray-800 mb-3">Needs attention</h2>
              <ul className="space-y-2 text-sm">
                {summary.overdueInvoices.map((invoice) => (
                  <li key={invoice.invoiceNumber}>
                    <Link to={`/invoices/${invoice.invoiceNumber}`} className="flex justify-between border-b py-2">
                      <span>Overdue {invoice.invoiceNumber} · {invoice.party}</span>
                      <span>{formatCurrency(invoice.balanceDue, invoice.currency || 'INR')}</span>
                    </Link>
                  </li>
                ))}
                {(summary.dueSoonInvoices || []).map((invoice) => (
                  <li key={`soon-${invoice.invoiceNumber}`}>
                    <Link to={`/invoices/${invoice.invoiceNumber}`} className="flex justify-between border-b py-2">
                      <span>Due soon {invoice.invoiceNumber} · {invoice.party}</span>
                      <span>{formatCurrency(invoice.balanceDue, invoice.currency || 'INR')}</span>
                    </Link>
                  </li>
                ))}
                {summary.overdueInvoices.length === 0 && (summary.dueSoonInvoices || []).length === 0 && <li>No overdue or due-soon invoices.</li>}
              </ul>
            </section>
            <section className="bg-white rounded-2xl shadow p-6">
              <h2 className="font-semibold text-gray-800 mb-3">Upcoming obligations</h2>
              <ul className="space-y-2 text-sm">
                {summary.upcoming.map((item) => (
                  <li key={`${item.kind}-${item.id}`} className="flex justify-between border-b py-2">
                    <span>{item.label} · {item.partyName || item.kind.replace('_', ' ')}</span>
                    <span>{formatCurrency(item.amount, item.currency || 'INR')}</span>
                  </li>
                ))}
                {summary.upcoming.length === 0 && <li>Nothing is due in the next 30 days.</li>}
              </ul>
            </section>
            <section className="bg-white rounded-2xl shadow p-6">
              <h2 className="font-semibold text-gray-800 mb-3">Recent activity</h2>
              <ul className="space-y-2 text-sm">
                {summary.recent.map((entry) => (
                  <li key={entry._id} className="flex justify-between gap-3 border-b py-2">
                    <span>{activityLabel(entry.kind)}{entry.partyName ? ` · ${entry.partyName}` : ''}</span>
                    <span>{formatCurrency(entry.amount, entry.currency || 'INR')}</span>
                  </li>
                ))}
                {summary.recent.length === 0 && <li>No receipts, payments, expenses, or transfers yet.</li>}
              </ul>
            </section>
          </div>
        </>
      )}
    </FinancePage>
  );
}
