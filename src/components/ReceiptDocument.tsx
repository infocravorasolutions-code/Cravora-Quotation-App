import { format } from 'date-fns';
import { formatCurrency } from '../utils/currency';

interface ReceiptView {
  issuedSnapshot?: ReceiptView;
  clientSnapshot?: { clientName?: string; clientEmail?: string; currency?: 'INR' | 'USD' };
  receiptNumber?: string;
  paymentDate?: string;
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
  const source = receipt.issuedSnapshot || receipt;
  const client = source.clientSnapshot || {};
  const currency = source.currency || client.currency || 'INR';
  return (
    <div id={id} className="bg-white text-gray-800" style={{ width: '210mm', minHeight: '297mm', padding: '24mm', fontFamily: 'Poppins, sans-serif' }}>
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl text-cravora-purple font-bold">PAYMENT RECEIPT</h1>
          <p className="mt-2">Receipt no: {source.receiptNumber}</p>
          <p>Date: {source.paymentDate ? format(new Date(source.paymentDate), 'dd/MM/yyyy') : ''}</p>
        </div>
        <img src="/logo-header.png" alt="Cravora Solutions" className="w-40" />
      </div>
      <div className="mb-6 text-sm space-y-1">
        <p><span className="text-gray-500">Received from:</span> {client.clientName}</p>
        <p><span className="text-gray-500">Email:</span> {client.clientEmail}</p>
        <p><span className="text-gray-500">Invoice:</span> {source.invoiceNumber}</p>
        <p><span className="text-gray-500">Method:</span> {String(source.paymentMethod || '').replace('_', ' ')}</p>
        <p><span className="text-gray-500">Reference:</span> {source.transactionReference || '-'}</p>
      </div>
      <div className="border-t border-b py-4 space-y-2">
        <div className="flex justify-between"><span>Invoice total</span><span>{formatCurrency(source.invoiceTotal || 0, currency)}</span></div>
        <div className="flex justify-between"><span>This payment</span><span>{formatCurrency(source.amount || 0, currency)}</span></div>
        <div className="flex justify-between"><span>Amount paid</span><span>{formatCurrency(source.amountPaid || 0, currency)}</span></div>
        <div className="flex justify-between font-bold"><span>Balance due</span><span>{formatCurrency(source.balanceDue || 0, currency)}</span></div>
      </div>
      <p className="text-center text-cravora-purple text-sm mt-16">Thank you for doing business with us.</p>
      <p className="text-center text-xs text-gray-500 mt-2">info@cravorasolutions.com · +91 95123 62944</p>
    </div>
  );
}
