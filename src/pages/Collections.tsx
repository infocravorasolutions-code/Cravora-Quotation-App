import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FinancePage } from '../components/FinanceNav';
import { apiJson, asItems } from '../utils/api';
import { formatCurrency } from '../utils/currency';
import { invoiceStatusLabel } from '../utils/labels';

interface CollectionInvoice {
  invoiceNumber: string;
  status: string;
  currency?: 'INR' | 'USD';
  grandTotal?: number;
  amountPaid?: number;
  balanceDue?: number;
  dueDate?: string;
  issueDate?: string;
  lastFollowUpAt?: string;
  nextFollowUpAt?: string;
  collectionNotes?: string;
  clientSnapshot?: { clientName?: string; clientEmail?: string; currency?: 'INR' | 'USD' };
}

type Filter = 'outstanding' | 'overdue' | 'due_soon' | 'partial' | 'paid' | 'all';

function currencyOf(invoice: CollectionInvoice): 'INR' | 'USD' {
  return invoice.currency || invoice.clientSnapshot?.currency || 'INR';
}

export default function Collections() {
  const [invoices, setInvoices] = useState<CollectionInvoice[]>([]);
  const [filter, setFilter] = useState<Filter>('outstanding');
  const [currency, setCurrency] = useState('');
  const [client, setClient] = useState('');
  const [error, setError] = useState('');
  const [active, setActive] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    apiJson('/api/invoices?limit=200')
      .then((data) => setInvoices(asItems<CollectionInvoice>(data).filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'cancelled')))
      .catch((err: Error) => setError(err.message));
  }, []);

  const now = Date.now();
  const soon = now + 14 * 24 * 60 * 60 * 1000;
  const rows = invoices.filter((invoice) => {
    if (currency && currencyOf(invoice) !== currency) return false;
    if (client && !(invoice.clientSnapshot?.clientName || '').toLowerCase().includes(client.toLowerCase())) return false;
    if (filter === 'outstanding') return invoice.status !== 'paid' && (invoice.balanceDue || 0) > 0;
    if (filter === 'overdue') return invoice.status === 'overdue';
    if (filter === 'due_soon') {
      if (!invoice.dueDate || invoice.status === 'paid') return false;
      const due = new Date(invoice.dueDate).getTime();
      return due >= now && due <= soon;
    }
    if (filter === 'partial') return invoice.status === 'partially_paid';
    if (filter === 'paid') return invoice.status === 'paid';
    return true;
  });

  const totals = rows.reduce<Record<string, number>>((sum, invoice) => {
    const key = currencyOf(invoice);
    sum[key] = (sum[key] || 0) + (filter === 'paid' ? (invoice.amountPaid || 0) : (invoice.balanceDue || 0));
    return sum;
  }, {});

  const saveFollowUp = async (event: FormEvent) => {
    event.preventDefault();
    if (!active) return;
    setError('');
    try {
      const saved = await apiJson(`/api/invoices/${active}/follow-up`, {
        method: 'POST',
        body: JSON.stringify({ nextFollowUpAt: nextDate || undefined, collectionNotes: notes }),
      });
      setInvoices((current) => current.map((invoice) => (
        invoice.invoiceNumber === active ? { ...invoice, ...(saved as CollectionInvoice) } : invoice
      )));
      setActive('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the follow-up');
    }
  };

  return (
    <FinancePage title="Income & collections">
      {error && <p className="mb-4 text-red-600">{error}</p>}
      <p className="mb-4 text-sm text-gray-600">Issued invoices only. An advance counts here after it is applied to an invoice.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {([
          ['outstanding', 'Outstanding'],
          ['overdue', 'Overdue'],
          ['due_soon', 'Due soon'],
          ['partial', 'Part-paid'],
          ['paid', 'Fully paid'],
          ['all', 'All'],
        ] as Array<[Filter, string]>).map(([value, label]) => (
          <button key={value} type="button" className={`rounded-lg px-3 py-2 text-sm ${filter === value ? 'bg-cravora-purple text-white' : 'bg-white shadow'}`} onClick={() => setFilter(value)}>{label}</button>
        ))}
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
          <option value="">INR and USD</option>
          <option value="INR">INR</option>
          <option value="USD">USD</option>
        </select>
        <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Client" className="rounded-lg border px-3 py-2 text-sm" />
      </div>
      <p className="mb-4 text-sm text-gray-700">
        {Object.entries(totals).map(([key, value]) => `${key} ${formatCurrency(value, key as 'INR' | 'USD')}`).join(' · ') || 'Nothing in this view.'}
      </p>
      <div className="overflow-x-auto rounded-2xl bg-white p-4 shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Client</th><th>Invoice</th><th>Due</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Status</th><th>Next follow-up</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((invoice) => (
              <tr key={invoice.invoiceNumber} className="border-b">
                <td className="py-3">{invoice.clientSnapshot?.clientName || '—'}</td>
                <td><Link className="text-cravora-purple" to={`/invoices/${invoice.invoiceNumber}`}>{invoice.invoiceNumber}</Link></td>
                <td>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'}</td>
                <td>{formatCurrency(invoice.grandTotal || 0, currencyOf(invoice))}</td>
                <td>{formatCurrency(invoice.amountPaid || 0, currencyOf(invoice))}</td>
                <td>{formatCurrency(invoice.balanceDue || 0, currencyOf(invoice))}</td>
                <td>{invoiceStatusLabel(invoice.status)}</td>
                <td>{invoice.nextFollowUpAt ? new Date(invoice.nextFollowUpAt).toLocaleDateString() : '—'}</td>
                <td className="space-x-2">
                  <button type="button" className="text-cravora-purple" onClick={() => { setActive(invoice.invoiceNumber); setNotes(invoice.collectionNotes || ''); setNextDate(invoice.nextFollowUpAt ? String(invoice.nextFollowUpAt).slice(0, 10) : ''); }}>Follow up</button>
                  {invoice.clientSnapshot?.clientEmail && (
                    <a className="text-gray-700" href={`mailto:${invoice.clientSnapshot.clientEmail}?subject=${encodeURIComponent(`Payment reminder ${invoice.invoiceNumber}`)}&body=${encodeURIComponent(`The remaining balance on ${invoice.invoiceNumber} is ${formatCurrency(invoice.balanceDue || 0, currencyOf(invoice))}.`)}`}>Reminder</a>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="py-3" colSpan={9}>No invoices in this view. Create one from a finished bill or an accepted quotation.</td></tr>}
          </tbody>
        </table>
      </div>
      {active && (
        <form onSubmit={saveFollowUp} className="mt-6 space-y-3 rounded-2xl bg-white p-6 shadow">
          <h2 className="font-semibold">Follow up {active}</h2>
          <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className="rounded-lg border px-3 py-2" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="w-full rounded-lg border px-3 py-2" />
          <button className="rounded-lg bg-cravora-purple px-4 py-2 text-white" type="submit">Save follow-up</button>
        </form>
      )}
    </FinancePage>
  );
}
