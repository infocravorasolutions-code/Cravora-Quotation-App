import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ReceiptDocument from '../components/ReceiptDocument';
import SectionNav from '../components/SectionNav';
import { invoiceLinks } from '../utils/labels';
import { generatePDF } from '../utils/pdfGenerator';
import { apiJson, asItems, blobToBase64 } from '../utils/api';
import { formatCurrency } from '../utils/currency';

interface ReceiptRecord {
  _id?: string;
  receiptNumber: string;
  invoiceId?: string;
  currency?: 'INR' | 'USD';
  amount?: number;
  balanceDue?: number;
  clientSnapshot?: { clientName?: string; clientEmail?: string };
  issuedSnapshot?: ReceiptRecord;
  paymentDate?: string;
  paymentMethod?: string;
  transactionReference?: string;
  invoiceNumber?: string;
  invoiceTotal?: number;
  amountPaid?: number;
}

async function suggestReceiptEmail(receipt: ReceiptRecord) {
  let suggested = String(receipt.clientSnapshot?.clientEmail || receipt.issuedSnapshot?.clientSnapshot?.clientEmail || '').trim();
  if (receipt.invoiceId) {
    try {
      const invoice = await apiJson(`/api/invoices/${receipt.invoiceId}`);
      if (invoice.clientId) {
        const client = await apiJson(`/api/clients/${invoice.clientId}`);
        if (client.email) suggested = String(client.email).trim();
      } else if (invoice.clientSnapshot?.clientEmail) {
        suggested = String(invoice.clientSnapshot.clientEmail).trim();
      }
    } catch {
      // keep snapshot email
    }
  }
  return suggested;
}

export default function Receipts() {
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<ReceiptRecord | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    const data = await apiJson(`/api/receipts?limit=50&q=${encodeURIComponent(query)}`);
    setReceipts(asItems<ReceiptRecord>(data));
  };

  useEffect(() => {
    apiJson('/api/receipts?limit=50')
      .then((data) => setReceipts(asItems<ReceiptRecord>(data)))
      .catch((err: Error) => setError(err.message));
  }, []);

  const withPdf = async (receipt: ReceiptRecord, download: boolean) => {
    setActive(receipt);
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      return await generatePDF('receipt-pdf', `${receipt.receiptNumber}.pdf`, { download });
    } finally {
      setActive(null);
    }
  };

  const download = async (receipt: ReceiptRecord) => {
    setError('');
    try {
      await withPdf(receipt, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download receipt');
    }
  };

  const email = async (receipt: ReceiptRecord) => {
    setError('');
    setNotice('');
    try {
      const suggested = await suggestReceiptEmail(receipt);
      const to = String(window.prompt('Send this receipt to which email?', suggested) || '').trim();
      if (!to) return;
      const blob = await withPdf(receipt, false);
      if (!blob) throw new Error('Could not build the receipt PDF');
      const result = await apiJson(`/api/receipts/${receipt.receiptNumber}/email`, {
        method: 'POST',
        body: JSON.stringify({
          to,
          pdfBase64: await blobToBase64(blob),
          message: 'Please find your payment receipt attached.',
        }),
      });
      setNotice(result.message || `Receipt email sent to ${to}.`);
      alert(result.message || `Receipt email sent to ${to}. Check that inbox and spam.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not email receipt');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <SectionNav links={invoiceLinks} />
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Receipts</h1>
          {error && <p className="text-red-600 mb-3">{error}</p>}
          {notice && <p className="text-green-700 mb-3">{notice}</p>}
          <div className="flex gap-3 mb-4">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search receipt or invoice" className="border rounded-lg px-3 py-2 flex-1" />
            <button className="bg-gray-800 text-white px-4 py-2 rounded-lg" onClick={() => load().catch((err) => setError(err.message))}>Search</button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left"><th className="py-2">Receipt</th><th>Invoice</th><th>Client</th><th>Amount</th><th>Balance</th><th></th></tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.receiptNumber} className="border-b">
                  <td className="py-3 font-mono">{receipt.receiptNumber}</td>
                  <td>{receipt.invoiceId}</td>
                  <td>{receipt.clientSnapshot?.clientName}</td>
                  <td>{formatCurrency(receipt.amount || 0, receipt.currency || 'INR')}</td>
                  <td>{formatCurrency(receipt.balanceDue || 0, receipt.currency || 'INR')}</td>
                  <td className="text-right space-x-3">
                    <button type="button" className="text-blue-600" onClick={() => download(receipt)}>PDF</button>
                    <button type="button" className="text-cravora-purple" onClick={() => email(receipt)}>Email</button>
                  </td>
                </tr>
              ))}
              {receipts.length === 0 && (
                <tr><td className="py-3" colSpan={6}>No receipts yet. Record a payment on an invoice to create one.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {active && createPortal(
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <ReceiptDocument receipt={active} id="receipt-pdf" />
        </div>,
        document.body
      )}
    </div>
  );
}
