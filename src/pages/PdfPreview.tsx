import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, Save, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { useQuotationStore } from '../store/quotationStore';
import { formatCurrency } from '../utils/currency';
import { generatePDF, PDFOptions } from '../utils/pdfGenerator';
import { numberToWords } from '../utils/numberToWords';
import { useState } from 'react';
import ProgressStepper from '../components/ProgressStepper';

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
  const discountAmount = getDiscountAmount();
  const grandTotal = getGrandTotal();

  // Dynamic PDF chunking logic to maximize space usage per A4 page
  const calculatePages = () => {
    const PAGES: { modules: any[]; pageNum: number; isFirstPage: boolean; isLastPage: boolean; startIndex: number }[] = [];
    let currentModules: any[] = [];
    let currentHeight = 0;

    // Pixel equivalents of 297mm A4 at 96 DPI
    const MAX_PAGE_HEIGHT = 1050; // Leave some margin

    // Estimated Heights in px
    const FIRST_PAGE_HEADER = 480;
    const NORMAL_PAGE_HEADER = 64;
    const TABLE_HEADER = 50;
    const FOOTER = 350;
    const ROW_BASE = 53;
    const DESC_LINE = 18;
    const CHARS_PER_LINE = 65;

    let isFirstPage = true;
    let pageNum = 1;
    let absoluteStartIndex = 0;

    currentHeight = FIRST_PAGE_HEADER + TABLE_HEADER;

    for (let i = 0; i < modules.length; i++) {
      const module = modules[i];

      // Estimate row height
      let rowHeight = ROW_BASE;
      if (module.description) {
        const lines = module.description.split('\n').reduce((acc: number, text: string) => acc + (Math.ceil(text.length / CHARS_PER_LINE) || 1), 0);
        rowHeight += lines * DESC_LINE;
        rowHeight += 8; // mb-1 margin above description
      }

      const isLastModule = i === modules.length - 1;

      // Check if row fits on current page
      if (currentHeight + rowHeight > MAX_PAGE_HEIGHT && currentModules.length > 0) {
        PAGES.push({
          modules: currentModules,
          pageNum: pageNum++,
          isFirstPage: isFirstPage,
          isLastPage: false,
          startIndex: absoluteStartIndex
        });
        absoluteStartIndex += currentModules.length;
        currentModules = [];
        isFirstPage = false;
        currentHeight = NORMAL_PAGE_HEADER + TABLE_HEADER;
      }

      // If it's the last module, check if the footer forces a new page anyway
      if (isLastModule && currentHeight + rowHeight <= MAX_PAGE_HEIGHT && currentHeight + rowHeight + FOOTER > MAX_PAGE_HEIGHT) {
        currentModules.push(module);
        currentHeight += rowHeight;
        PAGES.push({
          modules: currentModules,
          pageNum: pageNum++,
          isFirstPage: isFirstPage,
          isLastPage: false,
          startIndex: absoluteStartIndex
        });
        absoluteStartIndex += currentModules.length;
        currentModules = [];
        isFirstPage = false;
        currentHeight = NORMAL_PAGE_HEADER + TABLE_HEADER;
        break;
      }

      currentModules.push(module);
      currentHeight += rowHeight;
    }

    // Always push the final page (even if currentModules is empty, it needs to hold the footer)
    PAGES.push({
      modules: currentModules,
      pageNum: pageNum,
      isFirstPage: isFirstPage,
      isLastPage: true,
      startIndex: absoluteStartIndex
    });

    return PAGES;
  };

  const pages = calculatePages();

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
            className="flex flex-col bg-gray-100"
            style={{
              fontFamily: "'Poppins', sans-serif",
              fontSize: '12px',
              lineHeight: '1.5',
              width: '210mm',
              margin: '0 auto',
              color: '#333'
            }}
          >
            {pages.map((pageChunk) => (
              <div
                key={`page-${pageChunk.pageNum}`}
                className="p-8 relative bg-white"
                style={{
                  width: '210mm',
                  height: '297mm', // Exact A4 height to perfectly align with jsPDF slicing inside pdfGenerator
                  overflow: 'hidden',
                  position: 'relative',
                  pageBreakAfter: pageChunk.isLastPage ? 'auto' : 'always',
                  marginBottom: pageChunk.isLastPage ? '0' : '2rem', // visual gap between pages in preview
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
                }}
              >
                {pageChunk.isFirstPage && (
                  <>
                    {/* Header Section */}
                    <div className="flex items-start justify-between mb-8">
                      <div className="flex flex-col gap-4">
                        <h1 className="text-4xl font-bold text-cravora-purple">
                          {documentType === 'Billing' ? 'Billing' : 'Quotation'}
                        </h1>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mt-2">
                          <span className="text-gray-500 font-medium whitespace-nowrap">
                            {documentType === 'Billing' ? 'Billing#' : 'Quotation#'}
                          </span>
                          <span className="font-bold text-gray-800">{quotationId}</span>
                          <span className="text-gray-500 font-medium whitespace-nowrap">
                            {documentType === 'Billing' ? 'Billing Date' : 'Quotation Date'}
                          </span>
                          <span className="font-bold text-gray-800 uppercase">{format(new Date(), 'MMM dd, yyyy')}</span>
                        </div>
                      </div>

                      {/* Company Branding & Logo Right */}
                      <div className="flex items-start justify-end pr-12 mt-2">
                        <img src="/logo-header.png" alt="Company Logo" className="w-[160px] h-auto object-contain" />
                      </div>
                    </div>

                    {/* Information Boxes */}
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      {/* Quotation by / Billing by */}
                      <div className="bg-gray-50 p-6 rounded-lg">
                        <h2 className="text-lg text-cravora-purple mb-2">
                          {documentType === 'Billing' ? 'Billing by' : 'Quotation by'}
                        </h2>
                        <div className="font-bold text-gray-800 mb-1">Cravora Solutions</div>
                        <div className="text-gray-600 mb-3 whitespace-pre-line">
                          {clientInfo.companyAddress || 'Default Company Address Here'}
                        </div>
                        <div className="grid grid-cols-[60px_1fr] gap-x-2 text-sm">
                          <span className="font-bold text-gray-800 text-xs">GSTIN</span>
                          <span className="text-gray-600 uppercase">{clientInfo.gstNumber || 'N/A'}</span>
                          <span className="font-bold text-gray-800 text-xs">PAN</span>
                          <span className="text-gray-600 uppercase">{clientInfo.companyPan || 'N/A'}</span>
                        </div>
                      </div>

                      {/* Quotation to / Billing to */}
                      <div className="bg-gray-50 p-6 rounded-lg">
                        <h2 className="text-lg text-cravora-purple mb-2">
                          {documentType === 'Billing' ? 'Billing to' : 'Quotation to'}
                        </h2>
                        <div className="font-bold text-gray-800 mb-1">{clientInfo.clientName}</div>
                        <div className="text-gray-600 mb-3 whitespace-pre-line">
                          {clientInfo.clientAddress || 'Client Address Not Provided'}
                        </div>
                        <div className="grid grid-cols-[60px_1fr] gap-x-2 text-sm">
                          <span className="font-bold text-gray-800 text-xs">GSTIN</span>
                          <span className="text-gray-600 uppercase">{clientInfo.clientGstNumber || 'N/A'}</span>
                          <span className="font-bold text-gray-800 text-xs">PAN</span>
                          <span className="text-gray-600 uppercase">{clientInfo.clientPan || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Supply Information Row */}
                    <div className="flex justify-between px-6 py-2 mb-4 text-sm font-medium border-b border-gray-100">
                      <div className="flex space-x-2 border-r border-gray-200 pr-12 w-1/2 justify-center">
                        <span className="text-gray-500">Place of Supply</span>
                        <span className="font-bold text-gray-800">{clientInfo.placeOfSupply || 'N/A'}</span>
                      </div>
                      <div className="flex space-x-2 pl-12 w-1/2 justify-center">
                        <span className="text-gray-500">Country of Supply</span>
                        <span className="font-bold text-gray-800">{clientInfo.countryOfSupply || 'N/A'}</span>
                      </div>
                    </div>
                  </>
                )}

                {/* Item Table (Repeats per chunk page) */}
                <div className={`mb-6 rounded-lg overflow-hidden border border-gray-200 ${!pageChunk.isFirstPage ? 'mt-8' : ''}`}>
                  <table className="w-full text-left">
                    <thead className="bg-cravora-purple text-white">
                      <tr>
                        <th className="py-3 px-4 font-normal text-sm w-[45%]">Item #/Item description</th>
                        <th className="py-3 px-4 font-normal text-sm text-center">Qty.</th>
                        <th className="py-3 px-4 font-normal text-sm text-right">Rate</th>
                        <th className="py-3 px-4 font-normal text-sm text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {pageChunk.modules.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-gray-500">
                            No modules added
                          </td>
                        </tr>
                      ) : (
                        pageChunk.modules.map((module, index) => {
                          const absoluteIndex = pageChunk.startIndex + index;

                          return (
                            <tr key={module.id} className="align-top">
                              <td className="py-4 px-4 font-medium text-gray-800">
                                <div className="mb-1">{absoluteIndex + 1}. {module.name}</div>
                                {module.description && (
                                  <div className="text-gray-500 font-normal text-xs ml-4 leading-relaxed whitespace-pre-wrap break-words">
                                    {module.description}
                                  </div>
                                )}
                              </td>
                              <td className="py-4 px-4 text-center text-gray-800">
                                {module.hours}
                              </td>
                              <td className="py-4 px-4 text-right text-gray-800">
                                {formatCurrency(module.rate, clientInfo.currency)}
                              </td>
                              <td className="py-4 px-4 text-right font-medium text-gray-800">
                                {formatCurrency(module.total, clientInfo.currency)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {pageChunk.isLastPage && (
                  <div className="mt-8">
                    {/* Footer Section Grid */}
                    <div className="grid grid-cols-2 gap-8 mb-4 border-b border-gray-200 relative pb-6">
                      {/* Left Side: T&C and Notes */}
                      <div>
                        <div className="mb-6">
                          <h3 className="font-bold text-cravora-purple text-base mb-2">
                            Terms and Conditions
                          </h3>
                          <ol className="list-decimal list-inside space-y-2 text-gray-600 text-xs text-left">
                            {termsAndConditions.map((term, i) => (
                              term.trim() !== '' && <li key={i}>{term}</li>
                            ))}
                          </ol>
                        </div>
                      </div>

                      {/* Right Side: Pricing Summary */}
                      <div>
                        <div className="space-y-3 mb-4 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-700">Sub Total</span>
                            <span className="font-medium text-gray-800 whitespace-nowrap">
                              {formatCurrency(subtotal, clientInfo.currency)}
                            </span>
                          </div>

                          {discountRate > 0 && (
                            <div className="flex justify-between text-[#28a745]">
                              <span>Discount({discountRate}%)</span>
                              <span className="whitespace-nowrap">
                                - {formatCurrency(discountAmount, clientInfo.currency)}
                              </span>
                            </div>
                          )}

                          {taxAmount > 0 && (
                            <div className="flex justify-between text-gray-600">
                              <span>Tax ({tax}%)</span>
                              <span className="whitespace-nowrap">
                                + {formatCurrency(taxAmount, clientInfo.currency)}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-between items-center border-t border-gray-200 pt-3 mb-4">
                          <span className="text-lg text-gray-800">Total</span>
                          <span className="text-2xl font-bold text-gray-900 whitespace-nowrap">
                            {formatCurrency(grandTotal, clientInfo.currency)}
                          </span>
                        </div>

                        <div>
                          <span className="text-gray-400 text-xs block mb-1">Invoice Total (in words)</span>
                          <span className="font-medium text-gray-800 text-sm block">
                            {clientInfo.currency === 'INR' ? numberToWords(grandTotal) : numberToWords(grandTotal).replace('Rupees Only', 'Dollars Only')}
                          </span>
                        </div>
                      </div>

                      {/* Decorative background bottom matching the purple gradient blur effect */}
                      <div
                        className="absolute -bottom-8 -left-8 -right-8 h-16 bg-gradient-to-t from-cravora-purple/10 to-transparent pointer-events-none"
                        style={{ borderRadius: '0 0 1rem 1rem' }}
                      />
                    </div>
                  </div>
                )}

                {/* Absolute Footer Area for all pages */}
                <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-cravora-purple/80">
                  For any enquiries, email us on <span className="font-bold text-cravora-purple">info@cravorasolutions.com</span> or call us on <span className="font-bold text-cravora-purple">+91 95123 62944</span>
                </div>

                {/* Page number indicator for generated preview */}
                {/* <div className="absolute bottom-4 right-8 text-xs text-gray-400">
                  Page {pageChunk.pageNum} of {pages.length}
                </div> */}

              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
