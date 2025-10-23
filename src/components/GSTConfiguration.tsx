import { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, MapPin, Receipt } from 'lucide-react';
import { useQuotationStore, GSTDetails } from '../store/quotationStore';

export default function GSTConfiguration() {
  const { clientInfo, gstDetails, setClientInfo, setGstDetails } = useQuotationStore();
  const [showGstConfig, setShowGstConfig] = useState(false);

  const gstRates = [
    { rate: 0, label: '0% (Exempt)' },
    { rate: 5, label: '5%' },
    { rate: 12, label: '12%' },
    { rate: 18, label: '18%' },
    { rate: 28, label: '28%' },
  ];

  const handleGstTypeChange = (type: 'intra' | 'inter') => {
    const newGstDetails: GSTDetails = {
      ...gstDetails,
      gstType: type,
      cgstRate: type === 'intra' ? gstDetails.gstRate / 2 : 0,
      sgstRate: type === 'intra' ? gstDetails.gstRate / 2 : 0,
      igstRate: type === 'inter' ? gstDetails.gstRate : 0,
    };
    setGstDetails(newGstDetails);
  };

  const handleGstRateChange = (rate: number) => {
    const newGstDetails: GSTDetails = {
      ...gstDetails,
      gstRate: rate,
      cgstRate: gstDetails.gstType === 'intra' ? rate / 2 : 0,
      sgstRate: gstDetails.gstType === 'intra' ? rate / 2 : 0,
      igstRate: gstDetails.gstType === 'inter' ? rate : 0,
    };
    setGstDetails(newGstDetails);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Receipt className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-800">GST Configuration</h3>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowGstConfig(!showGstConfig)}
          className="text-blue-600 hover:text-blue-700 text-sm font-medium"
        >
          {showGstConfig ? 'Hide' : 'Configure'}
        </motion.button>
      </div>

      {showGstConfig && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-6"
        >
          {/* GST Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              GST Type
            </label>
            <div className="grid grid-cols-2 gap-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleGstTypeChange('intra')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  gstDetails.gstType === 'intra'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-center">
                  <div className="font-semibold">Intra-State</div>
                  <div className="text-sm text-gray-600">CGST + SGST</div>
                </div>
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleGstTypeChange('inter')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  gstDetails.gstType === 'inter'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-center">
                  <div className="font-semibold">Inter-State</div>
                  <div className="text-sm text-gray-600">IGST</div>
                </div>
              </motion.button>
            </div>
          </div>

          {/* GST Rate Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              GST Rate
            </label>
            <div className="grid grid-cols-5 gap-2">
              {gstRates.map((rate) => (
                <motion.button
                  key={rate.rate}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleGstRateChange(rate.rate)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    gstDetails.gstRate === rate.rate
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-center">
                    <div className="font-semibold">{rate.rate}%</div>
                    <div className="text-xs text-gray-600">{rate.label}</div>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Company GST Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company GST Number
              </label>
              <input
                type="text"
                value={clientInfo.gstNumber || ''}
                onChange={(e) => setClientInfo({ ...clientInfo, gstNumber: e.target.value })}
                placeholder="22AAAAA0000A1Z5"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client GST Number
              </label>
              <input
                type="text"
                value={clientInfo.clientGstNumber || ''}
                onChange={(e) => setClientInfo({ ...clientInfo, clientGstNumber: e.target.value })}
                placeholder="22BBBBB0000B1Z5"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Addresses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Address
              </label>
              <textarea
                value={clientInfo.companyAddress || ''}
                onChange={(e) => setClientInfo({ ...clientInfo, companyAddress: e.target.value })}
                placeholder="Enter company address"
                rows={3}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client Address
              </label>
              <textarea
                value={clientInfo.clientAddress || ''}
                onChange={(e) => setClientInfo({ ...clientInfo, clientAddress: e.target.value })}
                placeholder="Enter client address"
                rows={3}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* GST Breakdown Preview */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 mb-3">GST Breakdown Preview</h4>
            <div className="space-y-2 text-sm">
              {gstDetails.gstType === 'intra' ? (
                <>
                  <div className="flex justify-between">
                    <span>CGST ({gstDetails.cgstRate}%):</span>
                    <span>₹{gstDetails.cgstAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>SGST ({gstDetails.sgstRate}%):</span>
                    <span>₹{gstDetails.sgstAmount.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between">
                  <span>IGST ({gstDetails.igstRate}%):</span>
                  <span>₹{gstDetails.igstAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-2">
                <span>Total GST:</span>
                <span>₹{gstDetails.totalGstAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
