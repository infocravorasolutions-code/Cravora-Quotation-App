import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Save } from 'lucide-react';
import { useQuotationStore } from '../store/quotationStore';
import ProgressStepper from '../components/ProgressStepper';
import { useAutoSave } from '../hooks/useAutoSave';

export default function ClientDetails() {
  const navigate = useNavigate();
  const { clientInfo, setClientInfo, generateQuotationId, saveDraft } = useQuotationStore();

  const [formData, setFormData] = useState(clientInfo);

  // Auto-save functionality
  useAutoSave(30000); // Auto-save every 30 seconds

  useEffect(() => {
    generateQuotationId();
  }, [generateQuotationId]);

  useEffect(() => {
    // Update store when form data changes
    setClientInfo(formData);
  }, [formData, setClientInfo]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setClientInfo(formData);
    navigate('/modules');
  };

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
          className="max-w-4xl mx-auto"
        >
          {/* Progress Stepper */}
          <div className="mb-6 sm:mb-8">
            <ProgressStepper currentStep={1} />
          </div>

          <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-2 sm:p-6 lg:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 space-y-3 sm:space-y-0">
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800 mb-1 sm:mb-2">
                  Client & Project Details
                </h1>
                <p className="text-xs sm:text-sm lg:text-base text-gray-600">
                  Enter the basic information to get started with your quotation
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

            <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-6">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                  Client Name *
                </label>
                <input
                  type="text"
                  name="clientName"
                  value={formData.clientName}
                  onChange={handleChange}
                  required
                  className="w-full px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm sm:text-base"
                  placeholder="Enter client name"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                  Client Email *
                </label>
                <input
                  type="email"
                  name="clientEmail"
                  value={formData.clientEmail}
                  onChange={handleChange}
                  required
                  className="w-full px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm sm:text-base"
                  placeholder="client@example.com"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                  Project Name *
                </label>
                <input
                  type="text"
                  name="projectName"
                  value={formData.projectName}
                  onChange={handleChange}
                  required
                  className="w-full px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm sm:text-base"
                  placeholder="Enter project name"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                  Project Description
                </label>
                <textarea
                  name="projectDescription"
                  value={formData.projectDescription}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none text-sm sm:text-base"
                  placeholder="Brief description of the project"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                  Client Address
                </label>
                <textarea
                  name="clientAddress"
                  value={formData.clientAddress || ''}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm sm:text-base"
                  placeholder="Enter client address"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                    Client GST Number
                  </label>
                  <input
                    type="text"
                    name="clientGstNumber"
                    value={formData.clientGstNumber || ''}
                    onChange={handleChange}
                    className="w-full px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm sm:text-base"
                    placeholder="22AAAAA0000A1Z5"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                    Client PAN Number
                  </label>
                  <input
                    type="text"
                    name="clientPan"
                    value={formData.clientPan || ''}
                    onChange={handleChange}
                    className="w-full px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm sm:text-base"
                    placeholder="ABCDE1234F"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                  Company Address
                </label>
                <textarea
                  name="companyAddress"
                  value={formData.companyAddress || ''}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm sm:text-base"
                  placeholder="Enter company address"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                    Company GST Number
                  </label>
                  <input
                    type="text"
                    name="gstNumber"
                    value={formData.gstNumber || ''}
                    onChange={handleChange}
                    className="w-full px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm sm:text-base"
                    placeholder="22BBBBB0000B1Z5"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                    Company PAN Number
                  </label>
                  <input
                    type="text"
                    name="companyPan"
                    value={formData.companyPan || ''}
                    onChange={handleChange}
                    className="w-full px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm sm:text-base"
                    placeholder="ABCDE1234F"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                    Currency *
                  </label>
                  <select
                    name="currency"
                    value={formData.currency}
                    onChange={handleChange}
                    className="w-full px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm sm:text-base"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                    Pricing Type *
                  </label>
                  <select
                    name="pricingType"
                    value={formData.pricingType}
                    onChange={handleChange}
                    className="w-full px-2 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm sm:text-base"
                  >
                    <option value="Hourly">Hourly</option>
                    <option value="Fixed">Fixed</option>
                  </select>
                </div>
              </div>

              <motion.button
                type="submit"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full bg-cravora-purple text-white py-3 rounded-lg font-medium hover:bg-cravora-purple-dark transition flex items-center justify-center space-x-2"
              >
                <span className="text-sm sm:text-base">Next: Add Modules</span>
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </motion.button>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
