import { FormEvent, useEffect, useState } from 'react';
import { FinancePage } from '../components/FinanceNav';
import { useFinanceRole } from '../hooks/useFinanceRole';
import { apiJson, asBody, asItems, newRequestKey } from '../utils/api';
import { formatCurrency, formatMoneyMap } from '../utils/currency';

interface ClientRow {
  _id: string;
  companyName: string;
}

interface AccountRow {
  _id: string;
  name: string;
  currency: 'INR' | 'USD';
  isActive?: boolean;
}

interface ReceivableRow {
  clientId: string;
  partyName: string;
  outstanding: { INR?: number; USD?: number };
  overdue: { INR?: number; USD?: number };
  advance: { INR?: number; USD?: number };
  invoices: number;
  allocatable: number;
}

interface StatementInvoice {
  invoiceNumber: string;
  status: string;
  balanceDue: number;
  currency?: 'INR' | 'USD';
  dueDate?: string;
  clientId?: string;
  issuedSnapshot?: unknown;
}

interface StatementAdvance {
  _id: string;
  amount: number;
  unallocated: number;
  currency?: 'INR' | 'USD';
  reversedBy?: string;
  reference?: string;
  postedAt?: string;
}

interface Statement {
  outstanding: { INR?: number; USD?: number };
  overdue: { INR?: number; USD?: number };
  advance: { INR?: number; USD?: number };
  invoices: StatementInvoice[];
  advances: StatementAdvance[];
  history: Array<{ date?: string; kind: string; amount: number; currency?: 'INR' | 'USD'; reference?: string; income?: boolean }>;
}

const METHODS = ['cash', 'bank_transfer', 'upi', 'cheque', 'card', 'other'];

export default function Receivables() {
  const { canPost } = useFinanceRole();
  const [rows, setRows] = useState<ReceivableRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [clientId, setClientId] = useState('');
  const [statement, setStatement] = useState<Statement | null>(null);
  const [error, setError] = useState('');
  const [advance, setAdvance] = useState({ clientId: '', accountId: '', amount: '', paymentDate: '', paymentMethod: 'bank_transfer', reference: '', currency: 'INR' });
  const [allocation, setAllocation] = useState({ advanceId: '', invoiceId: '', amount: '' });
  const [advanceKey, setAdvanceKey] = useState(newRequestKey);
  const [allocationKey, setAllocationKey] = useState(newRequestKey);

  const loadRows = async () => {
    const data = await apiJson('/api/finance/receivables');
    setRows(asItems<ReceivableRow>(data));
  };

  const loadStatement = async (id = clientId) => {
    if (!id) return;
    const data = await apiJson(`/api/finance/clients/${id}/statement`);
    setStatement(asBody<Statement>(data));
  };

  useEffect(() => {
    Promise.all([
      apiJson('/api/finance/receivables'),
      apiJson('/api/clients?limit=100'),
      apiJson('/api/finance/accounts'),
    ]).then(([receivableData, clientData, accountData]) => {
      setRows(asItems<ReceivableRow>(receivableData));
      setClients(asItems<ClientRow>(clientData));
      setAccounts(asItems<AccountRow>(accountData));
    }).catch((err: Error) => setError(err.message));
  }, []);

  const openClient = async (id: string) => {
    setClientId(id);
    setAdvance((current) => ({ ...current, clientId: id }));
    setError('');
    try {
      await loadStatement(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the statement');
    }
  };

  const recordAdvance = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await apiJson('/api/finance/advances', {
        method: 'POST',
        headers: { 'Idempotency-Key': advanceKey },
        body: JSON.stringify({ ...advance, amount: Number(advance.amount) }),
      });
      setAdvanceKey(newRequestKey());
      setAdvance({ ...advance, amount: '', reference: '' });
      await loadRows();
      await loadStatement(advance.clientId);
      alert('Advance receipt recorded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the advance');
    }
  };

  const allocate = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await apiJson('/api/finance/allocations', {
        method: 'POST',
        headers: { 'Idempotency-Key': allocationKey },
        body: JSON.stringify({ ...allocation, amount: Number(allocation.amount) }),
      });
      setAllocationKey(newRequestKey());
      setAllocation({ ...allocation, amount: '' });
      await loadRows();
      await loadStatement();
      alert('Advance applied to the invoice.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not allocate the advance');
    }
  };

  const openInvoices = (statement?.invoices || []).filter((invoice) => invoice.issuedSnapshot && !['draft', 'cancelled', 'paid'].includes(invoice.status) && invoice.balanceDue > 0 && invoice.clientId);
  const openAdvances = (statement?.advances || []).filter((row) => !row.reversedBy && row.unallocated > 0);

  return (
    <FinancePage title="Money to receive">
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left"><th className="py-2">Client</th><th>Outstanding</th><th>Overdue</th><th>Advance</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.clientId || row.partyName} className="border-b">
                <td className="py-3">{row.partyName}</td>
                <td>{formatMoneyMap(row.outstanding)}</td>
                <td>{formatMoneyMap(row.overdue)}</td>
                <td>{formatMoneyMap(row.advance)}</td>
                <td>{row.clientId && <button type="button" className="text-cravora-purple" onClick={() => openClient(row.clientId)}>Statement</button>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="py-3" colSpan={5}>No clients owe us right now. An accepted quotation can be turned into an invoice.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={recordAdvance} className="bg-white rounded-2xl shadow-lg p-6 space-y-3">
          <h2 className="font-semibold text-gray-800">Record an advance</h2>
          <p className="text-xs text-gray-500">This records money received before it is applied to an invoice.</p>
          <select required value={advance.clientId} onChange={(e) => setAdvance({ ...advance, clientId: e.target.value })} className="w-full border rounded-lg px-3 py-2">
            <option value="">Client</option>
            {clients.map((client) => <option key={client._id} value={client._id}>{client.companyName}</option>)}
          </select>
          <select required value={advance.accountId} onChange={(e) => {
            const account = accounts.find((item) => item._id === e.target.value);
            setAdvance({ ...advance, accountId: e.target.value, currency: account?.currency || 'INR' });
          }} className="w-full border rounded-lg px-3 py-2">
            <option value="">Cash or bank account</option>
            {accounts.filter((account) => account.isActive !== false).map((account) => (
              <option key={account._id} value={account._id}>{account.name} · {account.currency}</option>
            ))}
          </select>
          <input required type="number" min="0.01" step="0.01" value={advance.amount} onChange={(e) => setAdvance({ ...advance, amount: e.target.value })} placeholder="Amount" className="w-full border rounded-lg px-3 py-2" />
          <input type="date" value={advance.paymentDate} onChange={(e) => setAdvance({ ...advance, paymentDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
          <select value={advance.paymentMethod} onChange={(e) => setAdvance({ ...advance, paymentMethod: e.target.value })} className="w-full border rounded-lg px-3 py-2">
            {METHODS.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}
          </select>
          <input value={advance.reference} onChange={(e) => setAdvance({ ...advance, reference: e.target.value })} placeholder="Reference" className="w-full border rounded-lg px-3 py-2" />
          <button disabled={!canPost} className="bg-cravora-purple text-white px-4 py-2 rounded-lg disabled:opacity-50" type="submit">Record advance</button>
        </form>

        <form onSubmit={allocate} className="bg-white rounded-2xl shadow-lg p-6 space-y-3">
          <h2 className="font-semibold text-gray-800">Apply advance to invoice</h2>
          <p className="text-xs text-gray-500">Cash is not received again. This only applies money already recorded as an advance.</p>
          <select required value={allocation.advanceId} onChange={(e) => setAllocation({ ...allocation, advanceId: e.target.value })} className="w-full border rounded-lg px-3 py-2">
            <option value="">Unallocated advance</option>
            {openAdvances.map((row) => (
              <option key={row._id} value={row._id}>Available {row.unallocated} {row.currency || 'INR'}</option>
            ))}
          </select>
          <select required value={allocation.invoiceId} onChange={(e) => setAllocation({ ...allocation, invoiceId: e.target.value })} className="w-full border rounded-lg px-3 py-2">
            <option value="">Issued invoice</option>
            {openInvoices.map((invoice) => (
              <option key={invoice.invoiceNumber} value={invoice.invoiceNumber}>{invoice.invoiceNumber} · balance {invoice.balanceDue}</option>
            ))}
          </select>
          <input required type="number" min="0.01" step="0.01" value={allocation.amount} onChange={(e) => setAllocation({ ...allocation, amount: e.target.value })} placeholder="Amount" className="w-full border rounded-lg px-3 py-2" />
          <button disabled={!canPost} className="bg-cravora-purple text-white px-4 py-2 rounded-lg disabled:opacity-50" type="submit">Apply advance</button>
          <p className="text-xs text-gray-500">An advance can be applied only to invoices for the same client. Invoices that are not linked to a client stay on the Payments page.</p>
        </form>
      </div>

      {statement && (
        <div className="bg-white rounded-2xl shadow-lg p-6 mt-6">
          <h2 className="font-semibold text-gray-800 mb-2">Statement</h2>
          <p className="text-sm text-gray-600 mb-4">Outstanding {formatMoneyMap(statement.outstanding)} · Overdue {formatMoneyMap(statement.overdue)} · Advance {formatMoneyMap(statement.advance)}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left"><th className="py-2">Date</th><th>Kind</th><th>Reference</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {statement.history.map((row, index) => (
                  <tr key={`${row.kind}-${row.reference}-${index}`} className="border-b">
                    <td className="py-3">{row.date ? new Date(row.date).toLocaleDateString() : ''}</td>
                    <td>{row.kind.replace(/_/g, ' ')}</td>
                    <td>{row.reference}</td>
                    <td>{formatCurrency(row.amount, row.currency || 'INR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </FinancePage>
  );
}
