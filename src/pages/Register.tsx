import { FormEvent, useEffect, useState } from 'react';
import { FinancePage } from '../components/FinanceNav';
import { useFinanceRole } from '../hooks/useFinanceRole';
import { apiJson, asItems, newRequestKey } from '../utils/api';
import { formatCurrency } from '../utils/currency';
import { activityLabel } from '../utils/labels';

interface Account {
  _id: string;
  name: string;
  type: string;
  currency: 'INR' | 'USD';
  balance: number;
  isActive?: boolean;
}

interface Entry {
  _id: string;
  entryNumber: string;
  postedAt?: string;
  kind: string;
  direction: string;
  amount: number;
  currency?: 'INR' | 'USD';
  partyName?: string;
  reference?: string;
  reversedBy?: string;
}

export default function Register() {
  const { canPost } = useFinanceRole();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [accountForm, setAccountForm] = useState({ name: '', type: 'bank', currency: 'INR', openingBalance: '' });
  const [transfer, setTransfer] = useState({ fromAccountId: '', toAccountId: '', amount: '', reference: '' });
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState({ name: '', type: 'bank' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [accountKey, setAccountKey] = useState(newRequestKey);
  const [transferKey, setTransferKey] = useState(newRequestKey);

  const load = async () => {
    const [accountData, registerData] = await Promise.all([
      apiJson('/api/finance/accounts'),
      apiJson('/api/finance/register?limit=50'),
    ]);
    setAccounts(asItems<Account>(accountData));
    setEntries(asItems<Entry>(registerData));
  };

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await apiJson('/api/finance/accounts', {
        method: 'POST',
        headers: { 'Idempotency-Key': accountKey },
        body: JSON.stringify({ ...accountForm, openingBalance: accountForm.openingBalance ? Number(accountForm.openingBalance) : 0 }),
      });
      setAccountKey(newRequestKey());
      setAccountForm({ name: '', type: 'bank', currency: 'INR', openingBalance: '' });
      await load();
      setNotice('Account added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account');
    }
  };

  const startEdit = (account: Account) => {
    setEditingId(account._id);
    setEditForm({ name: account.name, type: account.type });
    setError('');
    setNotice('');
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    setError('');
    setNotice('');
    try {
      await apiJson(`/api/finance/accounts/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      setEditingId('');
      await load();
      setNotice('Account updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the account');
    }
  };

  const removeAccount = async (account: Account) => {
    const label = `${account.name} (${account.currency})`;
    if (!confirm(`Remove ${label}? If it has movements it will be closed instead of deleted.`)) return;
    setError('');
    setNotice('');
    try {
      const result = await apiJson(`/api/finance/accounts/${account._id}`, { method: 'DELETE' }) as {
        message?: string;
        closed?: boolean;
      };
      await load();
      setNotice(result.message || (result.closed ? 'Account closed.' : 'Account removed.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the account');
    }
  };

  const reopenAccount = async (account: Account) => {
    setError('');
    setNotice('');
    try {
      await apiJson(`/api/finance/accounts/${account._id}/active`, {
        method: 'POST',
        body: JSON.stringify({ isActive: true }),
      });
      await load();
      setNotice('Account reopened.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reopen the account');
    }
  };

  const postTransfer = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await apiJson('/api/finance/transfers', {
        method: 'POST',
        headers: { 'Idempotency-Key': transferKey },
        body: JSON.stringify({ ...transfer, amount: Number(transfer.amount) }),
      });
      setTransferKey(newRequestKey());
      setTransfer({ ...transfer, amount: '', reference: '' });
      await load();
      setNotice('Transfer recorded. It is not an expense.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the transfer');
    }
  };

  const reverse = async (id: string) => {
    if (!confirm('Undo this movement? The original row stays, and a reversing row is added.')) return;
    setError('');
    setNotice('');
    try {
      await apiJson(`/api/finance/entries/${id}/reverse`, {
        method: 'POST',
        headers: { 'Idempotency-Key': newRequestKey() },
      });
      await load();
      setNotice('Movement undone.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not undo the movement');
    }
  };

  const active = accounts.filter((account) => account.isActive !== false);

  return (
    <FinancePage title="Cash & bank">
      {error && <p className="text-red-600 mb-4">{error}</p>}
      {notice && <p className="text-green-700 mb-4">{notice}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={createAccount} className="bg-white rounded-2xl shadow-lg p-6 space-y-3">
          <h2 className="font-semibold">Add an account</h2>
          <p className="text-xs text-gray-500">A starting balance is the money already in that account. It is not income.</p>
          <input required value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="Name, such as Kotak" className="w-full border rounded-lg px-3 py-2" />
          <select value={accountForm.type} onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })} className="w-full border rounded-lg px-3 py-2">
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
          </select>
          <select value={accountForm.currency} onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value })} className="w-full border rounded-lg px-3 py-2">
            <option value="INR">INR</option>
            <option value="USD">USD</option>
          </select>
          <input type="number" min="0" step="0.01" value={accountForm.openingBalance} onChange={(e) => setAccountForm({ ...accountForm, openingBalance: e.target.value })} placeholder="Starting balance" className="w-full border rounded-lg px-3 py-2" />
          <button disabled={!canPost} className="bg-cravora-purple text-white px-4 py-2 rounded-lg disabled:opacity-50" type="submit">Add account</button>
        </form>
        <form onSubmit={postTransfer} className="bg-white rounded-2xl shadow-lg p-6 space-y-3">
          <h2 className="font-semibold">Transfer</h2>
          <p className="text-xs text-gray-500">Moving money between our accounts is not an expense.</p>
          <select required value={transfer.fromAccountId} onChange={(e) => setTransfer({ ...transfer, fromAccountId: e.target.value })} className="w-full border rounded-lg px-3 py-2">
            <option value="">From</option>
            {active.map((account) => <option key={account._id} value={account._id}>{account.name} · {account.currency}</option>)}
          </select>
          <select required value={transfer.toAccountId} onChange={(e) => setTransfer({ ...transfer, toAccountId: e.target.value })} className="w-full border rounded-lg px-3 py-2">
            <option value="">To</option>
            {active.map((account) => <option key={account._id} value={account._id}>{account.name} · {account.currency}</option>)}
          </select>
          <input required type="number" min="0.01" step="0.01" value={transfer.amount} onChange={(e) => setTransfer({ ...transfer, amount: e.target.value })} placeholder="Amount" className="w-full border rounded-lg px-3 py-2" />
          <input value={transfer.reference} onChange={(e) => setTransfer({ ...transfer, reference: e.target.value })} placeholder="Reference" className="w-full border rounded-lg px-3 py-2" />
          <button disabled={!canPost || !transfer.fromAccountId || !transfer.toAccountId || Number(transfer.amount) <= 0} className="bg-gray-800 text-white px-4 py-2 rounded-lg disabled:opacity-50" type="submit">Transfer</button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6 mt-6">
        <h2 className="font-semibold mb-3">Balances</h2>
        {accounts.length === 0 && <p className="text-sm text-gray-600 mb-4">No accounts yet. Add a cash box or a bank account above.</p>}
        <ul className="grid grid-cols-1 gap-2 text-sm mb-6">
          {accounts.map((account) => (
            <li key={account._id} className="border rounded-lg px-3 py-2">
              {editingId === account._id ? (
                <form onSubmit={saveEdit} className="flex flex-wrap gap-2 items-center">
                  <input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="border rounded-lg px-3 py-1 flex-1 min-w-40" />
                  <select value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })} className="border rounded-lg px-3 py-1">
                    <option value="bank">Bank</option>
                    <option value="cash">Cash</option>
                  </select>
                  <button type="submit" disabled={!canPost} className="text-cravora-purple disabled:opacity-50">Save</button>
                  <button type="button" onClick={() => setEditingId('')}>Cancel</button>
                </form>
              ) : (
                <div className="flex flex-wrap gap-3 items-center justify-between">
                  <span>
                    {account.name} · {account.type} · {account.currency}
                    {account.isActive === false ? ' · closed' : ''}
                  </span>
                  <span className="flex items-center gap-3">
                    <span>{formatCurrency(account.balance, account.currency)}</span>
                    {canPost && (
                      <>
                        <button type="button" className="text-cravora-purple" onClick={() => startEdit(account)}>Edit</button>
                        {account.isActive === false ? (
                          <button type="button" className="text-cravora-purple" onClick={() => reopenAccount(account)}>Reopen</button>
                        ) : (
                          <button type="button" className="text-red-600" onClick={() => removeAccount(account)}>Remove</button>
                        )}
                      </>
                    )}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
        <h2 className="font-semibold mb-3">Recent movements</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left"><th className="py-2">Date</th><th>What</th><th>Party</th><th>Amount</th><th></th></tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry._id} className="border-b">
                  <td className="py-3">{entry.postedAt ? new Date(entry.postedAt).toLocaleDateString() : ''}</td>
                  <td>{activityLabel(entry.kind)}{entry.reversedBy ? ' · undone' : ''}</td>
                  <td>{entry.partyName}</td>
                  <td>{formatCurrency(entry.amount, entry.currency || 'INR')}</td>
                  <td>
                    {canPost && !entry.reversedBy && entry.kind !== 'reversal' && (
                      <button type="button" className="text-cravora-purple" onClick={() => reverse(entry._id)}>Undo</button>
                    )}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td className="py-3" colSpan={5}>No movements yet. Spending is recorded on Money to pay. Client payments arrive from Invoices.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </FinancePage>
  );
}
