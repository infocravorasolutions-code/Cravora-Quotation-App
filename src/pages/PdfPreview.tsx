import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { useQuotationStore } from '../store/quotationStore';
import { formatCurrency } from '../utils/currency';
import { generatePDF } from '../utils/pdfGenerator';

export default function PdfPreview() {
  const navigate = useNavigate();
  const {
    clientInfo,
    modules,
    quotationId,
    buffer,
    tax,
    getSubtotal,
    getBufferAmount,
    getTaxAmount,
    getGrandTotal,
    reset,
  } = useQuotationStore();

  const handleDownload = async () => {
    await generatePDF('pdf-content', `${quotationId}.pdf`);

    const quotation = {
      id: quotationId,
      clientName: clientInfo.clientName,
      projectName: clientInfo.projectName,
      date: new Date().toISOString(),
      total: getGrandTotal(),
      status: 'Sent',
      clientInfo,
      modules,
      buffer,
      tax,
      subtotal: getSubtotal(),
      bufferAmount: getBufferAmount(),
      taxAmount: getTaxAmount(),
      grandTotal: getGrandTotal(),
    };

    const existing = JSON.parse(localStorage.getItem('quotations') || '[]');
    localStorage.setItem('quotations', JSON.stringify([...existing, quotation]));

    alert('Quotation saved successfully!');
    reset();
    navigate('/history');
  };

  const subtotal = getSubtotal();
  const bufferAmount = getBufferAmount();
  const taxAmount = getTaxAmount();
  const grandTotal = getGrandTotal();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 py-12">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto mb-6">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleDownload}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition flex items-center space-x-2"
          >
            <Download className="w-5 h-5" />
            <span>Download PDF & Save</span>
          </motion.button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-5xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden"
        >
          <div id="pdf-content" className="p-12">
            <div className="flex items-center justify-between mb-8 pb-6 border-b-2 border-gray-200">
              <div className="flex items-center space-x-3">
                <FileText className="w-12 h-12 text-blue-600" />
                <div>
                  <h1 className="text-3xl font-bold text-gray-800">QuoteGen</h1>
                  <p className="text-gray-600">Professional Quotation System</p>
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
                  {modules.map((module, index) => (
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
                  ))}
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
                  <span className="text-gray-700">Buffer ({buffer}%)</span>
                  <span className="font-medium text-gray-800">
                    {formatCurrency(bufferAmount, clientInfo.currency)}
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
