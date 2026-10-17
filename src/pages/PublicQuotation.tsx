import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PdfDocument from '../components/PdfDocument';
import { generatePDF } from '../utils/pdfGenerator';
import { apiJson, asBody } from '../utils/api';

export default function PublicQuotation() {
  const { token } = useParams();
  const [quotation, setQuotation] = useState<{
    quotationId: string;
    documentType?: string;
    status: string;
    clientInfo: { clientName?: string; currency?: 'INR' | 'USD'; clientAddress?: string; clientGstNumber?: string };
    modules: Array<{ id: string; name: string; description?: string; hours: number; rate: number; total: number }>;
    tax?: number;
    discountRate?: number;
    discountAmount?: number;
    termsAndConditions?: string[];
    gstDetails?: {
      gstType?: 'intra' | 'inter';
      cgstRate?: number;
      sgstRate?: number;
      igstRate?: number;
      cgstAmount?: number;
      sgstAmount?: number;
      igstAmount?: number;
      totalGstAmount?: number;
    };
    subtotal?: number;
    taxAmount?: number;
    grandTotal?: number;
    notes?: string;
    validUntil?: string | null;
    issuedAt?: string | null;
    rejectionReason?: string;
  } | null>(null);
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!token) return;
    apiJson(`/api/public/quotations/${token}`)
      .then((data) => setQuotation(asBody(data)))
      .catch((error: Error) => setMessage(error.message));
  }, [token]);

  const decide = async (path: string, body?: object) => {
    setMessage('');
    try {
      const data = await apiJson(`/api/public/quotations/${token}/${path}`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      });
      setQuotation(asBody(data));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed');
    }
  };

  if (!quotation) {
    return <div className="min-h-screen bg-gray-50 p-8 text-gray-700">{message || 'Loading quotation...'}</div>;
  }

  const canDecide = quotation.status === 'sent' || quotation.status === 'viewed';

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-3">
      <div className="max-w-5xl mx-auto mb-4 bg-white rounded-xl shadow p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">Cravora Solutions</p>
          <h1 className="text-xl font-bold text-gray-800">{quotation.quotationId}</h1>
          <p className="text-sm capitalize text-cravora-purple">Status: {quotation.status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="bg-gray-800 text-white px-4 py-2 rounded-lg"
            onClick={() => generatePDF('public-pdf', `${quotation.quotationId}.pdf`).catch(() => alert('Could not download PDF'))}
          >
            Download PDF
          </button>
          {canDecide && (
            <>
              <button className="bg-green-600 text-white px-4 py-2 rounded-lg" onClick={() => decide('accept')}>Accept</button>
              <button className="bg-red-600 text-white px-4 py-2 rounded-lg" onClick={() => decide('reject', { reason })}>Reject</button>
            </>
          )}
        </div>
      </div>
      {canDecide && (
        <div className="max-w-5xl mx-auto mb-4">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason if you reject this quotation"
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
      )}
      {message && <p className="max-w-5xl mx-auto mb-4 text-red-600">{message}</p>}
      {quotation.rejectionReason && (
        <p className="max-w-5xl mx-auto mb-4 text-gray-700">Rejection reason: {quotation.rejectionReason}</p>
      )}
      <PdfDocument
        id="public-pdf"
        clientInfo={quotation.clientInfo}
        modules={quotation.modules || []}
        quotationId={quotation.quotationId}
        tax={quotation.tax || 0}
        discountRate={quotation.discountRate || 0}
        subtotal={quotation.subtotal || 0}
        taxAmount={quotation.taxAmount || 0}
        discountAmount={quotation.discountAmount || 0}
        grandTotal={quotation.grandTotal || 0}
        termsAndConditions={quotation.termsAndConditions || []}
        documentType={quotation.documentType || 'Quotation'}
        issuedAt={quotation.issuedAt}
        validUntil={quotation.validUntil}
        notes={quotation.notes}
        gstDetails={quotation.gstDetails}
      />
    </div>
  );
}
