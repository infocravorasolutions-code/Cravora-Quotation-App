import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Plus, Pencil, Trash2 } from 'lucide-react';
import { useQuotationStore, Module } from '../store/quotationStore';
import { formatCurrency } from '../utils/currency';

export default function Modules() {
  const navigate = useNavigate();
  const { clientInfo, modules, addModule, updateModule, deleteModule, getSubtotal } =
    useQuotationStore();

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

  const handleNext = () => {
    if (modules.length === 0) {
      alert('Please add at least one module');
      return;
    }
    navigate('/summary');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-50 py-12">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-6xl mx-auto"
        >
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Add Modules</h1>
            <p className="text-gray-600 mb-8">
              Define the work modules for {clientInfo.projectName}
            </p>

            <form onSubmit={handleSubmit} className="space-y-6 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Module Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="e.g., User Authentication System"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={2}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
                    placeholder="Optional module description"
                  />
                </div>

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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    placeholder="0.00"
                  />
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
                      <th className="text-center py-3 px-4 font-semibold text-gray-700">
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
                        <td className="text-center py-3 px-4">
                          <div className="flex items-center justify-center space-x-2">
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleEdit(module)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
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

          <div className="flex justify-between">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/')}
              className="bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-300 transition flex items-center space-x-2"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleNext}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition flex items-center space-x-2"
            >
              <span>Next</span>
              <ArrowRight className="w-5 h-5" />
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
