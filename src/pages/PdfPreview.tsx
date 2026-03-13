import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, Save, Settings } from 'lucide-react';
import { useQuotationStore } from '../store/quotationStore';
import { generatePDF, PDFOptions } from '../utils/pdfGenerator';
import { useState } from 'react';
import ProgressStepper from '../components/ProgressStepper';
import PdfDocument from '../components/PdfDocument';
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
  } = useQuotationStore();

  const [pdfOptions, setPdfOptions] = useState<PDFOptions>({
    quality: 'high',
    includeSignature: false,
    watermark: '',
  });
  const [showSettings, setShowSettings] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

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

      try {
        const res = await fetch(`http://localhost:5000/api/quotations/${quotationId}`);
        if (res.ok) {
          await fetch(`http://localhost:5000/api/quotations/${quotationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quotation),
          });
        } else {
          await fetch('http://localhost:5000/api/quotations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quotation),
          });
        }
      } catch (error) {
        console.error('Failed to save final quotation', error);
      }

      markAsFinal();
      alert('Quotation saved successfully!');
      reset();
      navigate('/history');
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveDraft = () => {
    saveDraft();
    alert('Draft saved successfully!');
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
          <ProgressStepper currentStep={4} />
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
                onClick={handleSaveDraft}
                className="bg-gray-600 text-white px-4 sm:px-6 py-3 rounded-lg font-medium hover:bg-gray-700 transition flex items-center justify-center space-x-2 w-full sm:w-auto"
              >
                <Save className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-sm sm:text-base">Save Draft</span>
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
                    onChange={(e) => setPdfOptions({ ...pdfOptions, quality: e.target.value as any })}
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
          />
        </motion.div>
      </div>
    </div>
  );
}
