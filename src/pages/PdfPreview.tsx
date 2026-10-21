import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, Save, Settings, MessageCircle, Pencil } from 'lucide-react';
import { useQuotationStore } from '../store/quotationStore';
import { generatePDF, PDFOptions } from '../utils/pdfGenerator';
import { apiUrl, apiJson, authHeaders, blobToBase64, publicQuotationUrl } from '../utils/api';
import { useLayoutEffect, useRef, useState } from 'react';
import ProgressStepper from '../components/ProgressStepper';
import PdfDocument from '../components/PdfDocument';
import WhatsAppModal from '../components/WhatsAppModal';
function FitSheet({ children }: { children: React.ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, height: 1123 });

  useLayoutEffect(() => {
    const node = frame.current;
    if (!node) return;
    const fit = () => {
      const sheet = node.querySelector('[data-pdf-page]') as HTMLElement | null;
      const sheetWidth = sheet?.offsetWidth || 794;
      const pages = [...node.querySelectorAll<HTMLElement>('[data-pdf-page]')];
      const height = pages.reduce((sum, page) => sum + page.offsetHeight, 0) + Math.max(0, pages.length - 1) * 16;
      const scale = node.clientWidth > 0 ? Math.min(1, node.clientWidth / sheetWidth) : 1;
      setBox({ scale, height: height || 1123 });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    const content = node.querySelector('#pdf-content');
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frame} className="w-full">
      <div style={{ width: 794 * box.scale, height: box.height * box.scale, margin: '0 auto', overflow: 'hidden' }}>
        <div style={{ width: 794, transform: `scale(${box.scale})`, transformOrigin: 'top left' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function PdfPreview() {
  const navigate = useNavigate();
  const {
    clientInfo,
    modules,
    quotationId,
    tax,
    discountRate,
    getSubtotal,
    getTaxAmount,
    getDiscountAmount,
    getGrandTotal,
    reset,
    saveDraft,
    markAsFinal,
    termsAndConditions,
    documentType,
    gstDetails,
    notes,
    validUntil,
    issuedAt,
    status,
    publicToken,
    setLifecycle,
    generateQuotationId,
  } = useQuotationStore();

  const [pdfOptions, setPdfOptions] = useState<PDFOptions>({
    quality: 'high',
    includeSignature: false,
    watermark: '',
  });
  const [showSettings, setShowSettings] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [waPdfBase64, setWaPdfBase64] = useState('');
  const [waNotice, setWaNotice] = useState('');

  const handleOpenWhatsApp = async () => {
    setIsGenerating(true);
    try {
      if (!quotationId) await generateQuotationId();
      const id = useQuotationStore.getState().quotationId;
      if (!['sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted'].includes(status)) {
        await saveDraft();
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      const blob = await generatePDF('pdf-content', `${id}.pdf`, { ...pdfOptions, download: false });
      const base64 = await blobToBase64(blob);
      setWaPdfBase64(base64);
      setShowWhatsAppModal(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not prepare quotation PDF for WhatsApp');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExplicitIssue = async () => {
    const id = useQuotationStore.getState().quotationId;
    const issued = await apiJson(`/api/quotations/${id}/issue`, { method: 'POST' });
    setLifecycle({
      status: issued.status,
      publicToken: issued.publicToken,
      issuedAt: issued.issuedAt,
      isDraft: false,
    });
    return { publicToken: issued.publicToken };
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      // Check if the element exists
      const element = document.getElementById('pdf-content');
      if (!element) {
        console.error('PDF content element not found');
        alert('Error: PDF content not found. Please refresh the page and try again.');
        return;
      }

      console.log('PDF content element found:', element);
      console.log('Element dimensions:', {
        width: element.offsetWidth,
        height: element.offsetHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight
      });

      // Check if modules exist
      if (modules.length === 0) {
        alert('No modules found. Please go back and add some modules first.');
        return;
      }

      // Use original PDF generation method (html2canvas)
      await generatePDF('pdf-content', `${quotationId}.pdf`, pdfOptions);

      const locked = ['sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted'].includes(status);
      if (locked || issuedAt) {
        await saveDraft();
        alert('PDF downloaded.');
        return;
      }

      const quotation = {
        quotationId: quotationId,
        clientInfo,
        modules,
        tax,
        discountRate,
        termsAndConditions,
        documentType,
        gstDetails,
        isDraft: false,
        lastSaved: new Date().toISOString(),
        subtotal: getSubtotal(),
        discountAmount: getDiscountAmount(),
        taxAmount: getTaxAmount(),
        grandTotal: getGrandTotal(),
      };

      const headers = authHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch(apiUrl(`/api/quotations/${quotationId}`), { headers: authHeaders() });
      let saved: Response;
      if (res.ok) {
        saved = await fetch(apiUrl(`/api/quotations/${quotationId}`), {
          method: 'PUT',
          headers,
          body: JSON.stringify(quotation),
        });
      } else if (res.status === 404) {
        saved = await fetch(apiUrl('/api/quotations'), {
          method: 'POST',
          headers,
          body: JSON.stringify(quotation),
        });
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Could not save this bill');
      }
      if (!saved.ok) {
        const data = await saved.json().catch(() => ({}));
        throw new Error(data.message || 'Could not save this bill');
      }

      markAsFinal();
      alert('Saved. Open Quotations to see this bill.');
      reset();
      navigate('/history');
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(error instanceof Error ? error.message : 'Error generating PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveDraft = async () => {
    const current = useQuotationStore.getState().status;
    if (['sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted'].includes(current)) {
      alert('This quotation has already been issued and was not changed.');
      return;
    }
    try {
      await saveDraft();
      alert('Draft saved. Open Quotations to see it.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not save the draft');
    }
  };

  const handleIssueAndEmail = async () => {
    setIsGenerating(true);
    try {
      if (!quotationId) await generateQuotationId();
      const id = useQuotationStore.getState().quotationId;
      if (!['sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted'].includes(status)) {
        await saveDraft();
      }
      const issued = await apiJson(`/api/quotations/${id}/issue`, { method: 'POST' });
      setLifecycle({
        status: issued.status,
        publicToken: issued.publicToken,
        issuedAt: issued.issuedAt,
        isDraft: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
      const blob = await generatePDF('pdf-content', `${id}.pdf`, { ...pdfOptions, download: false });
      const pdfBase64 = await blobToBase64(blob);
      const link = publicQuotationUrl(issued.publicToken || '');
      try {
        await apiJson(`/api/quotations/${id}/email`, {
          method: 'POST',
          body: JSON.stringify({
            to: clientInfo.clientEmail,
            pdfBase64,
            appUrl: window.location.origin,
            message: 'Please review this quotation and accept or reject it from the link below.',
          }),
        });
        alert(`Quotation issued and emailed.\n${link}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Email failed';
        alert(`${message}\nPublic link:\n${link}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not issue quotation';
      alert(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const subtotal = getSubtotal();
  const taxAmount = getTaxAmount();
  const discountAmount = getDiscountAmount();
  const grandTotal = getGrandTotal();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 py-2 sm:py-4 lg:py-6">
      <div className="container mx-auto px-2 sm:px-6">
        {/* Progress Stepper */}
        <div className="max-w-6xl mx-auto mb-4 sm:mb-6">
          <ProgressStepper currentStep={3} />
        </div>

        <div className="max-w-5xl mx-auto mb-4 sm:mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleDownload}
                disabled={isGenerating}
                className="bg-blue-600 text-white px-4 sm:px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
              >
                <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-sm sm:text-base">{isGenerating ? 'Generating...' : 'Download PDF & Save'}</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleIssueAndEmail}
                disabled={isGenerating}
                className="bg-cravora-purple text-white px-4 sm:px-6 py-3 rounded-lg font-medium hover:bg-cravora-purple-dark transition w-full sm:w-auto disabled:opacity-50"
              >
                <span className="text-sm sm:text-base">{publicToken ? 'Resend email' : 'Issue & email'}</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleOpenWhatsApp}
                disabled={isGenerating}
                className="bg-[#25D366] text-white px-4 sm:px-6 py-3 rounded-lg font-medium hover:bg-[#128C7E] transition flex items-center justify-center space-x-2 w-full sm:w-auto disabled:opacity-50"
              >
                <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-sm sm:text-base">WhatsApp</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveDraft}
                className="bg-gray-600 text-white px-4 sm:px-6 py-3 rounded-lg font-medium hover:bg-gray-700 transition flex items-center justify-center space-x-2 w-full sm:w-auto"
              >
                <Save className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-sm sm:text-base">Save Draft</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/summary')}
                className="bg-purple-100 text-cravora-purple border border-purple-200 px-4 sm:px-6 py-3 rounded-lg font-medium hover:bg-purple-200 transition flex items-center justify-center space-x-2 w-full sm:w-auto"
              >
                <Pencil className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-sm sm:text-base">Edit Details</span>
              </motion.button>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowSettings(!showSettings)}
              className="bg-gray-200 text-gray-700 px-4 py-3 rounded-lg font-medium hover:bg-gray-300 transition flex items-center justify-center space-x-2 w-full sm:w-auto"
            >
              <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-sm sm:text-base">PDF Settings</span>
            </motion.button>
          </div>

          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 p-4 bg-gray-50 rounded-lg"
            >
              <h3 className="text-lg font-semibold mb-4">PDF Generation Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quality
                  </label>
                  <select
                    value={pdfOptions.quality}
                    onChange={(e) => setPdfOptions({ ...pdfOptions, quality: e.target.value as 'high' | 'medium' | 'low' })}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="high">High (300 DPI)</option>
                    <option value="medium">Medium (200 DPI)</option>
                    <option value="low">Low (150 DPI)</option>
                  </select>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="includeSignature"
                    checked={pdfOptions.includeSignature}
                    onChange={(e) => setPdfOptions({ ...pdfOptions, includeSignature: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="includeSignature" className="text-sm font-medium text-gray-700">
                    Include Digital Signature
                  </label>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Watermark (optional)
                  </label>
                  <input
                    type="text"
                    value={pdfOptions.watermark}
                    onChange={(e) => setPdfOptions({ ...pdfOptions, watermark: e.target.value })}
                    placeholder="Enter watermark text"
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-5xl mx-auto bg-white rounded-xl sm:rounded-2xl shadow-lg overflow-hidden"
        >
          <FitSheet>
          <PdfDocument
            clientInfo={clientInfo}
            modules={modules}
            quotationId={quotationId}
            tax={tax}
            discountRate={discountRate}
            subtotal={subtotal}
            taxAmount={taxAmount}
            discountAmount={discountAmount}
            grandTotal={grandTotal}
            termsAndConditions={termsAndConditions}
            documentType={documentType}
            issuedAt={issuedAt}
            validUntil={validUntil}
            notes={notes}
            gstDetails={gstDetails}
            includeSignature={pdfOptions.includeSignature}
          />
          </FitSheet>
        </motion.div>

        {waNotice && (
          <div className="max-w-5xl mx-auto mt-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded-lg text-sm flex items-center justify-between">
            <span>{waNotice}</span>
            <button onClick={() => setWaNotice('')} className="text-green-600 hover:text-green-900 font-bold ml-2">×</button>
          </div>
        )}

        <WhatsAppModal
          isOpen={showWhatsAppModal}
          onClose={() => setShowWhatsAppModal(false)}
          quotationId={quotationId}
          initialPhone={clientInfo.clientMobile || ''}
          clientName={clientInfo.clientName}
          grandTotal={grandTotal}
          currency={clientInfo.currency || 'INR'}
          publicToken={publicToken || ''}
          isDraft={!['sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted'].includes(status)}
          pdfBase64={waPdfBase64}
          filename={`${quotationId || 'Quotation'}.pdf`}
          onIssueQuotation={handleExplicitIssue}
          onSuccess={(notice) => setWaNotice(notice)}
        />
      </div>
    </div>
  );
}
