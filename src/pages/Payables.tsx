import { FormEvent, useEffect, useState } from 'react';
import { FinancePage } from '../components/FinanceNav';
import { useFinanceRole } from '../hooks/useFinanceRole';
import { apiJson, asItems, newRequestKey } from '../utils/api';
import { formatCurrency } from '../utils/currency';

interface Vendor { _id: string; name: string; email?: string }
interface Category { _id: string; name: string }
interface Account { _id: string; name: string; currency: 'INR' | 'USD'; isActive?: boolean }
interface Bill {
  _id: string;
  billNumber: string;
  vendorName?: string;
  description: string;
  billDate?: string;
  dueDate?: string;
  amount: number;
  balanceDue: number;
  currency?: 'INR' | 'USD';
  status: string;
  vendorRef?: string;
}

const METHODS = ['cash', 'bank_transfer', 'upi', 'cheque', 'card', 'other'];

export default function Payables() {
  const { canPost } = useFinanceRole();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [vendor, setVendor] = useState({ name: '', email: '', phone: '', gstin: '' });
  const [categoryName, setCategoryName] = useState('');
  const [form, setForm] = useState({
    vendorId: '', categoryId: '', description: '', amount: '', currency: 'INR', billDate: '', dueDate: '',
    vendorRef: '', recurrence: 'none', paidAmount: '', accountId: '', paymentMethod: 'bank_transfer',
  });
  const [pay, setPay] = useState({ billId: '', amount: '', accountId: '', paymentMethod: 'bank_transfer', reference: '', paymentDate: '' });
  const [error, setError] = useState('');
  const [key, setKey] = useState(newRequestKey);
  const [payKey, setPayKey] = useState(newRequestKey);

  const load = async () => {
    const [vendorData, categoryData, accountData, billData] = await Promise.all([
      apiJson('/api/finance/vendors?limit=100'),
      apiJson('/api/finance/categories?kind=vendor'),
      apiJson('/api/finance/accounts'),
      apiJson('/api/finance/vendor-bills?limit=50'),
    ]);
    setVendors(asItems<Vendor>(vendorData));
    setCategories(asItems<Category>(categoryData));
    setAccounts(asItems<Account>(accountData));
    setBills(asItems<Bill>(billData));
  };

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  const addVendor = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await apiJson('/api/finance/vendors', { method: 'POST', body: JSON.stringify(vendor) });
      setVendor({ name: '', email: '', phone: '', gstin: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the vendor');
    }
  };

  const addCategory = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiJson('/api/finance/categories', { method: 'POST', body: JSON.stringify({ name: categoryName, kind: 'vendor' }) });
      setCategoryName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the category');
    }
  };

  const createBill = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await apiJson('/api/finance/vendor-bills', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          paidAmount: form.paidAmount ? Number(form.paidAmount) : undefined,
        }),
      });
      setKey(newRequestKey());
      setForm({ ...form, description: '', amount: '', vendorRef: '', paidAmount: '' });
      await load();
      alert('Vendor bill recorded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the vendor bill');
    }
  };

  const payBill = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await apiJson(`/api/finance/vendor-bills/${pay.billId}/payments`, {
        method: 'POST',
        headers: { 'Idempotency-Key': payKey },
        body: JSON.stringify({ ...pay, amount: Number(pay.amount) }),
      });
      setPayKey(newRequestKey());
      setPay({ ...pay, amount: '', reference: '' });
      await load();
      alert('Vendor payment recorded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the payment');
    }
  };

  const voidBill = async (id: string) => {
    if (!confirm('Void this unpaid vendor bill?')) return;
    try {
      await apiJson(`/api/finance/vendor-bills/${id}/void`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not void the bill');
    }
  };

  const openBills = bills.filter((bill) => bill.status === 'open' || bill.status === 'partially_paid');

  return (
    <FinancePage title="Vendor payables">
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={addVendor} className="bg-white rounded-2xl shadow-lg p-6 grid grid-cols-2 gap-3">
          <h2 className="font-semibold text-gray-800 col-span-2">Vendor</h2>
          <input required name="name" value={vendor.name} onChange={(e) => setVendor({ ...vendor, name: e.target.value })} placeholder="Name" className="border rounded-lg px-3 py-2" />
          <input value={vendor.email} onChange={(e) => setVendor({ ...vendor, email: e.target.value })} placeholder="Email" className="border rounded-lg px-3 py-2" />
          <input value={vendor.phone} onChange={(e) => setVendor({ ...vendor, phone: e.target.value })} placeholder="Phone" className="border rounded-lg px-3 py-2" />
          <input value={vendor.gstin} onChange={(e) => setVendor({ ...vendor, gstin: e.target.value })} placeholder="GSTIN" className="border rounded-lg px-3 py-2" />
          <button disabled={!canPost} className="bg-gray-800 text-white px-4 py-2 rounded-lg col-span-2 disabled:opacity-50" type="submit">Save vendor</button>
        </form>
        <form onSubmit={addCategory} className="bg-white rounded-2xl shadow-lg p-6 flex gap-2 items-start">
          <input required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Vendor category" className="flex-1 border rounded-lg px-3 py-2" />
          <button disabled={!canPost} className="bg-gray-800 text-white px-4 py-2 rounded-lg disabled:opacity-50" type="submit">Add</button>
        </form>
      </div>

      <form onSubmit={createBill} className="bg-white rounded-2xl shadow-lg p-6 mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <h2 className="font-semibold text-gray-800 sm:col-span-2">Vendor bill</h2>
        <select required value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })} className="border rounded-lg px-3 py-2">
          <option value="">Vendor</option>
          {vendors.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
        </select>
        <select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="border rounded-lg px-3 py-2">
          <option value="">Category</option>
          {categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
        </select>
        <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="border rounded-lg px-3 py-2" />
        <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" className="border rounded-lg px-3 py-2" />
        <input required type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="border rounded-lg px-3 py-2" />
        <input type="date" value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value })} className="border rounded-lg px-3 py-2" />
        <input value={form.vendorRef} onChange={(e) => setForm({ ...form, vendorRef: e.target.value })} placeholder="Vendor invoice number" className="border rounded-lg px-3 py-2" />
        <select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })} className="border rounded-lg px-3 py-2">
          <option value="none">Does not repeat</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
        <input type="number" min="0.01" step="0.01" value={form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: e.target.value })} placeholder="Pay now, optional" className="border rounded-lg px-3 py-2" />
        <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className="border rounded-lg px-3 py-2">
          <option value="">Pay from account</option>
          {accounts.filter((account) => account.isActive !== false).map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}
        </select>
        <button disabled={!canPost} className="bg-cravora-purple text-white px-4 py-2 rounded-lg sm:col-span-2 disabled:opacity-50" type="submit">Record bill</button>
      </form>

      <form onSubmit={payBill} className="bg-white rounded-2xl shadow-lg p-6 mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <h2 className="font-semibold text-gray-800 sm:col-span-3">Partial or full payment</h2>
        <select required value={pay.billId} onChange={(e) => setPay({ ...pay, billId: e.target.value })} className="border rounded-lg px-3 py-2">
          <option value="">Bill</option>
          {openBills.map((bill) => <option key={bill._id} value={bill._id}>{bill.billNumber} · {bill.balanceDue}</option>)}
        </select>
        <input required type="number" min="0.01" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} placeholder="Amount" className="border rounded-lg px-3 py-2" />
        <select required value={pay.accountId} onChange={(e) => setPay({ ...pay, accountId: e.target.value })} className="border rounded-lg px-3 py-2">
          <option value="">Account</option>
          {accounts.filter((account) => account.isActive !== false).map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}
        </select>
        <select value={pay.paymentMethod} onChange={(e) => setPay({ ...pay, paymentMethod: e.target.value })} className="border rounded-lg px-3 py-2">
          {METHODS.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}
        </select>
        <input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="Reference" className="border rounded-lg px-3 py-2" />
        <button disabled={!canPost} className="bg-gray-800 text-white px-4 py-2 rounded-lg disabled:opacity-50" type="submit">Record payment</button>
      </form>

      <div className="bg-white rounded-2xl shadow-lg p-6 mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left"><th className="py-2">Bill</th><th>Vendor</th><th>Due</th><th>Status</th><th>Balance</th><th></th></tr>
          </thead>
          <tbody>
            {bills.map((bill) => (
              <tr key={bill._id} className="border-b">
                <td className="py-3">{bill.billNumber}</td>
                <td>{bill.vendorName}</td>
                <td>{bill.dueDate ? new Date(bill.dueDate).toLocaleDateString() : ''}</td>
                <td>{bill.status.replace('_', ' ')}</td>
                <td>{formatCurrency(bill.balanceDue, bill.currency || 'INR')}</td>
                <td>{canPost && bill.status !== 'void' && bill.status !== 'paid' && <button type="button" className="text-red-600" onClick={() => voidBill(bill._id)}>Void</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FinancePage>
  );
}
