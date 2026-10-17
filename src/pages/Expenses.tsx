import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FinancePage } from '../components/FinanceNav';
import { SpendCharts, SpendBreakdown } from '../components/SpendCharts';
import { useFinanceRole } from '../hooks/useFinanceRole';
import { apiJson, asBody, asItems, newRequestKey } from '../utils/api';
import { formatCurrency } from '../utils/currency';

function monthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

interface Category { _id: string; name: string }
interface Account { _id: string; name: string; currency: 'INR' | 'USD'; isActive?: boolean; type?: string }
interface ExpenseRow {
  _id: string;
  expenseNumber: string;
  description: string;
  expenseDate?: string;
  amount: number;
  balanceDue: number;
  currency?: 'INR' | 'USD';
  status: string;
  categoryName?: string;
  categoryId?: string;
  paymentSource?: string;
  paidByUserId?: string;
  paidByName?: string;
  reimbursedAmount?: number;
}
interface Person { _id: string; email: string }

type View = 'all' | 'unpaid' | 'company' | 'partner';
type SortKey = 'date' | 'category' | 'partner';

const empty = {
  categoryId: '',
  description: '',
  amount: '',
  currency: 'INR' as 'INR' | 'USD',
  expenseDate: '',
  whoPaid: 'company',
  accountId: '',
  paidByUserId: '',
};

export default function Expenses() {
  const { canPost, role } = useFinanceRole();
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [form, setForm] = useState(empty);
  const [reimburse, setReimburse] = useState({ expenseId: '', amount: '', accountId: '' });
  const [reimburseKey, setReimburseKey] = useState(newRequestKey);
  const [key, setKey] = useState(newRequestKey);
  const [view, setView] = useState<View>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [partnerForm, setPartnerForm] = useState({ email: '', password: '' });
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState({ description: '', categoryId: '' });
  const [renamingCategoryId, setRenamingCategoryId] = useState('');
  const [renameCategoryName, setRenameCategoryName] = useState('');
  const [chartFrom, setChartFrom] = useState(monthStart);
  const [chartTo, setChartTo] = useState(today);
  const [spendBreakdown, setSpendBreakdown] = useState<SpendBreakdown | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCharts = async (start = chartFrom, end = chartTo) => {
    const data = await apiJson(`/api/finance/summary?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`);
    const summary = asBody<{ spendBreakdown?: SpendBreakdown }>(data);
    setSpendBreakdown(summary.spendBreakdown || null);
  };

  const load = async () => {
    const [categoryData, accountData, expenseData, peopleData] = await Promise.all([
      apiJson('/api/finance/categories?kind=operating'),
      apiJson('/api/finance/accounts'),
      apiJson('/api/finance/expenses?limit=200'),
      apiJson('/api/auth/users'),
    ]);
    setCategories(asItems<Category>(categoryData));
    setAccounts(asItems<Account>(accountData));
    setExpenses(asItems<ExpenseRow>(expenseData));
    setPeople(asItems<Person>(peopleData));
    await loadCharts();
  };

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  const activeAccounts = accounts.filter((account) => account.isActive !== false);
  const owedToPartner = (expense: ExpenseRow) => (
    expense.paymentSource === 'partner_personal'
      ? Math.max(0, expense.amount - (expense.reimbursedAmount || 0))
      : Math.max(0, expense.balanceDue || 0)
  );
  const whoPaid = (expense: ExpenseRow) => (
    expense.paymentSource === 'partner_personal' ? (expense.paidByName || 'Partner') : 'Company'
  );

  const addCategory = async () => {
    setError('');
    setNotice('');
    try {
      const created = await apiJson('/api/finance/categories', {
        method: 'POST',
        body: JSON.stringify({ name: categoryName, kind: 'operating' }),
      });
      const categoryId = created._id || '';
      setCategoryName('');
      if (categoryId) setForm((current) => ({ ...current, categoryId }));
      await load();
      setNotice('Category added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the category');
    }
  };

  const renameCategory = async (categoryId: string) => {
    setError('');
    setNotice('');
    try {
      await apiJson(`/api/finance/categories/${categoryId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: renameCategoryName }),
      });
      setRenamingCategoryId('');
      setRenameCategoryName('');
      await load();
      setNotice('Category renamed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename the category');
    }
  };

  const deleteCategory = async (categoryId: string, name: string) => {
    if (!confirm(`Delete category “${name}”?`)) return;
    setError('');
    setNotice('');
    try {
      await apiJson(`/api/finance/categories/${categoryId}`, { method: 'DELETE' });
      await load();
      setNotice('Category deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the category');
    }
  };

  const startEditExpense = (expense: ExpenseRow) => {
    setEditingId(expense._id);
    setEditForm({ description: expense.description, categoryId: expense.categoryId || '' });
    setError('');
    setNotice('');
  };

  const saveEditExpense = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    setError('');
    setNotice('');
    try {
      await apiJson(`/api/finance/expenses/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          description: editForm.description,
          categoryId: editForm.categoryId || undefined,
        }),
      });
      setEditingId('');
      await load();
      setNotice('Expense updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the expense');
    }
  };

  const voidExpense = async (expense: ExpenseRow) => {
    if (!confirm(`Remove expense “${expense.description}”? Any linked cash movement will be undone too.`)) return;
    setError('');
    setNotice('');
    try {
      await apiJson(`/api/finance/expenses/${expense._id}/void`, { method: 'POST' });
      await load();
      setNotice('Expense removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the expense');
    }
  };

  const addPartner = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const created = await apiJson('/api/auth/users', {
        method: 'POST',
        body: JSON.stringify({ email: partnerForm.email, password: partnerForm.password, role: 'accounts' }),
      });
      const partnerId = created._id || '';
      setPartnerForm({ email: '', password: '' });
      setPartnerOpen(false);
      if (partnerId) setForm((current) => ({ ...current, paidByUserId: partnerId }));
      await load();
      setNotice('Partner added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the partner');
    }
  };

  const createExpense = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const partnerPaid = form.whoPaid === 'partner';
    const account = activeAccounts.find((item) => item._id === form.accountId);
    if (!partnerPaid && !account) {
      setError('Choose the cash or bank account that paid this.');
      return;
    }
    if (partnerPaid && !form.paidByUserId) {
      setError('Choose the partner who paid.');
      return;
    }
    try {
      await apiJson('/api/finance/expenses', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify({
          categoryId: form.categoryId,
          description: form.description,
          amount: Number(form.amount),
          currency: partnerPaid ? form.currency : account?.currency || form.currency,
          expenseDate: form.expenseDate || undefined,
          paymentSource: partnerPaid ? 'partner_personal' : (account?.type === 'cash' ? 'company_cash' : 'company_bank'),
          paidByUserId: partnerPaid ? form.paidByUserId : undefined,
          paidAmount: partnerPaid ? undefined : Number(form.amount),
          accountId: partnerPaid ? undefined : form.accountId,
          paymentMethod: account?.type === 'cash' ? 'cash' : 'bank_transfer',
        }),
      });
      setKey(newRequestKey());
      setForm(empty);
      await load();
      setNotice(partnerPaid
        ? 'Saved. Company cash is unchanged until you pay the partner back.'
        : 'Saved. The account balance has been reduced.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the expense');
    }
  };

  const reimbursePartner = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const chosen = expenses.find((expense) => expense._id === reimburse.expenseId);
    const remaining = chosen ? owedToPartner(chosen) : 0;
    if (!chosen || remaining <= 0) {
      setError('Choose an amount still owed to a partner.');
      return;
    }
    if (Number(reimburse.amount) > remaining) {
      setError('That is more than the amount still owed.');
      return;
    }
    try {
      await apiJson(`/api/finance/expenses/${reimburse.expenseId}/reimburse`, {
        method: 'POST',
        headers: { 'Idempotency-Key': reimburseKey },
        body: JSON.stringify({
          amount: Number(reimburse.amount),
          accountId: reimburse.accountId,
          paymentMethod: 'bank_transfer',
        }),
      });
      setReimburseKey(newRequestKey());
      setReimburse({ expenseId: '', amount: '', accountId: '' });
      await load();
      setNotice('Partner paid back. Company cash is reduced once.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the reimbursement');
    }
  };

  const openPartnerExpenses = expenses.filter((expense) => expense.status !== 'void' && expense.paymentSource === 'partner_personal' && owedToPartner(expense) > 0);
  const visible = expenses.filter((expense) => {
    if (expense.status === 'void') return false;
    if (view === 'unpaid') return owedToPartner(expense) > 0;
    if (view === 'company') return expense.paymentSource !== 'partner_personal';
    if (view === 'partner') return expense.paymentSource === 'partner_personal' && owedToPartner(expense) > 0;
    return true;
  }).slice().sort((left, right) => {
    if (sortKey === 'category') return (left.categoryName || '').localeCompare(right.categoryName || '');
    if (sortKey === 'partner') return whoPaid(left).localeCompare(whoPaid(right));
    return new Date(right.expenseDate || 0).getTime() - new Date(left.expenseDate || 0).getTime();
  });

  const companyReady = form.whoPaid === 'company';
  const canSave = canPost && Boolean(form.categoryId) && Boolean(form.description.trim()) && Number(form.amount) > 0
    && (companyReady ? Boolean(form.accountId) : Boolean(form.paidByUserId));

  return (
    <FinancePage title="Money to pay">
      {error && <p className="text-red-600 mb-4">{error}</p>}
      {notice && <p className="text-green-700 mb-4">{notice}</p>}

      <div className="bg-white rounded-2xl shadow p-4 mb-6 flex flex-wrap gap-3 items-end">
        <p className="w-full text-sm text-gray-600">Spend graphs use these dates. The expense list below still shows recent rows.</p>
        <label className="text-sm text-gray-600">From
          <input type="date" value={chartFrom} onChange={(e) => setChartFrom(e.target.value)} className="mt-1 block border rounded-lg px-3 py-2" />
        </label>
        <label className="text-sm text-gray-600">To
          <input type="date" value={chartTo} onChange={(e) => setChartTo(e.target.value)} className="mt-1 block border rounded-lg px-3 py-2" />
        </label>
        <button
          type="button"
          className="bg-gray-800 text-white px-4 py-2 rounded-lg"
          onClick={() => loadCharts().catch((err: Error) => setError(err.message))}
        >
          Update graphs
        </button>
      </div>
      <SpendCharts breakdown={spendBreakdown} title="Company and partner spend" />

      <form onSubmit={createExpense} className="bg-white rounded-2xl shadow-lg p-6 mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <h2 className="font-semibold text-gray-800 sm:col-span-2">Record what we spent</h2>
        <p className="text-xs text-gray-500 sm:col-span-2">Company funds reduce that cash or bank account now. A partner’s own money does not. Pay the partner back in the next form.</p>
        <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What we spent" className="border rounded-lg px-3 py-2" />
        <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" className="border rounded-lg px-3 py-2" />
        <input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} className="border rounded-lg px-3 py-2" />
        <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="border rounded-lg px-3 py-2">
          <option value="">{categories.length ? 'Category' : 'No categories yet'}</option>
          {categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
        </select>
        <div className="flex gap-2 sm:col-span-2">
          <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="New category" className="flex-1 border rounded-lg px-3 py-2" />
          <button type="button" disabled={!canPost || !categoryName.trim()} onClick={() => addCategory()} className="bg-gray-800 text-white px-4 py-2 rounded-lg disabled:opacity-50">Add category</button>
        </div>
        {categories.length > 0 && (
          <ul className="sm:col-span-2 text-sm space-y-1">
            {categories.map((category) => (
              <li key={category._id} className="flex flex-wrap gap-2 items-center">
                {renamingCategoryId === category._id ? (
                  <>
                    <input value={renameCategoryName} onChange={(e) => setRenameCategoryName(e.target.value)} className="border rounded-lg px-2 py-1 flex-1" />
                    <button type="button" className="text-cravora-purple" disabled={!canPost || !renameCategoryName.trim()} onClick={() => renameCategory(category._id)}>Save</button>
                    <button type="button" onClick={() => setRenamingCategoryId('')}>Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1">{category.name}</span>
                    {canPost && (
                      <>
                        <button type="button" className="text-cravora-purple" onClick={() => { setRenamingCategoryId(category._id); setRenameCategoryName(category.name); }}>Edit</button>
                        <button type="button" className="text-red-600" onClick={() => deleteCategory(category._id, category.name)}>Delete</button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <select value={form.whoPaid} onChange={(e) => setForm({ ...form, whoPaid: e.target.value })} className="border rounded-lg px-3 py-2">
          <option value="company">Company funds</option>
          <option value="partner">A partner</option>
        </select>
        {companyReady ? (
          activeAccounts.length === 0 ? (
            <p className="text-sm text-amber-700">No cash or bank account yet. <Link to="/accounts/register" className="underline">Add one in Cash & bank</Link>.</p>
          ) : (
            <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className="border rounded-lg px-3 py-2">
              <option value="">Which account paid</option>
              {activeAccounts.map((account) => <option key={account._id} value={account._id}>{account.name} · {account.currency}</option>)}
            </select>
          )
        ) : (
          <div className="flex gap-2">
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as 'INR' | 'USD' })} className="border rounded-lg px-3 py-2">
              <option value="INR">INR</option>
              <option value="USD">USD</option>
            </select>
            <select value={form.paidByUserId} onChange={(e) => setForm({ ...form, paidByUserId: e.target.value })} className="flex-1 border rounded-lg px-3 py-2">
              <option value="">{people.length ? 'Which partner' : 'No partners yet'}</option>
              {people.map((person) => <option key={person._id} value={person._id}>{person.email}</option>)}
            </select>
            <button type="button" disabled={!canPost || role !== 'admin'} onClick={() => setPartnerOpen(true)} className="bg-gray-800 text-white px-3 py-2 rounded-lg text-sm disabled:opacity-50">Add partner</button>
          </div>
        )}
        <button disabled={!canSave} className="bg-cravora-purple text-white px-4 py-2 rounded-lg sm:col-span-2 disabled:opacity-50" type="submit">Save expense</button>
      </form>

      <form onSubmit={reimbursePartner} className="bg-white rounded-2xl shadow-lg p-6 mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <h2 className="font-semibold text-gray-800 sm:col-span-3">Pay a partner back</h2>
        <p className="text-xs text-gray-500 sm:col-span-3">This reduces company cash once. It does not create another expense.</p>
        {openPartnerExpenses.length === 0 && <p className="text-sm text-gray-600 sm:col-span-3">Nothing is owed to a partner.</p>}
        <select value={reimburse.expenseId} onChange={(e) => setReimburse({ ...reimburse, expenseId: e.target.value })} className="border rounded-lg px-3 py-2">
          <option value="">Amount still owed</option>
          {openPartnerExpenses.map((expense) => (
            <option key={expense._id} value={expense._id}>{expense.description} · {expense.paidByName} · {owedToPartner(expense)}</option>
          ))}
        </select>
        <input type="number" min="0.01" step="0.01" value={reimburse.amount} onChange={(e) => setReimburse({ ...reimburse, amount: e.target.value })} placeholder="Amount" className="border rounded-lg px-3 py-2" />
        <select value={reimburse.accountId} onChange={(e) => setReimburse({ ...reimburse, accountId: e.target.value })} className="border rounded-lg px-3 py-2">
          <option value="">Pay from</option>
          {activeAccounts.map((account) => <option key={account._id} value={account._id}>{account.name}</option>)}
        </select>
        <button disabled={!canPost || !reimburse.expenseId || Number(reimburse.amount) <= 0 || !reimburse.accountId} className="bg-gray-800 text-white px-4 py-2 rounded-lg disabled:opacity-50" type="submit">Pay partner</button>
      </form>

      <section className="bg-white rounded-2xl shadow-lg p-6 mt-6">
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <h2 className="font-semibold text-gray-800 mr-auto">Expenses</h2>
          <label className="text-sm text-gray-600">Show
            <select value={view} onChange={(e) => setView(e.target.value as View)} className="mt-1 block border rounded-lg px-3 py-2">
              <option value="all">All</option>
              <option value="unpaid">Unpaid</option>
              <option value="company">Paid by company</option>
              <option value="partner">Owed to a partner</option>
            </select>
          </label>
          <label className="text-sm text-gray-600">Sort
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="mt-1 block border rounded-lg px-3 py-2">
              <option value="date">Date</option>
              <option value="category">Category</option>
              <option value="partner">Who paid</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left"><th className="py-2">Date</th><th>What</th><th>Category</th><th>Who paid</th><th>Amount</th><th>Still owed</th><th></th></tr>
            </thead>
            <tbody>
              {visible.map((expense) => (
                <tr key={expense._id} className="border-b align-top">
                  <td className="py-3">{expense.expenseDate ? new Date(expense.expenseDate).toLocaleDateString() : ''}</td>
                  <td colSpan={editingId === expense._id ? 5 : 1}>
                    {editingId === expense._id ? (
                      <form onSubmit={saveEditExpense} className="flex flex-wrap gap-2 items-center">
                        <input required value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="border rounded-lg px-2 py-1 flex-1 min-w-40" />
                        <select value={editForm.categoryId} onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })} className="border rounded-lg px-2 py-1">
                          {categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}
                        </select>
                        <button type="submit" disabled={!canPost} className="text-cravora-purple disabled:opacity-50">Save</button>
                        <button type="button" onClick={() => setEditingId('')}>Cancel</button>
                      </form>
                    ) : expense.description}
                  </td>
                  {editingId !== expense._id && (
                    <>
                      <td>{expense.categoryName}</td>
                      <td>{whoPaid(expense)}</td>
                      <td>{formatCurrency(expense.amount, expense.currency || 'INR')}</td>
                      <td>{formatCurrency(owedToPartner(expense), expense.currency || 'INR')}</td>
                    </>
                  )}
                  <td className="py-3 whitespace-nowrap">
                    {canPost && editingId !== expense._id && (
                      <>
                        <button type="button" className="text-cravora-purple mr-3" onClick={() => startEditExpense(expense)}>Edit</button>
                        <button type="button" className="text-red-600" onClick={() => voidExpense(expense)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td className="py-3" colSpan={7}>No expenses in this view.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {partnerOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form onSubmit={addPartner} className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-md grid gap-3">
            <h2 className="font-semibold text-gray-800">Add partner</h2>
            <input required type="email" value={partnerForm.email} onChange={(e) => setPartnerForm({ ...partnerForm, email: e.target.value })} placeholder="Email" className="border rounded-lg px-3 py-2" />
            <input required type="password" minLength={8} value={partnerForm.password} onChange={(e) => setPartnerForm({ ...partnerForm, password: e.target.value })} placeholder="Password, at least 8 characters" className="border rounded-lg px-3 py-2" />
            <div className="flex gap-2">
              <button className="bg-cravora-purple text-white px-4 py-2 rounded-lg" type="submit">Save partner</button>
              <button type="button" className="px-4 py-2 rounded-lg" onClick={() => setPartnerOpen(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </FinancePage>
  );
}
