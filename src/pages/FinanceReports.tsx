import { useEffect, useState } from 'react';
import { FinancePage } from '../components/FinanceNav';
import { apiJson, asItems } from '../utils/api';
import { downloadCsv } from '../utils/csv';
import { formatCurrency } from '../utils/currency';

interface OutstandingRow {
  invoiceNumber: string;
  party: string;
  dueDate?: string;
  status: string;
  currency: 'INR' | 'USD';
  balanceDue: number;
  amountPaid: number;
  grandTotal: number;
}

interface ExpenseRow {
  type: string;
  number: string;
  date?: string;
  dueDate?: string;
  party: string;
  category: string;
  description: string;
  currency: 'INR' | 'USD';
  amount: number;
  amountPaid: number;
  balanceDue: number;
  status: string;
  reference: string;
}

interface TransactionRow {
  date?: string;
  kind: string;
  party: string;
  reference: string;
  amount: number;
  currency: 'INR' | 'USD';
  direction: string;
  income: boolean;
  expense: boolean;
  reversed: boolean;
}

function monthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function FinanceReports() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [outstanding, setOutstanding] = useState<OutstandingRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [partners, setPartners] = useState<Array<{ partner: string; INR: number; USD: number }>>([]);
  const [categories, setCategories] = useState<Array<{ category: string; currency: 'INR' | 'USD'; amount: number; count: number }>>([]);
  const [cash, setCash] = useState<Array<{ movement: string; INR: number; USD: number }>>([]);
  const [error, setError] = useState('');

  const load = async (start = from, end = to) => {
    const query = `from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`;
    const [outstandingData, expenseData, transactionData, partnerData, categoryData, cashData] = await Promise.all([
      apiJson(`/api/reports/outstanding?${query}`),
      apiJson(`/api/reports/expenses?${query}`),
      apiJson(`/api/reports/transactions?${query}`),
      apiJson('/api/reports/partners'),
      apiJson(`/api/reports/categories?${query}`),
      apiJson(`/api/reports/cash?${query}`),
    ]);
    setOutstanding(asItems<OutstandingRow>(outstandingData));
    setExpenses(asItems<ExpenseRow>(expenseData));
    setTransactions(asItems<TransactionRow>(transactionData));
    setPartners(asItems(partnerData));
    setCategories(asItems(categoryData));
    setCash(asItems(cashData));
  };

  useEffect(() => {
    const start = monthStart();
    const end = new Date().toISOString().slice(0, 10);
    const query = `from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`;
    Promise.all([
      apiJson('/api/reports/outstanding'),
      apiJson(`/api/reports/expenses?${query}`),
      apiJson(`/api/reports/transactions?${query}`),
      apiJson('/api/reports/partners'),
      apiJson(`/api/reports/categories?${query}`),
      apiJson(`/api/reports/cash?${query}`),
    ]).then(([outstandingData, expenseData, transactionData, partnerData, categoryData, cashData]) => {
      setOutstanding(asItems<OutstandingRow>(outstandingData));
      setExpenses(asItems<ExpenseRow>(expenseData));
      setTransactions(asItems<TransactionRow>(transactionData));
      setPartners(asItems(partnerData));
      setCategories(asItems(categoryData));
      setCash(asItems(cashData));
    }).catch((err: Error) => setError(err.message));
  }, []);

  const dateText = (value?: string) => (value ? new Date(value).toLocaleDateString() : '');

  return (
    <FinancePage title="Finance reports">
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <div className="bg-white rounded-2xl shadow p-4 mb-6 flex flex-wrap gap-3 items-end">
        <label className="text-sm">From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block border rounded-lg px-3 py-2" />
        </label>
        <label className="text-sm">To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block border rounded-lg px-3 py-2" />
        </label>
        <button type="button" className="bg-gray-800 text-white px-4 py-2 rounded-lg" onClick={() => load().catch((err: Error) => setError(err.message))}>Apply</button>
        <p className="text-xs text-gray-500 w-full">Dates apply to category totals, cash movement, expenses, and transactions. Partner balances, cash on hand, and what clients owe stay current. These figures are not profit.</p>
      </div>

      <section className="bg-white rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h2 className="font-semibold">Outstanding</h2>
            <p className="text-xs text-gray-500">Receivables: what clients still owe.</p>
          </div>
          <button type="button" className="text-sm text-cravora-purple" onClick={() => downloadCsv('outstanding.csv', outstanding.map((row) => ({
            invoice: row.invoiceNumber,
            party: row.party,
            due: dateText(row.dueDate),
            status: row.status,
            currency: row.currency,
            balance: row.balanceDue,
          })))}>Export</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left"><th className="py-2">Invoice</th><th>Client</th><th>Due</th><th>Status</th><th>Balance</th></tr></thead>
            <tbody>
              {outstanding.map((row) => (
                <tr key={row.invoiceNumber} className="border-b">
                  <td className="py-3">{row.invoiceNumber}</td>
                  <td>{row.party}</td>
                  <td>{dateText(row.dueDate)}</td>
                  <td>{row.status}</td>
                  <td>{formatCurrency(row.balanceDue, row.currency || 'INR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold">Expenses and vendor bills</h2>
          <button type="button" className="text-sm text-cravora-purple" onClick={() => downloadCsv('expenses.csv', expenses.map((row) => ({
            type: row.type,
            number: row.number,
            date: dateText(row.date),
            party: row.party,
            category: row.category,
            description: row.description,
            currency: row.currency,
            amount: row.amount,
            paid: row.amountPaid,
            balance: row.balanceDue,
            status: row.status,
          })))}>Export</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left"><th className="py-2">Type</th><th>Number</th><th>Party</th><th>Status</th><th>Balance</th></tr></thead>
            <tbody>
              {expenses.map((row) => (
                <tr key={`${row.type}-${row.number}`} className="border-b">
                  <td className="py-3">{row.type.replace(/_/g, ' ')}</td>
                  <td>{row.number}</td>
                  <td>{row.party}</td>
                  <td>{row.status}</td>
                  <td>{formatCurrency(row.balanceDue, row.currency || 'INR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold">Partner balances</h2>
          <button type="button" className="text-sm text-cravora-purple" onClick={() => downloadCsv('partners.csv', partners)}>Export</button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left"><th className="py-2">Partner</th><th>INR</th><th>USD</th></tr></thead>
          <tbody>
            {partners.map((row) => (
              <tr key={row.partner} className="border-b">
                <td className="py-3">{row.partner}</td>
                <td>{formatCurrency(row.INR || 0, 'INR')}</td>
                <td>{formatCurrency(row.USD || 0, 'USD')}</td>
              </tr>
            ))}
            {partners.length === 0 && <tr><td className="py-3" colSpan={3}>Nothing is owed to a partner.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="bg-white rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold">Category totals</h2>
          <button type="button" className="text-sm text-cravora-purple" onClick={() => downloadCsv('categories.csv', categories)}>Export</button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left"><th className="py-2">Category</th><th>Count</th><th>Amount</th></tr></thead>
          <tbody>
            {categories.map((row) => (
              <tr key={`${row.category}-${row.currency}`} className="border-b">
                <td className="py-3">{row.category}</td>
                <td>{row.count}</td>
                <td>{formatCurrency(row.amount, row.currency || 'INR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-white rounded-2xl shadow-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold">Cash movement</h2>
          <button type="button" className="text-sm text-cravora-purple" onClick={() => downloadCsv('cash-movement.csv', cash)}>Export</button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left"><th className="py-2">Movement</th><th>INR</th><th>USD</th></tr></thead>
          <tbody>
            {cash.map((row) => (
              <tr key={row.movement} className="border-b">
                <td className="py-3">{row.movement}</td>
                <td>{formatCurrency(row.INR || 0, 'INR')}</td>
                <td>{formatCurrency(row.USD || 0, 'USD')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold">Transactions</h2>
          <button type="button" className="text-sm text-cravora-purple" onClick={() => downloadCsv('transactions.csv', transactions.map((row) => ({
            date: dateText(row.date),
            kind: row.kind,
            party: row.party,
            reference: row.reference,
            direction: row.direction,
            currency: row.currency,
            amount: row.amount,
            income: row.income ? 'yes' : 'no',
            expense: row.expense ? 'yes' : 'no',
          })))}>Export</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left"><th className="py-2">Date</th><th>Kind</th><th>Party</th><th>Reference</th><th>Amount</th></tr></thead>
            <tbody>
              {transactions.map((row, index) => (
                <tr key={`${row.kind}-${row.reference}-${index}`} className="border-b">
                  <td className="py-3">{dateText(row.date)}</td>
                  <td>{row.kind.replace(/_/g, ' ')}{row.reversed ? ' · reversed' : ''}</td>
                  <td>{row.party}</td>
                  <td>{row.reference}</td>
                  <td>{formatCurrency(row.amount, row.currency || 'INR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </FinancePage>
  );
}
