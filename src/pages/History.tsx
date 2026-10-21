import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Trash2, Plus, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/currency';
import { useQuotationStore, type ClientInfo, type Module } from '../store/quotationStore';
import { generatePDF } from '../utils/pdfGenerator';
import PdfDocument from '../components/PdfDocument';
import { apiUrl, apiJson, blobToBase64, publicQuotationUrl } from '../utils/api';
import SectionNav from '../components/SectionNav';
import { quotationLinks, quotationStatusLabel } from '../utils/labels';

interface SavedQuotation {
  id: string;
  clientName: string;
  projectName: string;
  date: string;
  total: number;
  status: string;
  publicToken?: string;
  discountRate?: number;
  discountAmount?: number;
  gstDetails?: {
    gstType?: string;
    cgstRate?: number;
    sgstRate?: number;
    igstRate?: number;
    cgstAmount?: number;
    sgstAmount?: number;
    igstAmount?: number;
    totalGstAmount?: number;
  };
  termsAndConditions?: string[];
  documentType?: string;
  issuedAt?: string;
  notes?: string;
  rejectionReason?: string;
  validUntil?: string;
  clientInfo: ClientInfo;
  modules: Module[];
  tax: number;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
}

export default function History() {
  const navigate = useNavigate();
  const { reset } = useQuotationStore();
  const [quotations, setQuotations] = useState<SavedQuotation[]>([]);
  const [generatingPdfFor, setGeneratingPdfFor] = useState<SavedQuotation | null>(null);

  useEffect(() => {
    loadQuotations();
  }, []);

  const loadQuotations = async () => {
    try {
      const token = localStorage.getItem('cravora.token');
      const res = await fetch(apiUrl('/api/quotations'), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json() as Array<{
          quotationId: string;
          clientInfo?: ClientInfo;
          isDraft?: boolean;
          status?: string;
          publicToken?: string;
          lastSaved?: string;
          updatedAt?: string;
          grandTotal?: number;
          discountRate?: number;
          discountAmount?: number;
          gstDetails?: SavedQuotation['gstDetails'];
          termsAndConditions?: string[];
          documentType?: string;
          issuedAt?: string;
          notes?: string;
          rejectionReason?: string;
          validUntil?: string;
          modules?: Module[];
          tax?: number;
          subtotal?: number;
          taxAmount?: number;
          issuedSnapshot?: {
            discountRate?: number;
            discountAmount?: number;
            gstDetails?: SavedQuotation['gstDetails'];
            termsAndConditions?: string[];
            issuedAt?: string;
            notes?: string;
            validUntil?: string;
            clientInfo?: ClientInfo;
            modules?: Module[];
          };
        }>;
        const mapped = data.map((q) => ({
          id: q.quotationId,
          clientName: q.clientInfo?.clientName || 'Unknown',
          projectName: q.clientInfo?.projectName || 'Unknown',
          date: q.lastSaved || q.updatedAt || new Date().toISOString(),
          total: q.grandTotal || 0,
          status: q.status || (q.isDraft ? 'draft' : 'final'),
          publicToken: q.publicToken,
          discountRate: q.discountRate || q.issuedSnapshot?.discountRate || 0,
          discountAmount: q.discountAmount || q.issuedSnapshot?.discountAmount || 0,
          gstDetails: q.issuedSnapshot?.gstDetails || q.gstDetails,
          termsAndConditions: q.issuedSnapshot?.termsAndConditions || q.termsAndConditions || [],
          documentType: q.documentType,
          issuedAt: q.issuedAt || q.issuedSnapshot?.issuedAt,
          notes: q.issuedSnapshot?.notes || q.notes,
          rejectionReason: q.rejectionReason,
          validUntil: q.issuedSnapshot?.validUntil || q.validUntil,
          clientInfo: (q.issuedSnapshot?.clientInfo || q.clientInfo) as ClientInfo,
          modules: q.issuedSnapshot?.modules || q.modules || [],
          tax: q.tax || 0,
          subtotal: q.subtotal || 0,
          taxAmount: q.taxAmount || 0,
          grandTotal: q.grandTotal || 0,
        }));
        setQuotations(mapped);
      }
    } catch (error) {
      console.error('Failed to load quotations', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this quotation?')) {
      try {
        const token = localStorage.getItem('cravora.token');
        const res = await fetch(apiUrl(`/api/quotations/${id}`), {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          setQuotations(quotations.filter((q) => q.id !== id));
        } else {
          const data = await res.json().catch(() => ({}));
          alert(data.message || 'Failed to delete from server');
        }
      } catch (error) {
        console.error('Failed to delete quotation', error);
      }
    }
  };

  const handleEmail = async (quotation: SavedQuotation) => {
    try {
      if (!quotation.publicToken) {
        await apiJson(`/api/quotations/${quotation.id}/issue`, { method: 'POST' });
      }
      const { loadDraft } = useQuotationStore.getState();
      await loadDraft(quotation.id);
      const state = useQuotationStore.getState();
      const source = state.issuedAt ? state : null;
      setGeneratingPdfFor({
        ...quotation,
        clientInfo: state.clientInfo,
        modules: state.modules,
        tax: state.tax,
        subtotal: state.getSubtotal(),
        taxAmount: state.getTaxAmount(),
        grandTotal: state.getGrandTotal(),
        discountRate: state.discountRate,
        discountAmount: state.getDiscountAmount(),
        gstDetails: state.gstDetails,
        termsAndConditions: state.termsAndConditions,
        documentType: state.documentType,
        issuedAt: source ? state.issuedAt || undefined : undefined,
        notes: state.notes,
        validUntil: state.validUntil,
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
      const blob = await generatePDF('hidden-pdf-content', `${quotation.id}.pdf`, { download: false });
      await apiJson(`/api/quotations/${quotation.id}/email`, {
        method: 'POST',
        body: JSON.stringify({
          to: state.clientInfo.clientEmail,
          pdfBase64: await blobToBase64(blob),
          appUrl: window.location.origin,
        }),
      });
      alert('Quotation email sent.');
      await loadQuotations();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not email quotation');
    } finally {
      setGeneratingPdfFor(null);
    }
  };

  const handleConvert = async (quotation: SavedQuotation) => {
    const due = quotation.validUntil ? new Date(quotation.validUntil) : new Date();
    if (!quotation.validUntil) due.setDate(due.getDate() + 15);
    const total = formatCurrency(quotation.grandTotal || quotation.total, quotation.clientInfo?.currency || 'INR');
    if (!confirm(`Create an invoice for ${total}? The due date will be ${due.toLocaleDateString()}.`)) return;
    try {
      const invoice = await apiJson(`/api/quotations/${quotation.id}/convert`, {
        method: 'POST',
        body: JSON.stringify({ dueDate: quotation.validUntil || undefined }),
      });
      navigate(`/invoices/${invoice.invoiceNumber}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not convert quotation');
    }
  };

  const openInvoice = async (quotationId: string) => {
    try {
      const data = await apiJson(`/api/invoices?q=${encodeURIComponent(quotationId)}&limit=20`);
      const items = (data.items || []) as Array<{ quotationId?: string; invoiceNumber?: string }>;
      const match = items.find((item) => item.quotationId === quotationId);
      if (!match) {
        alert('No invoice is linked to this quotation yet.');
        return;
      }
      navigate(`/invoices/${match.invoiceNumber}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not open the invoice');
    }
  };

  const handleNewQuotation = () => {
    reset();
    navigate('/');
  };

  const handleEditDraft = async (id: string) => {
    const { loadDraft } = useQuotationStore.getState();
    await loadDraft(id);
    navigate('/');
  };

  const handleDownloadQuotation = async (quotation: SavedQuotation) => {
    try {
      // First ensure we have the full data, particularly for Drafts where modules might be incomplete in the table view
      const { loadDraft } = useQuotationStore.getState();
      await loadDraft(quotation.id);

      // Now set the state to trigger the hidden render
      setGeneratingPdfFor({
        ...quotation,
        clientInfo: useQuotationStore.getState().clientInfo,
        modules: useQuotationStore.getState().modules,
        tax: useQuotationStore.getState().tax,
        subtotal: useQuotationStore.getState().getSubtotal(),
        taxAmount: useQuotationStore.getState().getTaxAmount(),
        grandTotal: useQuotationStore.getState().getGrandTotal(),
        // The store handles these additional properties properly now
      });

      // We wait for the next render cycle so the hidden element is inserted into the DOM
      setTimeout(async () => {
        try {
          const element = document.getElementById('hidden-pdf-content');
          if (!element) throw new Error("Hidden PDF container not found");

          await generatePDF('hidden-pdf-content', `${quotation.id}.pdf`);

        } catch (err) {
          console.error("PDF Generation error:", err);
          alert('Failed to generate PDF. Please try again.');
        } finally {
          // Clear it out to hide the element again
          setGeneratingPdfFor(null);
        }
      }, 500);

    } catch (error) {
      console.error('Error opening quotation:', error);
      alert('Error opening quotation. Please try again.');
      setGeneratingPdfFor(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-50 py-12">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-7xl mx-auto"
        >
          <SectionNav links={quotationLinks} />
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-800 mb-2">
                  Quotations
                </h1>
                <p className="text-gray-600">
                  Drafts, sent quotes, and accepted quotes ready for an invoice
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleNewQuotation}
                className="bg-cravora-purple text-white px-6 py-3 rounded-lg font-medium hover:bg-cravora-purple-dark transition flex items-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span>New Quotation</span>
              </motion.button>
            </div>

            {quotations.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-600 mb-6">
                  No quotations yet. Create one for a client, then send it.
                </p>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleNewQuotation}
                  className="bg-cravora-purple text-white px-6 py-3 rounded-lg font-medium hover:bg-cravora-purple-dark transition"
                >
                  Create Quotation
                </motion.button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">
                        Quotation ID
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">
                        Client Name
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">
                        Project Name
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">
                        Date
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">
                        Total
                      </th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">
                        Status
                      </th>
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotations.map((quotation) => (
                      <motion.tr
                        key={quotation.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="border-b border-gray-100 hover:bg-gray-50 transition"
                      >
                        <td className="py-4 px-4">
                          <span className="font-mono text-sm text-gray-700">
                            {quotation.id}
                          </span>
                          <span className="mt-1 block text-xs text-gray-500">{quotation.documentType === 'Billing' ? 'Bill' : 'Quotation'}</span>
                        </td>
                        <td className="py-4 px-4 text-gray-800">
                          {quotation.clientName}
                        </td>
                        <td className="py-4 px-4 text-gray-800">
                          {quotation.projectName}
                        </td>
                        <td className="py-4 px-4 text-gray-600">
                          {format(new Date(quotation.date), 'MMM dd, yyyy')}
                        </td>
                        <td className="text-right py-4 px-4 font-semibold text-gray-800">
                          {formatCurrency(
                            quotation.total,
                            quotation.clientInfo.currency
                          )}
                        </td>
                        <td className="text-center py-4 px-4">
                          <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-purple-50 text-cravora-purple">
                            {quotationStatusLabel(quotation.status)}
                          </span>
                        </td>
                        <td className="text-center py-4 px-4">
                          <div className="flex items-center justify-center gap-2">
                            {quotation.status === 'draft' && (
                              <button type="button" className="rounded-lg bg-cravora-purple px-3 py-1.5 text-xs font-medium text-white" onClick={() => handleEditDraft(quotation.id)}>Edit</button>
                            )}
                            {quotation.status === 'final' && quotation.documentType === 'Billing' && (
                              <button type="button" className="rounded-lg bg-cravora-purple px-3 py-1.5 text-xs font-medium text-white" onClick={() => handleConvert(quotation)}>Create invoice</button>
                            )}
                            {quotation.status === 'final' && quotation.documentType !== 'Billing' && (
                              <button type="button" className="rounded-lg bg-cravora-purple px-3 py-1.5 text-xs font-medium text-white" onClick={() => handleEditDraft(quotation.id)}>Edit</button>
                            )}
                            {quotation.status === 'sent' && (
                              <button type="button" className="rounded-lg bg-cravora-purple px-3 py-1.5 text-xs font-medium text-white" onClick={() => {
                                const link = quotation.publicToken ? publicQuotationUrl(quotation.publicToken) : '';
                                if (link) navigator.clipboard.writeText(link);
                                alert(link || 'Issue the quotation before sharing a link.');
                              }}>View link</button>
                            )}
                            {quotation.status === 'viewed' && (
                              <button type="button" className="rounded-lg bg-cravora-purple px-3 py-1.5 text-xs font-medium text-white" onClick={() => handleEmail(quotation)}>Follow up</button>
                            )}
                            {quotation.status === 'accepted' && (
                              <button type="button" className="rounded-lg bg-cravora-purple px-3 py-1.5 text-xs font-medium text-white" onClick={() => handleConvert(quotation)}>Create invoice</button>
                            )}
                            {quotation.status === 'rejected' && (
                              <button type="button" className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white" onClick={() => alert(quotation.rejectionReason || 'No reason was recorded.')}>View reason</button>
                            )}
                            {quotation.status === 'converted' && (
                              <button type="button" className="rounded-lg bg-cravora-purple px-3 py-1.5 text-xs font-medium text-white" onClick={() => openInvoice(quotation.id)}>Open invoice</button>
                            )}
                            <button type="button" className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Download PDF" onClick={() => handleDownloadQuotation(quotation)}>
                              <Download className="w-4 h-4" />
                            </button>
                            {quotation.status === 'draft' && (
                              <button type="button" className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Delete" onClick={() => handleDelete(quotation.id)}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Hidden PDF Generator Container */}
      {generatingPdfFor && createPortal(
        <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', opacity: 0, pointerEvents: 'none', width: '210mm' }}>
          <div id="hidden-pdf-content">
            <PdfDocument
              clientInfo={generatingPdfFor.clientInfo}
              modules={generatingPdfFor.modules}
              quotationId={generatingPdfFor.id}
              tax={generatingPdfFor.tax}
              discountRate={generatingPdfFor.discountRate || 0}
              subtotal={generatingPdfFor.subtotal}
              taxAmount={generatingPdfFor.taxAmount}
              discountAmount={generatingPdfFor.discountAmount || 0}
              grandTotal={generatingPdfFor.grandTotal}
              termsAndConditions={generatingPdfFor.termsAndConditions || useQuotationStore.getState().termsAndConditions}
              documentType={generatingPdfFor.documentType || useQuotationStore.getState().documentType}
              issuedAt={generatingPdfFor.issuedAt}
              validUntil={generatingPdfFor.validUntil}
              notes={generatingPdfFor.notes}
              gstDetails={generatingPdfFor.gstDetails}
              id="hidden-pdf-content-inner"
            />
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
