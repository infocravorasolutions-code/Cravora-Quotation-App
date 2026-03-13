import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Eye, Trash2, Plus, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/currency';
import { useQuotationStore } from '../store/quotationStore';
import { generatePDF } from '../utils/pdfGenerator';
import PdfDocument from '../components/PdfDocument';

interface SavedQuotation {
  id: string;
  clientName: string;
  projectName: string;
  date: string;
  total: number;
  status: string;
  clientInfo: any;
  modules: any[];
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
      const res = await fetch('http://localhost:5000/api/quotations');
      if (res.ok) {
        const data = await res.json();
        const mapped = data.map((q: any) => ({
          id: q.quotationId,
          clientName: q.clientInfo?.clientName || 'Unknown',
          projectName: q.clientInfo?.projectName || 'Unknown',
          date: q.lastSaved || q.updatedAt || new Date().toISOString(),
          total: q.grandTotal || 0,
          status: q.isDraft ? 'Draft' : 'Final',
          clientInfo: q.clientInfo,
          modules: q.modules || [],
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
        const res = await fetch(`http://localhost:5000/api/quotations/${id}`, { method: 'DELETE' });
        if (res.ok) {
          setQuotations(quotations.filter((q) => q.id !== id));
        } else {
          console.error('Failed to delete from server');
        }
      } catch (error) {
        console.error('Failed to delete quotation', error);
      }
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
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-800 mb-2">
                  Quotation History
                </h1>
                <p className="text-gray-600">
                  View and manage all your saved quotations
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
                <div className="text-gray-400 mb-4">
                  <Eye className="w-16 h-16 mx-auto" />
                </div>
                <p className="text-gray-600 mb-6">
                  No quotations found. Create your first one!
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
                          <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {quotation.status}
                          </span>
                        </td>
                        <td className="text-center py-4 px-4">
                          <div className="flex items-center justify-center space-x-2">
                            {quotation.status === 'Draft' && (
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleEditDraft(quotation.id)}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                                title="Continue Editing"
                              >
                                <Eye className="w-4 h-4" />
                              </motion.button>
                            )}
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleDownloadQuotation(quotation)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleDelete(quotation.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </motion.button>
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
              discountRate={0} // History view doesn't save this yet, but we will pass 0
              subtotal={generatingPdfFor.subtotal}
              taxAmount={generatingPdfFor.taxAmount}
              discountAmount={0}
              grandTotal={generatingPdfFor.grandTotal}
              termsAndConditions={useQuotationStore.getState().termsAndConditions}
              documentType={useQuotationStore.getState().documentType}
              id="hidden-pdf-content-inner"
            />
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
