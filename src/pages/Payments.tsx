import { useEffect, useState } from 'react';
import SectionNav from '../components/SectionNav';
import { invoiceLinks } from '../utils/labels';
import { apiJson, asItems, newRequestKey } from '../utils/api';
import { formatCurrency } from '../utils/currency';

const METHODS = ['cash', 'bank_transfer', 'upi', 'cheque', 'card', 'other'];

interface PaymentRecord {
  _id: string;
  paymentDate?: string;
  invoiceId: string;
  paymentMethod: string;
  transactionReference?: string;
  amount: number;
  status: string;
}

interface PayableInvoice {
  invoiceNumber: string;
  issuedSnapshot?: unknown;
  status: string;
  balanceDue?: number;
  currency?: 'INR' | 'USD';
}

interface CashAccount {
  _id: string;
  name: string;
  currency: 'INR' | 'USD';
  isActive?: boolean;
}

export default function Payments() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [invoices, setInvoices] = useState<PayableInvoice[]>([]);
  const [filters, setFilters] = useState({ invoiceId: '', paymentMethod: '', from: '', to: '' });
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [form, setForm] = useState({ invoiceId: '', amount: '', paymentDate: '', paymentMethod: 'bank_transfer', transactionReference: '', notes: '', accountId: '' });
  const [requestKey, setRequestKey] = useState(newRequestKey);
  const [error, setError] = useState('');

  const load = async () => {
    const params = new URLSearchParams({ limit: '50' });
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    const [paymentData, invoiceData, accountData] = await Promise.all([
      apiJson(`/api/payments?${params.toString()}`),
      apiJson('/api/invoices?limit=100'),
      apiJson('/api/finance/accounts').catch(() => ({ items: [] })),
    ]);
    setPayments(asItems<PaymentRecord>(paymentData));
    setInvoices(asItems<PayableInvoice>(invoiceData));
    setAccounts(asItems<CashAccount>(accountData));
  };

  useEffect(() => {
    Promise.all([
      apiJson('/api/payments?limit=50'),
      apiJson('/api/invoices?limit=100'),
      apiJson('/api/finance/accounts').catch(() => ({ items: [] })),
    ]).then(([paymentData, invoiceData, accountData]) => {
      setPayments(asItems<PaymentRecord>(paymentData));
      setInvoices(asItems<PayableInvoice>(invoiceData));
      setAccounts(asItems<CashAccount>(accountData));
    }).catch((err: Error) => setError(err.message));
  }, []);

  const record = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const result = await apiJson('/api/payments', {
        method: 'POST',
        headers: { 'Idempotency-Key': requestKey },
        body: JSON.stringify({ ...form, amount: Number(form.amount), accountId: form.accountId || undefined }),
      });
      const receipt = await apiJson(`/api/payments/${result.payment?._id}/receipt`, { method: 'POST' });
      setRequestKey(newRequestKey());
      setForm({ ...form, amount: '', transactionReference: '', notes: '' });
      await load();
      if (window.confirm(`Payment recorded. Receipt ${receipt.receiptNumber} is ready.\n\nOpen Receipts to email it now?`)) {
        window.location.assign('/receipts');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl space-y-6">
        <SectionNav links={invoiceLinks} />
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Record payment</h1>
          {error && <p className="text-red-600 mb-3">{error}</p>}
          <form onSubmit={record} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select required value={form.invoiceId} onChange={(e) => setForm({ ...form, invoiceId: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">Select issued invoice</option>
              {invoices.filter((invoice) => invoice.issuedSnapshot && invoice.status !== 'cancelled' && invoice.status !== 'paid').map((invoice) => (
                <option key={invoice.invoiceNumber} value={invoice.invoiceNumber}>
                  {invoice.invoiceNumber} · balance {invoice.balanceDue}
                </option>
              ))}
            </select>
            <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" className="border rounded-lg px-3 py-2" />
            <input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} className="border rounded-lg px-3 py-2" />
            <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className="border rounded-lg px-3 py-2">
              {METHODS.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}
            </select>
            <select required value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">Cash or bank account</option>
              {accounts.filter((account) => account.isActive !== false).map((account) => (
                <option key={account._id} value={account._id}>{account.name} · {account.currency}</option>
              ))}
            </select>
            <input value={form.transactionReference} onChange={(e) => setForm({ ...form, transactionReference: e.target.value })} placeholder="Transaction reference" className="border rounded-lg px-3 py-2" />
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" className="border rounded-lg px-3 py-2" />
            <button className="bg-cravora-purple text-white px-4 py-2 rounded-lg sm:col-span-2" type="submit">Record payment and receipt</button>
          </form>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="font-semibold text-gray-800 mb-3">Payment history</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4">
            <input placeholder="Invoice" value={filters.invoiceId} onChange={(e) => setFilters({ ...filters, invoiceId: e.target.value })} className="border rounded-lg px-3 py-2" />
            <select value={filters.paymentMethod} onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">All methods</option>
              {METHODS.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}
            </select>
            <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="border rounded-lg px-3 py-2" />
            <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="border rounded-lg px-3 py-2" />
          </div>
          <button className="bg-gray-800 text-white px-4 py-2 rounded-lg mb-4" onClick={() => load().catch((err) => setError(err.message))}>Filter</button>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left"><th className="py-2">Date</th><th>Invoice</th><th>Method</th><th>Reference</th><th>Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment._id} className="border-b">
                    <td className="py-3">{payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : ''}</td>
                    <td>{payment.invoiceId}</td>
                    <td>{String(payment.paymentMethod).replace('_', ' ')}</td>
                    <td>{payment.transactionReference}</td>
                    <td>{formatCurrency(payment.amount, invoices.find((invoice) => invoice.invoiceNumber === payment.invoiceId)?.currency || 'INR')}</td>
                    <td>{payment.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
