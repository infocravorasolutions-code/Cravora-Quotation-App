import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText } from 'lucide-react';
import { useQuotationStore } from '../store/quotationStore';
import { formatCurrency, convertUSDToINR } from '../utils/currency';

export default function Summary() {
  const navigate = useNavigate();
  const {
    clientInfo,
    modules,
    buffer,
    tax,
    setBuffer,
    setTax,
    getSubtotal,
    getBufferAmount,
    getTaxAmount,
    getGrandTotal,
  } = useQuotationStore();

  const [inrEquivalent, setInrEquivalent] = useState<number | null>(null);

  useEffect(() => {
    if (clientInfo.currency === 'USD') {
      const fetchConversion = async () => {
        const inr = await convertUSDToINR(getGrandTotal());
        setInrEquivalent(inr);
      };
      fetchConversion();
    }
  }, [clientInfo.currency, getGrandTotal]);

  const subtotal = getSubtotal();
  const bufferAmount = getBufferAmount();
  const taxAmount = getTaxAmount();
  const grandTotal = getGrandTotal();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 py-12">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-5xl mx-auto"
        >
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              Quotation Summary
            </h1>
            <p className="text-gray-600 mb-8">
              Review and finalize your quotation for {clientInfo.projectName}
            </p>

            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Client Information
              </h2>
              <div className="bg-gray-50 rounded-lg p-6 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Client:</span>
                  <span className="font-medium text-gray-800">
                    {clientInfo.clientName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Email:</span>
                  <span className="font-medium text-gray-800">
                    {clientInfo.clientEmail}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Project:</span>
                  <span className="font-medium text-gray-800">
                    {clientInfo.projectName}
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Modules</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">
                        Module
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">
                        Hours
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">
                        Rate
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((module) => (
                      <tr key={module.id} className="border-b border-gray-100">
                        <td className="py-3 px-4">
                          <div>
                            <div className="font-medium text-gray-800">
                              {module.name}
                            </div>
                            {module.description && (
                              <div className="text-sm text-gray-500">
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
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Calculations
              </h2>
              <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Subtotal</span>
                  <span className="font-medium text-gray-800">
                    {formatCurrency(subtotal, clientInfo.currency)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <label className="text-gray-700">Buffer</label>
                    <input
                      type="number"
                      value={buffer}
                      onChange={(e) => setBuffer(parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.5"
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-right"
                    />
                    <span className="text-gray-700">%</span>
                  </div>
                  <span className="font-medium text-gray-800">
                    {formatCurrency(bufferAmount, clientInfo.currency)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <label className="text-gray-700">Tax</label>
                    <input
                      type="number"
                      value={tax}
                      onChange={(e) => setTax(parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.5"
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-right"
                    />
                    <span className="text-gray-700">%</span>
                  </div>
                  <span className="font-medium text-gray-800">
                    {formatCurrency(taxAmount, clientInfo.currency)}
                  </span>
                </div>

                <div className="border-t-2 border-gray-300 pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xl font-semibold text-gray-800">
                      Grand Total
                    </span>
                    <span className="text-2xl font-bold text-blue-600">
                      {formatCurrency(grandTotal, clientInfo.currency)}
                    </span>
                  </div>
                </div>

                {clientInfo.currency === 'USD' && inrEquivalent && (
                  <div className="bg-blue-50 rounded-lg p-4 mt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Equivalent in INR</span>
                      <span className="font-semibold text-gray-800">
                        {formatCurrency(inrEquivalent, 'INR')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/modules')}
                className="bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-300 transition flex items-center space-x-2"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Edit Modules</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/pdf-preview')}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition flex items-center space-x-2"
              >
                <FileText className="w-5 h-5" />
                <span>Generate PDF Preview</span>
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
