import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Eye, Trash2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/currency';
import { useQuotationStore } from '../store/quotationStore';

interface SavedQuotation {
  id: string;
  clientName: string;
  projectName: string;
  date: string;
  total: number;
  status: string;
  clientInfo: any;
  modules: any[];
  buffer: number;
  tax: number;
  subtotal: number;
  bufferAmount: number;
  taxAmount: number;
  grandTotal: number;
}

export default function History() {
  const navigate = useNavigate();
  const { reset } = useQuotationStore();
  const [quotations, setQuotations] = useState<SavedQuotation[]>([]);

  useEffect(() => {
    loadQuotations();
  }, []);

  const loadQuotations = () => {
    const saved = JSON.parse(localStorage.getItem('quotations') || '[]');
    setQuotations(saved);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this quotation?')) {
      const updated = quotations.filter((q) => q.id !== id);
      localStorage.setItem('quotations', JSON.stringify(updated));
      setQuotations(updated);
    }
  };

  const handleNewQuotation = () => {
    reset();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 py-12">
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
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition flex items-center space-x-2"
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
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition"
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
    </div>
  );
}
