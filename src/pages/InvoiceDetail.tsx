import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import PdfDocument from '../components/PdfDocument';
import ReceiptDocument from '../components/ReceiptDocument';
import SectionNav from '../components/SectionNav';
import WhatsAppModal from '../components/WhatsAppModal';
import { generatePDF } from '../utils/pdfGenerator';
import { apiJson, asBody, asItems, blobToBase64, newRequestKey } from '../utils/api';
import { formatCurrency } from '../utils/currency';
import { invoiceLinks, invoiceStatusLabel } from '../utils/labels';

const METHODS = ['cash', 'bank_transfer', 'upi', 'cheque', 'card', 'other'];

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
  issueDate?: string;
  issuedSnapshot?: InvoiceRecord;
  clientSnapshot?: { clientName?: string; clientEmail?: string; currency?: 'INR' | 'USD' };
  items?: Array<{ id: string; name: string; description?: string; hours: number; rate: number; total: number }>;
  tax?: number;
  discountRate?: number;
  subtotal?: number;
  taxAmount?: number;
  discountAmount?: number;
  terms?: string[];
  notes?: string;
  gstDetails?: { gstType?: 'intra' | 'inter'; cgstRate?: number; sgstRate?: number; igstRate?: number; cgstAmount?: number; sgstAmount?: number; igstAmount?: number; totalGstAmount?: number };
}

interface PaymentRow {
  _id: string;
  paymentDate?: string;
  paymentMethod: string;
  amount: number;
  status: string;
  transactionReference?: string;
}

interface ReceiptRow {
  receiptNumber: string;
  paymentId?: string;
  invoiceId?: string;
  amount?: number;
  currency?: 'INR' | 'USD';
  balanceDue?: number;
  paymentDate?: string;
  paymentMethod?: string;
  transactionReference?: string;
  invoiceNumber?: string;
  invoiceTotal?: number;
  amountPaid?: number;
  clientSnapshot?: { clientName?: string; clientEmail?: string; currency?: 'INR' | 'USD' };
  issuedSnapshot?: ReceiptRow;
}

interface CashAccount {
  _id: string;
  name: string;
  currency: 'INR' | 'USD';
  isActive?: boolean;
}

export default function InvoiceDetail() {
  const { invoiceNumber = '' } = useParams();
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [form, setForm] = useState({ amount: '', paymentDate: '', paymentMethod: 'bank_transfer', accountId: '', transactionReference: '', notes: '' });
  const [requestKey, setRequestKey] = useState(newRequestKey);
  const [pendingPaymentId, setPendingPaymentId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<InvoiceRecord | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<ReceiptRow | null>(null);
  const [whatsappPdfBase64, setWhatsappPdfBase64] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsappReceipt, setWhatsappReceipt] = useState<ReceiptRow | null>(null);
  const [whatsappReceiptPdfBase64, setWhatsappReceiptPdfBase64] = useState('');
  const [whatsappReceiptPhone, setWhatsappReceiptPhone] = useState('');
  const [isGeneratingWhatsApp, setIsGeneratingWhatsApp] = useState(false);
  const [editingInvoiceOpen, setEditingInvoiceOpen] = useState(false);
  const [invoiceEditForm, setInvoiceEditForm] = useState({ dueDate: '', notes: '', discountRate: 0, terms: '' });
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);
  const [paymentEditForm, setPaymentEditForm] = useState({ amount: '', paymentDate: '', paymentMethod: 'bank_transfer', transactionReference: '', notes: '' });

  const load = async () => {
    const [invoiceData, paymentData, receiptData, accountData] = await Promise.all([
      apiJson(`/api/invoices/${invoiceNumber}`),
      apiJson(`/api/payments?invoiceId=${encodeURIComponent(invoiceNumber)}&limit=50`),
      apiJson(`/api/receipts?invoiceId=${encodeURIComponent(invoiceNumber)}&limit=50`),
      apiJson('/api/finance/accounts').catch(() => ({ items: [] })),
    ]);
    const next = asBody<InvoiceRecord>(invoiceData);
    setInvoice(next);
    setPayments(asItems<PaymentRow>(paymentData));
    setReceipts(asItems<ReceiptRow>(receiptData));
    setAccounts(asItems<CashAccount>(accountData));
    setForm((current) => ({ ...current, amount: current.amount || String(next.balanceDue || '') }));
  };

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
    // Reload when the invoice number in the route changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceNumber]);

  const currency = invoice?.currency || invoice?.clientSnapshot?.currency || 'INR';
  const canPay = invoice && invoice.issuedSnapshot && !['draft', 'paid', 'cancelled'].includes(invoice.status);

  const emailReceipt = async (receipt: ReceiptRow) => {
    setError('');
    setMessage('');
    let suggested = String(receipt.clientSnapshot?.clientEmail || '').trim();
    if (invoice?.clientId) {
      try {
        const client = await apiJson(`/api/clients/${invoice.clientId}`);
        if (client.email) suggested = String(client.email).trim();
      } catch {
        // keep snapshot email
      }
    }
    const to = String(window.prompt('Send this receipt to which email?', suggested) || '').trim();
    if (!to) return;
    setReceiptPreview(receipt);
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      const blob = await generatePDF('receipt-pdf', `${receipt.receiptNumber}.pdf`, { download: false });
      const result = await apiJson(`/api/receipts/${receipt.receiptNumber}/email`, {
        method: 'POST',
        body: JSON.stringify({
          to,
          pdfBase64: await blobToBase64(blob),
          message: 'Please find your payment receipt attached.',
        }),
      });
      setMessage(result.message || `Receipt email sent to ${to}.`);
    } finally {
      setReceiptPreview(null);
    }
  };

  const handleWhatsAppReceipt = async (receipt: ReceiptRow) => {
    setError('');
    setMessage('');
    setIsGeneratingWhatsApp(true);
    try {
      let suggestedPhone = '';
      if (invoice?.clientId) {
        try {
          const client = await apiJson(`/api/clients/${invoice.clientId}`);
          if (client.mobile) suggestedPhone = String(client.mobile).trim();
        } catch {
          // keep snapshot phone
        }
      }
      setReceiptPreview(receipt);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const blob = await generatePDF('receipt-pdf', `${receipt.receiptNumber}.pdf`, { download: false });
      const base64 = await blobToBase64(blob);
      setWhatsappReceipt(receipt);
      setWhatsappReceiptPhone(suggestedPhone);
      setWhatsappReceiptPdfBase64(base64);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare receipt for WhatsApp');
    } finally {
      setIsGeneratingWhatsApp(false);
      setReceiptPreview(null);
    }
  };

  const startEditInvoice = () => {
    if (!invoice) return;
    setInvoiceEditForm({
      dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : '',
      notes: invoice.notes || '',
      discountRate: invoice.discountRate || 0,
      terms: (invoice.terms || []).join('\n'),
    });
    setEditingInvoiceOpen(true);
  };

  const saveInvoiceEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!invoice) return;
    setError('');
    try {
      await apiJson(`/api/invoices/${invoice.invoiceNumber}`, {
        method: 'PUT',
        body: JSON.stringify({
          dueDate: invoiceEditForm.dueDate || undefined,
          notes: invoiceEditForm.notes,
          discountRate: Number(invoiceEditForm.discountRate) || 0,
          terms: invoiceEditForm.terms.split('\n').map((t) => t.trim()).filter(Boolean),
        }),
      });
      setEditingInvoiceOpen(false);
      setMessage('Invoice updated successfully.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save invoice');
    }
  };

  const deleteThisInvoice = async () => {
    if (!invoice) return;
    if (!confirm(`Are you sure you want to delete invoice ${invoice.invoiceNumber}? This action cannot be undone.`)) return;
    try {
      await apiJson(`/api/invoices/${invoice.invoiceNumber}`, { method: 'DELETE' });
      window.location.assign('/invoices');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete invoice');
    }
  };

  const startEditPayment = (p: PaymentRow) => {
    setEditingPayment(p);
    setPaymentEditForm({
      amount: String(p.amount),
      paymentDate: p.paymentDate ? new Date(p.paymentDate).toISOString().slice(0, 10) : '',
      paymentMethod: p.paymentMethod || 'bank_transfer',
      transactionReference: p.transactionReference || '',
      notes: '',
    });
  };

  const savePaymentEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingPayment) return;
    setError('');
    try {
      await apiJson(`/api/payments/${editingPayment._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          amount: Number(paymentEditForm.amount),
          paymentDate: paymentEditForm.paymentDate || undefined,
          paymentMethod: paymentEditForm.paymentMethod,
          transactionReference: paymentEditForm.transactionReference,
          notes: paymentEditForm.notes,
        }),
      });
      setEditingPayment(null);
      setMessage('Payment updated successfully.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save payment');
    }
  };

  const deletePayment = async (paymentId: string) => {
    if (!confirm('Are you sure you want to delete this payment? The invoice balance will be recalculated and any linked receipt will be removed.')) return;
    try {
      await apiJson(`/api/payments/${paymentId}`, { method: 'DELETE' });
      setMessage('Payment deleted.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete payment');
    }
  };

  const deleteReceipt = async (receiptNumber: string) => {
    if (!confirm(`Are you sure you want to delete receipt ${receiptNumber}?`)) return;
    try {
      await apiJson(`/api/receipts/${receiptNumber}`, { method: 'DELETE' });
      setMessage('Receipt deleted.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete receipt');
    }
  };

  const makeReceipt = async (paymentId: string) => {
    const receipt = await apiJson(`/api/payments/${paymentId}/receipt`, { method: 'POST' });
    setPendingPaymentId('');
    setMessage(`Receipt ${receipt.receiptNumber} is ready. Remaining balance ${formatCurrency(invoice?.balanceDue || 0, currency)}.`);
    await load();
    if (window.confirm(`Receipt ${receipt.receiptNumber} is ready. Send via WhatsApp now?`)) {
      await handleWhatsAppReceipt(receipt as ReceiptRow);
    } else if (window.confirm(`Email receipt ${receipt.receiptNumber} now?`)) {
      await emailReceipt(receipt as ReceiptRow);
    }
  };

  const record = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const result = await apiJson('/api/payments', {
        method: 'POST',
        headers: { 'Idempotency-Key': requestKey },
        body: JSON.stringify({
          invoiceId: invoiceNumber,
          amount: Number(form.amount),
          paymentDate: form.paymentDate || undefined,
          paymentMethod: form.paymentMethod,
          accountId: form.accountId || undefined,
          transactionReference: form.transactionReference,
          notes: form.notes,
        }),
      });
      setRequestKey(newRequestKey());
      const paymentId = result.payment?._id;
      const remaining = (result as { invoice?: { balanceDue?: number } }).invoice?.balanceDue;
      setMessage(`Payment recorded. Remaining ${formatCurrency(remaining ?? 0, currency)}.`);
      if (paymentId) {
        try {
          await makeReceipt(paymentId);
        } catch (err) {
          setPendingPaymentId(paymentId);
          setError(err instanceof Error ? `${err.message} The payment is saved. Retry the receipt.` : 'The payment is saved. Retry the receipt.');
        }
      }
      setForm({ amount: '', paymentDate: '', paymentMethod: 'bank_transfer', accountId: '', transactionReference: '', notes: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment');
    }
  };

  const download = async () => {
    if (!invoice) return;
    setPreview(invoice.issuedSnapshot || invoice);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await generatePDF('invoice-pdf', `${invoice.invoiceNumber}.pdf`);
    setPreview(null);
  };

  const email = async () => {
    if (!invoice) return;
    setError('');
    setMessage('');
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
      setPreview(current.issuedSnapshot || current);
      await new Promise((resolve) => setTimeout(resolve, 400));
      const blob = await generatePDF('invoice-pdf', `${invoice.invoiceNumber}.pdf`, { download: false });
      const result = await apiJson(`/api/invoices/${invoice.invoiceNumber}/email`, {
        method: 'POST',
        body: JSON.stringify({
          to,
          pdfBase64: await blobToBase64(blob),
          message: 'Please find your invoice attached.',
        }),
      });
      setMessage(result.message || `Invoice email sent to ${to}. Check that inbox and spam.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not email invoice');
    } finally {
      setPreview(null);
    }
  };

  const handleWhatsApp = async () => {
    if (!invoice) return;
    setError('');
    setMessage('');
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
          // keep snapshot phone
        }
      }
      setPreview(current.issuedSnapshot || current);
      await new Promise((resolve) => setTimeout(resolve, 400));
      const blob = await generatePDF('invoice-pdf', `${invoice.invoiceNumber}.pdf`, { download: false });
      const base64 = await blobToBase64(blob);
      setWhatsappPhone(suggestedPhone);
      setWhatsappPdfBase64(base64);
      setShowWhatsAppModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare invoice for WhatsApp');
    } finally {
      setIsGeneratingWhatsApp(false);
      setPreview(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f5fb] py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionNav links={invoiceLinks} />
        <Link to="/invoices" className="text-sm text-cravora-purple">Back to invoices</Link>
        {error && <p className="mt-4 text-red-600">{error}</p>}
        {message && <p className="mt-4 text-emerald-700">{message}</p>}
        {pendingPaymentId && (
          <button type="button" className="mt-3 rounded-lg bg-gray-800 px-4 py-2 text-white" onClick={() => makeReceipt(pendingPaymentId).catch((err: Error) => setError(err.message))}>
            Retry receipt
          </button>
        )}
        {invoice && (
          <>
            <div className="mt-4 rounded-2xl bg-white p-6 shadow">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{invoice.invoiceNumber}</h1>
                  <p className="mt-1 text-gray-600">{invoice.clientSnapshot?.clientName || 'Client'} · Quotation {invoice.quotationId}</p>
                </div>
                <span className="rounded-full bg-purple-50 px-3 py-1 text-sm font-medium text-cravora-purple">{invoiceStatusLabel(invoice.status)}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <p>Issue date<br /><span className="font-medium">{invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString() : '—'}</span></p>
                <p>Due date<br /><span className="font-medium">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'}</span></p>
                <p>Total<br /><span className="font-medium">{formatCurrency(invoice.grandTotal || 0, currency)}</span></p>
                <p>Received<br /><span className="font-medium">{formatCurrency(invoice.amountPaid || 0, currency)}</span></p>
                <p>Remaining<br /><span className="font-medium">{formatCurrency(invoice.balanceDue || 0, currency)}</span></p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50" onClick={() => download().catch((err: Error) => setError(err.message))}>Download PDF</button>
                <button type="button" className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50" onClick={email}>Email invoice</button>
                <button
                  type="button"
                  className="rounded-lg border border-emerald-500 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50"
                  disabled={isGeneratingWhatsApp}
                  onClick={handleWhatsApp}
                >
                  Send via WhatsApp
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-medium text-cravora-purple hover:bg-purple-100 transition"
                  onClick={startEditInvoice}
                >
                  Edit invoice
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition"
                  onClick={deleteThisInvoice}
                >
                  Delete invoice
                </button>
              </div>
            </div>

            {canPay && (
              <form onSubmit={record} className="mt-6 grid grid-cols-1 gap-3 rounded-2xl bg-white p-6 shadow sm:grid-cols-2">
                <h2 className="font-semibold text-gray-800 sm:col-span-2">Record payment</h2>
                <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" className="rounded-lg border px-3 py-2" />
                <input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} className="rounded-lg border px-3 py-2" />
                <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className="rounded-lg border px-3 py-2">
                  {METHODS.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}
                </select>
                <select required value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className="rounded-lg border px-3 py-2">
                  <option value="">Cash or bank account</option>
                  {accounts.filter((account) => account.isActive !== false && account.currency === currency).map((account) => (
                    <option key={account._id} value={account._id}>{account.name}</option>
                  ))}
                </select>
                {accounts.filter((account) => account.isActive !== false && account.currency === currency).length === 0 && (
                  <p className="text-sm text-amber-700 sm:col-span-2">Add a {currency} account in Cash & bank before recording this payment. <Link to="/accounts/register" className="font-medium text-cravora-purple">Open Cash & bank</Link></p>
                )}
                <input value={form.transactionReference} onChange={(e) => setForm({ ...form, transactionReference: e.target.value })} placeholder="Reference" className="rounded-lg border px-3 py-2" />
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" className="rounded-lg border px-3 py-2" />
                <button className="rounded-lg bg-cravora-purple px-4 py-2 text-white sm:col-span-2" type="submit">Record payment</button>
              </form>
            )}

            <div className="mt-6 rounded-2xl bg-white p-6 shadow">
              <h2 className="mb-3 font-semibold text-gray-800">Payment history</h2>
              <ul className="space-y-2 text-sm">
                {payments.map((payment) => {
                  const receipt = receipts.find((item) => item.paymentId === payment._id);
                  return (
                    <li key={payment._id} className="flex flex-wrap justify-between gap-2 border-b py-2">
                      <span>{payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : ''} · {payment.paymentMethod.replace('_', ' ')} · {payment.status}</span>
                        <span className="flex flex-wrap items-center gap-3">
                          <span>{formatCurrency(payment.amount, currency)}{receipt ? ` · ${receipt.receiptNumber}` : ''}</span>
                          {receipt && (
                            <span className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                className="text-cravora-purple hover:underline"
                                onClick={() => emailReceipt(receipt).catch((err: Error) => setError(err.message))}
                              >
                                Email
                              </button>
                              <button
                                type="button"
                                className="text-emerald-600 font-medium hover:underline disabled:opacity-50"
                                disabled={isGeneratingWhatsApp}
                                onClick={() => handleWhatsAppReceipt(receipt)}
                              >
                                WhatsApp
                              </button>
                              <button
                                type="button"
                                className="text-red-500 hover:underline text-xs"
                                onClick={() => deleteReceipt(receipt.receiptNumber)}
                              >
                                Delete receipt
                              </button>
                            </span>
                          )}
                          <button
                            type="button"
                            className="text-purple-600 font-medium hover:underline text-xs"
                            onClick={() => startEditPayment(payment)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-red-600 font-medium hover:underline text-xs"
                            onClick={() => deletePayment(payment._id)}
                          >
                            Delete
                          </button>
                        </span>
                    </li>
                  );
                })}
                {payments.length === 0 && <li>No payments yet.</li>}
              </ul>
            </div>
          </>
        )}
      </div>
      {preview && createPortal(
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <PdfDocument
            id="invoice-pdf"
            documentType="Invoice"
            clientInfo={preview.clientSnapshot}
            modules={preview.items || []}
            quotationId={invoice?.invoiceNumber || ''}
            tax={preview.tax || 0}
            discountRate={preview.discountRate || 0}
            subtotal={preview.subtotal || 0}
            taxAmount={preview.taxAmount || 0}
            discountAmount={preview.discountAmount || 0}
            grandTotal={preview.grandTotal || 0}
            termsAndConditions={preview.terms || []}
            issuedAt={preview.issueDate}
            dueDate={preview.dueDate}
            notes={preview.notes}
            gstDetails={preview.gstDetails}
            amountPaid={invoice?.amountPaid || 0}
            balanceDue={invoice?.balanceDue || 0}
          />
        </div>,
        document.body
      )}
      {receiptPreview && createPortal(
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <ReceiptDocument receipt={receiptPreview} id="receipt-pdf" />
        </div>,
        document.body
      )}
      {showWhatsAppModal && invoice && (
        <WhatsAppModal
          isOpen={showWhatsAppModal}
          onClose={() => setShowWhatsAppModal(false)}
          quotationId={invoice.invoiceNumber}
          documentType="Invoice"
          initialPhone={whatsappPhone}
          clientName={invoice.clientSnapshot?.clientName}
          grandTotal={invoice.grandTotal}
          currency={currency}
          isDraft={invoice.status === 'draft'}
          pdfBase64={whatsappPdfBase64}
          filename={`${invoice.invoiceNumber}.pdf`}
          onSuccess={(notice) => setMessage(notice)}
        />
      )}
      {whatsappReceipt && (
        <WhatsAppModal
          isOpen={Boolean(whatsappReceipt)}
          onClose={() => setWhatsappReceipt(null)}
          quotationId={whatsappReceipt.receiptNumber}
          documentType="Receipt"
          initialPhone={whatsappReceiptPhone}
          clientName={whatsappReceipt.clientSnapshot?.clientName || invoice?.clientSnapshot?.clientName}
          grandTotal={whatsappReceipt.amount || 0}
          currency={whatsappReceipt.currency || currency}
          isDraft={false}
          pdfBase64={whatsappReceiptPdfBase64}
          filename={`${whatsappReceipt.receiptNumber}.pdf`}
          onSuccess={(notice) => setMessage(notice)}
        />
      )}
      {editingInvoiceOpen && invoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-gray-800">Edit Invoice {invoice.invoiceNumber}</h3>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 text-lg font-bold p-1"
                onClick={() => setEditingInvoiceOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={saveInvoiceEdit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={invoiceEditForm.dueDate}
                  onChange={(e) => setInvoiceEditForm({ ...invoiceEditForm, dueDate: e.target.value })}
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
                  value={invoiceEditForm.discountRate}
                  onChange={(e) => setInvoiceEditForm({ ...invoiceEditForm, discountRate: Number(e.target.value) })}
                  className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={invoiceEditForm.notes}
                  onChange={(e) => setInvoiceEditForm({ ...invoiceEditForm, notes: e.target.value })}
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
                  value={invoiceEditForm.terms}
                  onChange={(e) => setInvoiceEditForm({ ...invoiceEditForm, terms: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm font-mono text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  onClick={() => setEditingInvoiceOpen(false)}
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
      {editingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-gray-800">Edit Payment</h3>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 text-lg font-bold p-1"
                onClick={() => setEditingPayment(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={savePaymentEdit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Amount ({currency})
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={paymentEditForm.amount}
                  onChange={(e) => setPaymentEditForm({ ...paymentEditForm, amount: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={paymentEditForm.paymentDate}
                  onChange={(e) => setPaymentEditForm({ ...paymentEditForm, paymentDate: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Method
                </label>
                <select
                  value={paymentEditForm.paymentMethod}
                  onChange={(e) => setPaymentEditForm({ ...paymentEditForm, paymentMethod: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>{m.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Reference
                </label>
                <input
                  value={paymentEditForm.transactionReference}
                  onChange={(e) => setPaymentEditForm({ ...paymentEditForm, transactionReference: e.target.value })}
                  placeholder="Transaction reference"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Notes
                </label>
                <input
                  value={paymentEditForm.notes}
                  onChange={(e) => setPaymentEditForm({ ...paymentEditForm, notes: e.target.value })}
                  placeholder="Notes"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  onClick={() => setEditingPayment(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-cravora-purple px-4 py-2 text-sm font-semibold text-white hover:bg-cravora-purple-dark"
                >
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
