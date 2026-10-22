import { format } from 'date-fns';
import { formatCurrency } from '../utils/currency';

interface ReceiptView {
  issuedSnapshot?: ReceiptView;
  clientSnapshot?: { clientName?: string; clientEmail?: string; currency?: 'INR' | 'USD' };
  receiptNumber?: string;
  paymentDate?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  paymentMethod?: string;
  transactionReference?: string;
  currency?: 'INR' | 'USD';
  invoiceTotal?: number;
  amount?: number;
  amountPaid?: number;
  balanceDue?: number;
}

interface ReceiptDocumentProps {
  receipt: ReceiptView;
  id?: string;
}

export default function ReceiptDocument({ receipt, id = 'receipt-content' }: ReceiptDocumentProps) {
  const client = receipt.clientSnapshot || receipt.issuedSnapshot?.clientSnapshot || {};
  const currency = receipt.currency || receipt.issuedSnapshot?.currency || client.currency || 'INR';
  const receiptNumber = receipt.receiptNumber || receipt.issuedSnapshot?.receiptNumber || '';
  const invoiceNumber = receipt.invoiceNumber || receipt.invoiceId || receipt.issuedSnapshot?.invoiceNumber || receipt.issuedSnapshot?.invoiceId || '';
  const paymentDate = receipt.paymentDate || receipt.issuedSnapshot?.paymentDate;
  const paymentMethod = receipt.paymentMethod || receipt.issuedSnapshot?.paymentMethod || '';
  const transactionReference = receipt.transactionReference ?? receipt.issuedSnapshot?.transactionReference ?? '';

  const invoiceTotal = Number(receipt.invoiceTotal ?? receipt.issuedSnapshot?.invoiceTotal ?? 0);
  const thisPayment = Number(receipt.amount ?? receipt.issuedSnapshot?.amount ?? 0);
  const amountPaid = Number(receipt.amountPaid ?? receipt.issuedSnapshot?.amountPaid ?? thisPayment);
  const balanceDue = Number(
    receipt.balanceDue !== undefined && receipt.balanceDue !== null
      ? Math.max(0, receipt.balanceDue)
      : Math.max(0, invoiceTotal - amountPaid)
  );

  return (
    <div id={id} className="bg-white text-gray-800" style={{ width: '210mm', minHeight: '297mm', padding: '24mm', fontFamily: 'Poppins, sans-serif' }}>
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl text-cravora-purple font-bold">PAYMENT RECEIPT</h1>
          <p className="mt-2">Receipt no: {receiptNumber}</p>
          <p>Date: {paymentDate ? format(new Date(paymentDate), 'dd/MM/yyyy') : ''}</p>
        </div>
        <img src="/logo-header.png" alt="Cravora Solutions" className="w-40" />
      </div>
      <div className="mb-6 text-sm space-y-1">
        <p><span className="text-gray-500">Received from:</span> {client.clientName}</p>
        <p><span className="text-gray-500">Email:</span> {client.clientEmail}</p>
        <p><span className="text-gray-500">Invoice:</span> {invoiceNumber}</p>
        <p><span className="text-gray-500">Method:</span> {String(paymentMethod || '').replace('_', ' ')}</p>
        <p><span className="text-gray-500">Reference:</span> {transactionReference || '-'}</p>
      </div>
      <div className="border-t border-b py-4 space-y-2">
        <div className="flex justify-between"><span>Invoice total</span><span>{formatCurrency(invoiceTotal, currency)}</span></div>
        <div className="flex justify-between"><span>This payment</span><span>{formatCurrency(thisPayment, currency)}</span></div>
        <div className="flex justify-between"><span>Amount paid</span><span>{formatCurrency(amountPaid, currency)}</span></div>
        <div className="flex justify-between font-bold"><span>Balance due</span><span>{formatCurrency(balanceDue, currency)}</span></div>
      </div>
      <p className="text-center text-cravora-purple text-sm mt-16">Thank you for doing business with us.</p>
      <p className="text-center text-xs text-gray-500 mt-2">info@cravorasolutions.com · +91 95123 62944</p>
    </div>
  );
}
