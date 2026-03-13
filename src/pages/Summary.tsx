import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText, Save, Plus, Trash2 } from 'lucide-react';
import { useQuotationStore } from '../store/quotationStore';
import { formatCurrency, convertUSDToINR } from '../utils/currency';
import ProgressStepper from '../components/ProgressStepper';
import GSTConfiguration from '../components/GSTConfiguration';
import { useAutoSave } from '../hooks/useAutoSave';

export default function Summary() {
  const navigate = useNavigate();
  const {
    clientInfo,
    modules,
    gstDetails,
    discountRate,
    setDiscountRate,
    updateGstAmounts,
    getSubtotal,
    getDiscountAmount,
    getGstAmount,
    getGrandTotal,
    saveDraft,
    termsAndConditions,
    setTermsAndConditions,
    documentType,
    setDocumentType,
    generateQuotationId,
  } = useQuotationStore();

  // Auto-save functionality
  useAutoSave(30000); // Auto-save every 30 seconds

  // Update GST amounts when modules or GST details change
  useEffect(() => {
    updateGstAmounts();
  }, [modules, gstDetails.gstRate, gstDetails.gstType, discountRate, updateGstAmounts]);

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
  const gstAmount = getGstAmount();
  const grandTotal = getGrandTotal();

  // Debug: Log modules to console (removed to prevent performance issues)

  const handleSaveDraft = () => {
    saveDraft();
    alert('Draft saved successfully!');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-50 py-2 sm:py-8 lg:py-12">
      <div className="container mx-auto px-2 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-6xl mx-auto"
        >
          {/* Progress Stepper */}
          <div className="mb-6 sm:mb-8">
            <ProgressStepper currentStep={3} />
          </div>

          <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-2 sm:p-6 lg:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 space-y-4 sm:space-y-0">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
                  Quotation Summary
                </h1>
                <p className="text-sm sm:text-base text-gray-600">
                  Review and finalize your quotation for {clientInfo.projectName}
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveDraft}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-700 transition flex items-center justify-center space-x-2 w-full sm:w-auto"
              >
                <Save className="w-4 h-4" />
                <span>Save Draft</span>
              </motion.button>
            </div>

            <div className="mb-6 sm:mb-8">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-800 mb-4">
                Client Information
              </h2>
              <div className="bg-gray-50 rounded-lg p-4 sm:p-6 space-y-2">
                <div className="flex flex-col sm:flex-row sm:justify-between space-y-1 sm:space-y-0">
                  <span className="text-gray-600 text-sm sm:text-base">Client:</span>
                  <span className="font-medium text-gray-800 text-sm sm:text-base">
                    {clientInfo.clientName}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between space-y-1 sm:space-y-0">
                  <span className="text-gray-600 text-sm sm:text-base">Email:</span>
                  <span className="font-medium text-gray-800 text-sm sm:text-base break-all">
                    {clientInfo.clientEmail}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between space-y-1 sm:space-y-0">
                  <span className="text-gray-600 text-sm sm:text-base">Project:</span>
                  <span className="font-medium text-gray-800 text-sm sm:text-base">
                    {clientInfo.projectName}
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-6 sm:mb-8">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-800 mb-4">Modules</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-2 sm:py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">
                        Module
                      </th>
                      <th className="text-right py-2 sm:py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">
                        Hours
                      </th>
                      <th className="text-right py-2 sm:py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">
                        Rate
                      </th>
                      <th className="text-right py-2 sm:py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {modules.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-500">
                          <div className="flex flex-col items-center space-y-2">
                            <div className="text-lg font-medium">No modules added yet</div>
                            <div className="text-sm">Go back to Modules page to add services</div>
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => navigate('/modules')}
                              className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition"
                            >
                              Add Modules
                            </motion.button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      modules.map((module) => (
                        <tr key={module.id} className="border-b border-gray-100">
                          <td className="py-2 sm:py-3 px-2 sm:px-4">
                            <div>
                              <div className="font-medium text-gray-800 text-xs sm:text-sm">
                                {module.name}
                              </div>
                              {module.description && (
                                <div className="text-xs sm:text-sm text-gray-500">
                                  {module.description}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="text-right py-2 sm:py-3 px-2 sm:px-4 text-gray-700 text-xs sm:text-sm">
                            {module.hours}
                          </td>
                          <td className="text-right py-2 sm:py-3 px-2 sm:px-4 text-gray-700 text-xs sm:text-sm">
                            {formatCurrency(module.rate, clientInfo.currency)}
                          </td>
                          <td className="text-right py-2 sm:py-3 px-2 sm:px-4 font-medium text-gray-800 text-xs sm:text-sm">
                            {formatCurrency(module.total, clientInfo.currency)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Document Type Selection */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Document Type</h2>
              <div className="flex gap-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={documentType === 'Quotation'}
                    onChange={async () => {
                      setDocumentType('Quotation');
                      await generateQuotationId();
                    }}
                    className="w-4 h-4 text-cravora-purple focus:ring-cravora-purple border-gray-300"
                  />
                  <span className="text-gray-700 font-medium">Quotation</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={documentType === 'Billing'}
                    onChange={async () => {
                      setDocumentType('Billing');
                      await generateQuotationId();
                    }}
                    className="w-4 h-4 text-cravora-purple focus:ring-cravora-purple border-gray-300"
                  />
                  <span className="text-gray-700 font-medium">Billing</span>
                </label>
              </div>
            </div>

            {/* GST Configuration */}
            <div className="mb-8">
              <GSTConfiguration />
            </div>

            {/* Editable Terms & Conditions */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800">Terms and Conditions</h2>
                <button
                  onClick={() => setTermsAndConditions([...termsAndConditions, ''])}
                  className="flex items-center space-x-1 text-sm text-cravora-purple hover:text-cravora-purple-dark font-medium"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Term</span>
                </button>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 sm:p-6 space-y-3">
                {termsAndConditions.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center">No Terms & Conditions specified.</p>
                ) : (
                  termsAndConditions.map((term, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      <span className="text-gray-500 mt-2 font-medium">{index + 1}.</span>
                      <textarea
                        value={term}
                        onChange={(e) => {
                          const newTerms = [...termsAndConditions];
                          newTerms[index] = e.target.value;
                          setTermsAndConditions(newTerms);
                        }}
                        className="flex-1 min-h-[40px] px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-cravora-purple focus:border-transparent resize-y"
                        placeholder="Enter term details..."
                      />
                      <button
                        onClick={() => {
                          const newTerms = termsAndConditions.filter((_, i) => i !== index);
                          setTermsAndConditions(newTerms);
                        }}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded hover:bg-red-50"
                        title="Remove term"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
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
                    <span className="text-gray-700">Discount (%)</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={discountRate}
                      onChange={(e) => setDiscountRate(Number(e.target.value))}
                      className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-cravora-purple focus:border-transparent text-sm"
                    />
                  </div>
                  <span className="font-medium text-green-600">
                    -{formatCurrency(getDiscountAmount(), clientInfo.currency)}
                  </span>
                </div>

                {/* GST Breakdown */}
                {gstDetails.gstType === 'intra' ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">CGST ({gstDetails.cgstRate}%)</span>
                      <span className="font-medium text-gray-800">
                        {formatCurrency(gstDetails.cgstAmount, clientInfo.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">SGST ({gstDetails.sgstRate}%)</span>
                      <span className="font-medium text-gray-800">
                        {formatCurrency(gstDetails.sgstAmount, clientInfo.currency)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">IGST ({gstDetails.igstRate}%)</span>
                    <span className="font-medium text-gray-800">
                      {formatCurrency(gstDetails.igstAmount, clientInfo.currency)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center border-t pt-2">
                  <span className="text-gray-700 font-semibold">Total GST</span>
                  <span className="font-semibold text-gray-800">
                    {formatCurrency(gstAmount, clientInfo.currency)}
                  </span>
                </div>

                <div className="border-t-2 border-gray-300 pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xl font-semibold text-gray-800">
                      Grand Total
                    </span>
                    <span className="text-2xl font-bold text-cravora-purple">
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

            <div className="flex flex-col sm:flex-row justify-between mt-6 sm:mt-8 space-y-4 sm:space-y-0">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/modules')}
                className="bg-gray-200 text-gray-700 px-4 sm:px-6 py-3 rounded-lg font-medium hover:bg-gray-300 transition flex items-center justify-center space-x-2 w-full sm:w-auto"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-sm sm:text-base">Edit Modules</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/pdf-preview')}
                className="bg-cravora-purple text-white px-4 sm:px-6 py-3 rounded-lg font-medium hover:bg-cravora-purple-dark transition flex items-center justify-center space-x-2 w-full sm:w-auto"
              >
                <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-sm sm:text-base">Generate PDF Preview</span>
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
