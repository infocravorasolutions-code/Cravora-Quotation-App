import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Download, Mail, Search, Send, XCircle, FileText, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import PdfDocument from '../components/PdfDocument';
import SectionNav from '../components/SectionNav';
import WhatsAppModal from '../components/WhatsAppModal';
import { generatePDF } from '../utils/pdfGenerator';
import { apiJson, asBody, asItems, blobToBase64 } from '../utils/api';
import { formatCurrency } from '../utils/currency';
import { invoiceLinks, invoiceStatusLabel } from '../utils/labels';

interface InvoiceGst {
  gstType?: 'intra' | 'inter';
  cgstRate?: number;
  sgstRate?: number;
  igstRate?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalGstAmount?: number;
}

interface InvoiceClient {
  clientName?: string;
  clientEmail?: string;
  currency?: 'INR' | 'USD';
  clientAddress?: string;
  clientGstNumber?: string;
}

interface InvoiceItem {
  id: string;
  name: string;
  description?: string;
  hours: number;
  rate: number;
  total: number;
}

interface InvoiceRecord {
  invoiceNumber: string;
  quotationId?: string;
  clientId?: string;
  status: string;
  currency?: 'INR' | 'USD';
  grandTotal?: number;
  balanceDue?: number;
  amountPaid?: number;
  dueDate?: string;
  issuedSnapshot?: InvoiceRecord;
  clientSnapshot?: InvoiceClient;
  items?: InvoiceItem[];
  tax?: number;
  discountRate?: number;
  subtotal?: number;
  taxAmount?: number;
  discountAmount?: number;
  terms?: string[];
  issueDate?: string;
  notes?: string;
  gstDetails?: InvoiceGst;
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<(InvoiceRecord & { source: InvoiceRecord }) | null>(null);
  const [whatsappInvoice, setWhatsappInvoice] = useState<InvoiceRecord | null>(null);
  const [whatsappPdfBase64, setWhatsappPdfBase64] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [isGeneratingWhatsApp, setIsGeneratingWhatsApp] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRecord | null>(null);
  const [editForm, setEditForm] = useState({ dueDate: '', notes: '', discountRate: 0, terms: '' });

  const load = async () => {
    const data = await apiJson(`/api/invoices?limit=50&q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}`);
    setInvoices(asItems<InvoiceRecord>(data));
  };

  useEffect(() => {
    apiJson('/api/invoices?limit=50')
      .then((data) => setInvoices(asItems<InvoiceRecord>(data)))
      .catch((err: Error) => setError(err.message));
  }, []);

  const renderPdf = async (invoice: InvoiceRecord, download: boolean) => {
    const source = invoice.issuedSnapshot || invoice;
    setPreview({ ...invoice, source });
    await new Promise((resolve) => setTimeout(resolve, 400));
    return generatePDF('invoice-pdf', `${invoice.invoiceNumber}.pdf`, { download });
  };

  const issue = async (invoiceNumber: string) => {
    try {
      await apiJson(`/api/invoices/${invoiceNumber}/issue`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not issue invoice');
    }
  };

  const startEdit = (inv: InvoiceRecord) => {
    setEditingInvoice(inv);
    setEditForm({
      dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().slice(0, 10) : '',
      notes: inv.notes || '',
      discountRate: inv.discountRate || 0,
      terms: (inv.terms || []).join('\n'),
    });
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoice) return;
    setError('');
    try {
      await apiJson(`/api/invoices/${editingInvoice.invoiceNumber}`, {
        method: 'PUT',
        body: JSON.stringify({
          dueDate: editForm.dueDate || undefined,
          notes: editForm.notes,
          discountRate: Number(editForm.discountRate) || 0,
          terms: editForm.terms.split('\n').map((t) => t.trim()).filter(Boolean),
        }),
      });
      setEditingInvoice(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save invoice');
    }
  };

  const deleteInvoice = async (invoiceNumber: string) => {
    if (!confirm(`Are you sure you want to delete invoice ${invoiceNumber}? This action cannot be undone.`)) return;
    try {
      await apiJson(`/api/invoices/${invoiceNumber}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete invoice');
    }
  };

  const email = async (invoice: InvoiceRecord) => {
    setError('');
    try {
      const current = invoice.issuedSnapshot ? invoice : asBody<InvoiceRecord>(await apiJson(`/api/invoices/${invoice.invoiceNumber}/issue`, { method: 'POST' }));
      let suggested = String(current.clientSnapshot?.clientEmail || '').trim();
      if (current.clientId) {
        try {
          const client = await apiJson(`/api/clients/${current.clientId}`);
          if (client.email) suggested = String(client.email).trim();
        } catch {
          // keep snapshot email
        }
      }
      const to = String(window.prompt('Send this invoice to which email?', suggested) || '').trim();
      if (!to) return;
      const blob = await renderPdf(current, false);
      const result = await apiJson(`/api/invoices/${invoice.invoiceNumber}/email`, {
        method: 'POST',
        body: JSON.stringify({
          to,
          pdfBase64: await blobToBase64(blob),
          message: 'Please find your invoice attached.',
        }),
      });
      alert(result.message || `Invoice email sent to ${to}. Check that inbox and spam.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not email invoice');
    } finally {
      setPreview(null);
    }
  };

  const openWhatsApp = async (invoice: InvoiceRecord) => {
    setError('');
    setIsGeneratingWhatsApp(true);
    try {
      const current = invoice.issuedSnapshot
        ? invoice
        : asBody<InvoiceRecord>(await apiJson(`/api/invoices/${invoice.invoiceNumber}/issue`, { method: 'POST' }));
      let suggestedPhone = '';
      if (current.clientId) {
        try {
          const client = await apiJson(`/api/clients/${current.clientId}`);
          if (client.mobile) suggestedPhone = String(client.mobile).trim();
        } catch {
          // ignore
        }
      }
      const source = current.issuedSnapshot || current;
      setPreview({ ...invoice, source });
      await new Promise((resolve) => setTimeout(resolve, 400));
      const blob = await generatePDF('invoice-pdf', `${invoice.invoiceNumber}.pdf`, { download: false });
      const base64 = await blobToBase64(blob);
      setWhatsappPhone(suggestedPhone);
      setWhatsappPdfBase64(base64);
      setWhatsappInvoice(current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare invoice for WhatsApp');
    } finally {
      setIsGeneratingWhatsApp(false);
      setPreview(null);
    }
  };

  const currencyOf = (invoice: InvoiceRecord): 'INR' | 'USD' => invoice.currency || invoice.clientSnapshot?.currency || 'INR';

  const counts = invoices.reduce(
    (summary, invoice) => {
      summary.total += 1;
      if (invoice.status !== 'paid' && invoice.status !== 'cancelled' && invoice.status !== 'draft') summary.unpaid += 1;
      if (invoice.status === 'paid') summary.paid += 1;
      if (invoice.status === 'overdue') summary.overdue += 1;
      return summary;
    },
    { total: 0, unpaid: 0, paid: 0, overdue: 0 },
  );

  const statusLabel: Record<string, string> = {
    draft: 'Draft',
    issued: 'Due',
    partially_paid: 'Part-paid',
    paid: 'Paid',
    overdue: 'Overdue',
    cancelled: 'Cancelled',
  };

  const statusClass: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    issued: 'bg-purple-50 text-cravora-purple',
    partially_paid: 'bg-amber-50 text-amber-700',
    paid: 'bg-emerald-50 text-emerald-700',
    overdue: 'bg-red-50 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="min-h-screen bg-[#f7f5fb] py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionNav links={invoiceLinks} />
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cravora-purple">Billing</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">Invoices & payments</h1>
            <p className="mt-1 text-sm text-gray-500">Invoices created from accepted quotations. Open one to record a payment.</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Invoices', value: String(counts.total) },
            { label: 'Unpaid', value: String(counts.unpaid) },
            { label: 'Paid', value: String(counts.paid) },
            { label: 'Overdue', value: String(counts.overdue) },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{card.label}</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') load().catch((err) => setError(err.message)); }}
                placeholder="Search invoice or quotation number"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-cravora-purple focus:bg-white"
              />
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700"
            >
              <option value="">All statuses</option>
              {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button
              className="rounded-lg bg-cravora-purple px-4 py-2.5 text-sm font-medium text-white hover:bg-cravora-purple-dark"
              onClick={() => load().catch((err) => setError(err.message))}
            >
              Apply
            </button>
          </div>
          {error && <p className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
          {invoices.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-purple-50 text-cravora-purple">
                <FileText className="h-6 w-6" />
              </div>
              <p className="font-medium text-gray-800">No invoices yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">No invoices yet. Create one from an accepted quotation.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3 font-medium">Invoice</th>
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Due</th>
                    <th className="px-4 py-3 font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Received</th>
                    <th className="px-4 py-3 font-medium">Remaining</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Next</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.invoiceNumber} className="border-b border-gray-100 last:border-0 hover:bg-purple-50/40">
                      <td className="px-4 py-3.5 font-mono text-xs font-medium text-gray-900">
                        <Link to={`/invoices/${invoice.invoiceNumber}`} className="text-cravora-purple">{invoice.invoiceNumber}</Link>
                      </td>
                      <td className="px-4 py-3.5 text-gray-800">{invoice.clientSnapshot?.clientName || '—'}</td>
                      <td className="px-4 py-3.5 text-gray-600">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3.5 font-medium text-gray-900">{formatCurrency(invoice.grandTotal || 0, currencyOf(invoice))}</td>
                      <td className="px-4 py-3.5 text-gray-700">{formatCurrency(invoice.amountPaid || 0, currencyOf(invoice))}</td>
                      <td className="px-4 py-3.5 text-gray-700">{formatCurrency(invoice.balanceDue || 0, currencyOf(invoice))}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[invoice.status] || statusClass.draft}`}>
                          {invoiceStatusLabel(invoice.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {invoice.status === 'draft' && (
                            <button className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-cravora-purple hover:bg-purple-50" onClick={() => issue(invoice.invoiceNumber)}>
                              <Send className="h-3.5 w-3.5" /> Issue
                            </button>
                          )}
                          {invoice.status !== 'draft' && invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
                            <Link to={`/invoices/${invoice.invoiceNumber}`} className="rounded-lg bg-cravora-purple px-2 py-1.5 text-xs font-medium text-white">Record payment</Link>
                          )}
                          <button className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800" title="Download PDF" onClick={() => renderPdf(invoice, true).finally(() => setPreview(null))}>
                            <Download className="h-4 w-4" />
                          </button>
                          <button className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800" title="Email invoice" onClick={() => email(invoice)}>
                            <Mail className="h-4 w-4" />
                          </button>
                          <button
                            className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
                            title="Send via WhatsApp"
                            disabled={isGeneratingWhatsApp}
                            onClick={() => openWhatsApp(invoice)}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </button>
                          <button
                            className="rounded-lg p-2 text-purple-600 hover:bg-purple-50 hover:text-purple-700"
                            title="Edit invoice"
                            onClick={() => startEdit(invoice)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
                            <button
                              className="rounded-lg p-2 text-gray-400 hover:bg-amber-50 hover:text-amber-600"
                              title="Cancel invoice"
                              onClick={() => apiJson(`/api/invoices/${invoice.invoiceNumber}/cancel`, { method: 'POST' }).then(load).catch((err) => setError(err.message))}
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            className="rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700"
                            title="Delete invoice"
                            onClick={() => deleteInvoice(invoice.invoiceNumber)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {preview && createPortal(
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <PdfDocument
            id="invoice-pdf"
            documentType="Invoice"
            clientInfo={preview.source.clientSnapshot || preview.clientSnapshot}
            modules={preview.source.items || preview.items || []}
            quotationId={preview.invoiceNumber}
            tax={preview.source.tax || 0}
            discountRate={preview.source.discountRate || 0}
            subtotal={preview.source.subtotal || 0}
            taxAmount={preview.source.taxAmount || 0}
            discountAmount={preview.source.discountAmount || 0}
            grandTotal={preview.source.grandTotal || 0}
            termsAndConditions={preview.source.terms || []}
            issuedAt={preview.source.issueDate}
            dueDate={preview.source.dueDate || preview.dueDate}
            notes={preview.source.notes}
            gstDetails={preview.source.gstDetails}
            amountPaid={preview.amountPaid || 0}
            balanceDue={preview.balanceDue || 0}
          />
        </div>,
        document.body
      )}
      {whatsappInvoice && (
        <WhatsAppModal
          isOpen={Boolean(whatsappInvoice)}
          onClose={() => setWhatsappInvoice(null)}
          quotationId={whatsappInvoice.invoiceNumber}
          documentType="Invoice"
          initialPhone={whatsappPhone}
          clientName={whatsappInvoice.clientSnapshot?.clientName}
          grandTotal={whatsappInvoice.grandTotal}
          currency={currencyOf(whatsappInvoice)}
          isDraft={whatsappInvoice.status === 'draft'}
          pdfBase64={whatsappPdfBase64}
          filename={`${whatsappInvoice.invoiceNumber}.pdf`}
          onSuccess={(notice) => alert(notice)}
        />
      )}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-gray-800">Edit Invoice {editingInvoice.invoiceNumber}</h3>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 text-lg font-bold p-1"
                onClick={() => setEditingInvoice(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={saveEdit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Discount Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={editForm.discountRate}
                  onChange={(e) => setEditForm({ ...editForm, discountRate: Number(e.target.value) })}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Notes for client"
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Terms & Conditions (one per line)
                </label>
                <textarea
                  rows={3}
                  value={editForm.terms}
                  onChange={(e) => setEditForm({ ...editForm, terms: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm font-mono text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  onClick={() => setEditingInvoice(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-cravora-purple px-4 py-2 text-sm font-semibold text-white hover:bg-cravora-purple-dark"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
