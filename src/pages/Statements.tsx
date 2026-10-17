import { FormEvent, useEffect, useState } from 'react';
import { FinancePage } from '../components/FinanceNav';
import { useFinanceRole } from '../hooks/useFinanceRole';
import { apiJson, asItems } from '../utils/api';
import { formatCurrency } from '../utils/currency';

interface Account { _id: string; name: string; currency: 'INR' | 'USD'; isActive?: boolean }
interface Batch {
  _id: string;
  accountId?: string;
  fileName?: string;
  openingBalance?: number;
  closingBalance?: number;
  difference?: number;
  currency?: 'INR' | 'USD';
  duplicate?: boolean;
}
interface Line {
  _id: string;
  postedAt: string;
  description: string;
  reference: string;
  direction: 'in' | 'out';
  amount: number;
  runningBalance?: number;
  status: string;
  classification?: string;
}

const CLASSIFICATIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'owner', label: 'Owner money' },
  { value: 'tax', label: 'Tax payment' },
  { value: 'other', label: 'Other' },
];

export default function Statements() {
  const { canPost } = useFinanceRole();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [fileName, setFileName] = useState('');
  const [contentType, setContentType] = useState('');
  const [text, setText] = useState('');
  const [fileBase64, setFileBase64] = useState('');
  const [batch, setBatch] = useState<Batch | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [choices, setChoices] = useState<Record<string, { action: string; classification: string; counterAccountId: string; notes: string }>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    apiJson('/api/finance/accounts')
      .then((data) => setAccounts(asItems<Account>(data)))
      .catch((err: Error) => setError(err.message));
  }, []);

  const selectedAccount = accounts.find((account) => account._id === accountId);
  const currency: 'INR' | 'USD' = batch?.currency || selectedAccount?.currency || 'INR';

  const onFile = (file?: File) => {
    setError('');
    setBatch(null);
    setLines([]);
    if (!file) return;
    const name = file.name.toLowerCase();
    setFileName(file.name);
    setContentType(file.type);
    const reader = new FileReader();
    if (name.endsWith('.pdf') || file.type.includes('pdf') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
      reader.onload = () => {
        const value = String(reader.result || '');
        setFileBase64(value.split(',')[1] || '');
        setText('');
      };
      reader.readAsDataURL(file);
      return;
    }
    reader.onload = () => {
      setText(String(reader.result || ''));
      setFileBase64('');
    };
    reader.readAsText(file);
  };

  const preview = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const result = await apiJson('/api/finance/statements', {
        method: 'POST',
        body: JSON.stringify({
          accountId,
          periodFrom,
          periodTo,
          openingBalance: openingBalance === '' ? undefined : Number(openingBalance),
          closingBalance: closingBalance === '' ? undefined : Number(closingBalance),
          fileName,
          contentType,
          text,
          fileBase64,
        }),
      });
      const payload = result as { batch?: Batch; lines?: Line[]; duplicate?: boolean };
      const nextBatch = payload.batch;
      if (!nextBatch) throw new Error('Could not read the statement');
      const nextLines = payload.lines || [];
      setBatch({ ...nextBatch, duplicate: Boolean(payload.duplicate) });
      if (nextBatch.accountId) setAccountId(String(nextBatch.accountId));
      setLines(nextLines);
      const nextChoices: typeof choices = {};
      nextLines.forEach((line) => {
        nextChoices[line._id] = {
          action: line.status === 'matched' ? 'link' : 'review',
          classification: '',
          counterAccountId: '',
          notes: '',
        };
      });
      setChoices(nextChoices);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the statement');
    }
  };

  const confirm = async () => {
    if (!batch) return;
    setError('');
    const decisions = lines
      .filter((line) => line.status !== 'confirmed')
      .map((line) => ({ lineId: line._id, ...choices[line._id] }))
      .filter((decision) => decision.action === 'link' || decision.action === 'post');
    if (!decisions.length) {
      setError('Choose the lines to link or post. Nothing is saved until you confirm.');
      return;
    }
    try {
      await apiJson(`/api/finance/statements/${batch._id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ decisions }),
      });
      const refreshed = await apiJson(`/api/finance/statements/${batch._id}`) as { lines?: Line[] };
      setLines(refreshed.lines || []);
      alert('Confirmed lines were posted once. Matched lines were only linked.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm the statement');
    }
  };

  return (
    <FinancePage title="Statements">
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <form onSubmit={preview} className="bg-white rounded-2xl shadow-lg p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <p className="text-sm text-gray-600 sm:col-span-2">Upload a bank statement as PDF, CSV, or Excel. PDF must be a text PDF from the bank, not a scanned photo. Nothing is posted until you confirm a line. A bank debit is not an expense until you say so, and a credit is not client income until you say so.</p>
        <select required value={accountId} onChange={(e) => setAccountId(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="">Cash or bank account</option>
          {accounts.filter((account) => account.isActive !== false).map((account) => (
            <option key={account._id} value={account._id}>{account.name} · {account.currency}</option>
          ))}
        </select>
        {selectedAccount?.currency === 'USD' && (
          <p className="text-sm text-amber-700 sm:col-span-2">This account is USD, so amounts show with $. For a Kotak / Indian bank statement, choose the INR bank account.</p>
        )}
        <input type="file" accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
        <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="border rounded-lg px-3 py-2" />
        <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="border rounded-lg px-3 py-2" />
        <input type="number" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="Opening balance, if the file has one" className="border rounded-lg px-3 py-2" />
        <input type="number" step="0.01" value={closingBalance} onChange={(e) => setClosingBalance(e.target.value)} placeholder="Closing balance, if the file has one" className="border rounded-lg px-3 py-2" />
        <button disabled={!canPost} className="bg-cravora-purple text-white px-4 py-2 rounded-lg sm:col-span-2 disabled:opacity-50" type="submit">Preview statement</button>
      </form>

      {batch && (
        <section className="bg-white rounded-2xl shadow-lg p-6 mt-6">
          <h2 className="font-semibold text-gray-800">{batch.fileName || 'Statement'}</h2>
          {batch.duplicate && <p className="text-sm text-amber-700 mt-2">This file was already imported. The original batch is shown, and nothing was posted again.</p>}
          {(batch.openingBalance != null || batch.closingBalance != null) && (
            <p className="text-sm text-gray-600 mt-2">
              Opening {batch.openingBalance ?? '—'} · Closing {batch.closingBalance ?? '—'}
              {batch.difference != null ? ` · Difference ${formatCurrency(batch.difference, batch.currency || currency)}` : ''}
            </p>
          )}
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Date</th><th>Description</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Status</th><th>Confirm</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const choice = choices[line._id] || { action: 'review', classification: '', counterAccountId: '', notes: '' };
                  return (
                    <tr key={line._id} className="border-b align-top">
                      <td className="py-3">{new Date(line.postedAt).toLocaleDateString()}</td>
                      <td>{line.description}</td>
                      <td>{line.reference}</td>
                      <td>{line.direction === 'out' ? formatCurrency(line.amount, currency) : ''}</td>
                      <td>{line.direction === 'in' ? formatCurrency(line.amount, currency) : ''}</td>
                      <td>{line.runningBalance == null ? '' : formatCurrency(line.runningBalance, currency)}</td>
                      <td>{line.status.replace(/_/g, ' ')}</td>
                      <td>
                        {line.status === 'confirmed' ? 'Confirmed' : (
                          <div className="grid gap-1 min-w-40">
                            <select value={choice.action} onChange={(e) => setChoices({ ...choices, [line._id]: { ...choice, action: e.target.value } })} className="border rounded px-2 py-1">
                              <option value="review">Leave for review</option>
                              <option value="link">Link existing</option>
                              <option value="post">Post new line</option>
                            </select>
                            {choice.action === 'post' && (
                              <select value={choice.classification} onChange={(e) => setChoices({ ...choices, [line._id]: { ...choice, classification: e.target.value } })} className="border rounded px-2 py-1">
                                <option value="">What is this line?</option>
                                {CLASSIFICATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                              </select>
                            )}
                            {choice.action === 'post' && choice.classification === 'transfer' && (
                              <select value={choice.counterAccountId} onChange={(e) => setChoices({ ...choices, [line._id]: { ...choice, counterAccountId: e.target.value } })} className="border rounded px-2 py-1">
                                <option value="">Other account</option>
                                {accounts.filter((account) => account._id !== accountId && account.isActive !== false).map((account) => (
                                  <option key={account._id} value={account._id}>{account.name}</option>
                                ))}
                              </select>
                            )}
                            {choice.action === 'post' && choice.classification === 'other' && (
                              <input value={choice.notes} onChange={(e) => setChoices({ ...choices, [line._id]: { ...choice, notes: e.target.value } })} placeholder="Reason" className="border rounded px-2 py-1" />
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" disabled={!canPost} onClick={confirm} className="mt-4 bg-gray-800 text-white px-4 py-2 rounded-lg disabled:opacity-50">Confirm selected lines</button>
        </section>
      )}
    </FinancePage>
  );
}
