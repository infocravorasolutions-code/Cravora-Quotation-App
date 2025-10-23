import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, Save, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { useQuotationStore } from '../store/quotationStore';
import { formatCurrency } from '../utils/currency';
import { generatePDF, PDFOptions } from '../utils/pdfGenerator';
import { useState } from 'react';
import ProgressStepper from '../components/ProgressStepper';

export default function PdfPreview() {
  const navigate = useNavigate();
  const {
    clientInfo,
    modules,
    quotationId,
    tax,
    getSubtotal,
    getTaxAmount,
    getGrandTotal,
    reset,
    saveDraft,
    markAsFinal,
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
        id: quotationId,
        clientName: clientInfo.clientName,
        projectName: clientInfo.projectName,
        date: new Date().toISOString(),
        total: getGrandTotal(),
        status: 'Sent',
        clientInfo,
        modules,
        tax,
        subtotal: getSubtotal(),
        taxAmount: getTaxAmount(),
        grandTotal: getGrandTotal(),
      };

      const existing = JSON.parse(localStorage.getItem('quotations') || '[]');
      localStorage.setItem('quotations', JSON.stringify([...existing, quotation]));

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
  const grandTotal = getGrandTotal();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 py-2 sm:py-8 lg:py-12">
      <div className="container mx-auto px-2 sm:px-6">
        {/* Progress Stepper */}
        <div className="max-w-6xl mx-auto mb-6 sm:mb-8">
          <ProgressStepper currentStep={4} />
        </div>
        
        <div className="max-w-5xl mx-auto mb-4 sm:mb-6">
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
          <div 
            id="pdf-content" 
            className="p-8" 
            style={{ 
              fontFamily: 'Arial, sans-serif', 
              fontSize: '14px',
              lineHeight: '1.4',
              minHeight: '800px',
              backgroundColor: 'white',
              width: '210mm',
              maxWidth: '210mm',
              margin: '0 auto'
            }}
          >
            <div className="flex items-center justify-between mb-8 pb-6 border-b-2 border-gray-200">
              <div className="flex items-center space-x-3">
                <img src="/logo.png" alt="Cravora Solutions" className="w-16 h-16" />
                <div>
                  <h1 className="text-3xl font-bold text-gray-800">Cravora Solutions</h1>
                  <p className="text-gray-600">Professional Quotation System</p>
                  {clientInfo.companyAddress && (
                    <div className="text-sm text-gray-500 mt-1">
                      {clientInfo.companyAddress}
                    </div>
                  )}
                  {clientInfo.gstNumber && (
                    <div className="text-sm text-gray-500">
                      GST: {clientInfo.gstNumber}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600">
                  {quotationId}
                </div>
                <div className="text-gray-600">
                  {format(new Date(), 'MMM dd, yyyy')}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                  Bill To
                </h2>
                <div className="space-y-1">
                  <div className="font-semibold text-gray-800 text-lg">
                    {clientInfo.clientName}
                  </div>
                  <div className="text-gray-600">{clientInfo.clientEmail}</div>
                  {clientInfo.clientAddress && (
                    <div className="text-gray-600 text-sm mt-2">
                      {clientInfo.clientAddress}
                    </div>
                  )}
                  {clientInfo.clientGstNumber && (
                    <div className="text-gray-600 text-sm">
                      GST: {clientInfo.clientGstNumber}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                  Project Details
                </h2>
                <div className="space-y-1">
                  <div className="font-semibold text-gray-800 text-lg">
                    {clientInfo.projectName}
                  </div>
                  <div className="text-gray-600">
                    {clientInfo.projectDescription}
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Modules & Services
              </h2>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 rounded-tl-lg">
                      Description
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">
                      Hours
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">
                      Rate
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700 rounded-tr-lg">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {modules.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-500">
                        <div className="text-lg font-medium">No modules added</div>
                        <div className="text-sm">Please go back and add some modules</div>
                      </td>
                    </tr>
                  ) : (
                    modules.map((module, index) => (
                      <tr
                        key={module.id}
                        className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                      >
                        <td className="py-3 px-4">
                          <div>
                            <div className="font-medium text-gray-800">
                              {module.name}
                            </div>
                            {module.description && (
                              <div className="text-sm text-gray-600">
                                {module.description}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="text-right py-3 px-4 text-gray-700">
                          {module.hours}
                        </td>
                        <td className="text-right py-3 px-4 text-gray-700">
                          {formatCurrency(module.rate, clientInfo.currency)}
                        </td>
                        <td className="text-right py-3 px-4 font-medium text-gray-800">
                          {formatCurrency(module.total, clientInfo.currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mb-8">
              <div className="w-80 space-y-3">
                <div className="flex justify-between py-2">
                  <span className="text-gray-700">Subtotal</span>
                  <span className="font-medium text-gray-800">
                    {formatCurrency(subtotal, clientInfo.currency)}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-700">Tax ({tax}%)</span>
                  <span className="font-medium text-gray-800">
                    {formatCurrency(taxAmount, clientInfo.currency)}
                  </span>
                </div>
                <div className="flex justify-between py-3 border-t-2 border-gray-300">
                  <span className="text-xl font-semibold text-gray-800">
                    Total
                  </span>
                  <span className="text-2xl font-bold text-blue-600">
                    {formatCurrency(grandTotal, clientInfo.currency)}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t-2 border-gray-200 pt-6">
              <h3 className="font-semibold text-gray-800 mb-3">
                Terms & Conditions
              </h3>
              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  <strong>Payment Terms:</strong> 50% advance, 50% upon
                  completion
                </p>
                <p>
                  <strong>Validity:</strong> This quotation is valid for 30 days
                  from the date of issue
                </p>
                <p>
                  <strong>Contact:</strong> For any queries, please reach out to
                  contact@quotegen.com
                </p>
              </div>
            </div>

            <div className="mt-8 text-center text-sm text-gray-500">
              <p>Thank you for your business!</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
