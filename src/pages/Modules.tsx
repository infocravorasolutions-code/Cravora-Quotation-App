import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Plus, Pencil, Trash2, Save } from 'lucide-react';
import { useQuotationStore, Module } from '../store/quotationStore';
import { formatCurrency } from '../utils/currency';
import ProgressStepper from '../components/ProgressStepper';
import { useAutoSave } from '../hooks/useAutoSave';

export default function Modules() {
  const navigate = useNavigate();
  const { clientInfo, modules, addModule, updateModule, deleteModule, getSubtotal, saveDraft } =
    useQuotationStore();
  
  // Auto-save functionality
  useAutoSave(30000); // Auto-save every 30 seconds

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    hours: '',
    rate: '',
  });

  const [editingId, setEditingId] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const hours = parseFloat(formData.hours);
    const rate = parseFloat(formData.rate);
    const total = hours * rate;

    const module: Module = {
      id: editingId || Date.now().toString(),
      name: formData.name,
      description: formData.description,
      hours,
      rate,
      total,
    };

    if (editingId) {
      updateModule(editingId, module);
      setEditingId(null);
    } else {
      addModule(module);
    }

    setFormData({ name: '', description: '', hours: '', rate: '' });
  };

  const handleEdit = (module: Module) => {
    setFormData({
      name: module.name,
      description: module.description,
      hours: module.hours.toString(),
      rate: module.rate.toString(),
    });
    setEditingId(module.id);
  };

  const handleDelete = (id: string) => {
    deleteModule(id);
  };

  const handleSaveDraft = () => {
    saveDraft();
    alert('Draft saved successfully!');
  };

  const handleNext = () => {
    if (modules.length === 0) {
      alert('Please add at least one module');
      return;
    }
    navigate('/summary');
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
            <ProgressStepper currentStep={2} />
          </div>
          
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-2 sm:p-6 lg:p-8 mb-4 sm:mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 space-y-4 sm:space-y-0">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Add Modules</h1>
                <p className="text-sm sm:text-base text-gray-600">
                  Define the work modules for {clientInfo.projectName}
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

            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 mb-6 sm:mb-8">
              <div className="grid grid-cols-1 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Module Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm sm:text-base"
                    placeholder="e.g., User Authentication System"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={2}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none text-sm sm:text-base"
                    placeholder="Optional module description"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Estimated Hours *
                    </label>
                    <input
                      type="number"
                      name="hours"
                      value={formData.hours}
                      onChange={handleChange}
                      required
                      min="0"
                      step="0.5"
                      className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm sm:text-base"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {clientInfo.pricingType === 'Hourly' ? 'Hourly Rate' : 'Fixed Rate'} *
                    </label>
                    <input
                      type="number"
                      name="rate"
                      value={formData.rate}
                      onChange={handleChange}
                      required
                      min="0"
                      step="0.01"
                      className="w-full px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm sm:text-base"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <motion.button
                type="submit"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition flex items-center justify-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span>{editingId ? 'Update Module' : 'Add Module'}</span>
              </motion.button>
            </form>

            {modules.length > 0 && (
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
                      <th className="text-center py-2 sm:py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((module) => (
                      <motion.tr
                        key={module.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="border-b border-gray-100 hover:bg-gray-50 transition"
                      >
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
                        <td className="text-center py-2 sm:py-3 px-2 sm:px-4">
                          <div className="flex items-center justify-center space-x-2">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleEdit(module)}
                              className="p-2 text-cravora-purple hover:bg-purple-50 rounded-lg transition"
                            >
                              <Pencil className="w-4 h-4" />
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleDelete(module.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </motion.button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-6 flex justify-end">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-600">Subtotal</div>
                    <div className="text-2xl font-bold text-gray-800">
                      {formatCurrency(getSubtotal(), clientInfo.currency)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row justify-between mt-6 sm:mt-8 space-y-4 sm:space-y-0">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/')}
              className="bg-gray-200 text-gray-700 px-4 sm:px-6 py-3 rounded-lg font-medium hover:bg-gray-300 transition flex items-center justify-center space-x-2 w-full sm:w-auto"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-sm sm:text-base">Back</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleNext}
              className="bg-cravora-purple text-white px-4 sm:px-6 py-3 rounded-lg font-medium hover:bg-cravora-purple-dark transition flex items-center justify-center space-x-2 w-full sm:w-auto"
            >
              <span className="text-sm sm:text-base">Next</span>
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
