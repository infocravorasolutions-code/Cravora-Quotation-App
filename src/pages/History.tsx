import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Eye, Trash2, Plus, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/currency';
import { useQuotationStore } from '../store/quotationStore';
import { generatePDF } from '../utils/pdfGenerator';

interface SavedQuotation {
  id: string;
  clientName: string;
  projectName: string;
  date: string;
  total: number;
  status: string;
  clientInfo: any;
  modules: any[];
  tax: number;
  subtotal: number;
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

  const handleDownloadQuotation = async (quotation: SavedQuotation) => {
    try {
      // Create a temporary element with the old quotation data
      const tempElement = document.createElement('div');
      tempElement.id = 'temp-pdf-content';
      tempElement.style.position = 'absolute';
      tempElement.style.left = '-9999px';
      tempElement.style.top = '-9999px';
      tempElement.style.width = '210mm';
      tempElement.style.backgroundColor = 'white';
      tempElement.style.padding = '20px';
      
      // Generate the old format HTML
      tempElement.innerHTML = `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb;">
            <div style="display: flex; align-items: center;">
              <img src="/logo.png" alt="Cravora Solutions" style="width: 48px; height: 48px; margin-right: 12px;" />
              <div>
                <h1 style="font-size: 24px; font-weight: bold; color: #1f2937; margin: 0;">Cravora Solutions</h1>
                <p style="color: #6b7280; margin: 0;">Professional Quotation System</p>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 20px; font-weight: bold; color: #2563eb;">${quotation.id}</div>
              <div style="color: #6b7280;">${format(new Date(quotation.date), 'MMM dd, yyyy')}</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px;">
            <div>
              <h2 style="font-size: 14px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 12px;">Bill To</h2>
              <div style="font-weight: 600; color: #1f2937; font-size: 18px; margin-bottom: 4px;">${quotation.clientInfo.clientName}</div>
              <div style="color: #6b7280;">${quotation.clientInfo.clientEmail}</div>
            </div>
            <div>
              <h2 style="font-size: 14px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 12px;">Project Details</h2>
              <div style="font-weight: 600; color: #1f2937; font-size: 18px; margin-bottom: 4px;">${quotation.clientInfo.projectName}</div>
              <div style="color: #6b7280;">${quotation.clientInfo.projectDescription}</div>
            </div>
          </div>

          <div style="margin-bottom: 32px;">
            <h2 style="font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 16px;">Modules & Services</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #f3f4f6;">
                  <th style="text-align: left; padding: 12px 16px; font-weight: 600; color: #374151; border-radius: 8px 0 0 8px;">Description</th>
                  <th style="text-align: right; padding: 12px 16px; font-weight: 600; color: #374151;">Hours</th>
                  <th style="text-align: right; padding: 12px 16px; font-weight: 600; color: #374151;">Rate</th>
                  <th style="text-align: right; padding: 12px 16px; font-weight: 600; color: #374151; border-radius: 0 8px 8px 0;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${quotation.modules.map((module, index) => `
                  <tr style="background-color: ${index % 2 === 0 ? 'white' : '#f9fafb'};">
                    <td style="padding: 12px 16px;">
                      <div style="font-weight: 500; color: #1f2937;">${module.name}</div>
                      ${module.description ? `<div style="font-size: 14px; color: #6b7280; margin-top: 4px;">${module.description}</div>` : ''}
                    </td>
                    <td style="text-align: right; padding: 12px 16px; color: #374151;">${module.hours}</td>
                    <td style="text-align: right; padding: 12px 16px; color: #374151;">${formatCurrency(module.rate, quotation.clientInfo.currency)}</td>
                    <td style="text-align: right; padding: 12px 16px; font-weight: 500; color: #1f2937;">${formatCurrency(module.total, quotation.clientInfo.currency)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-bottom: 32px;">
            <div style="width: 320px;">
              <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                <span style="color: #374151;">Subtotal</span>
                <span style="font-weight: 500; color: #1f2937;">${formatCurrency(quotation.subtotal, quotation.clientInfo.currency)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                <span style="color: #374151;">Tax (${quotation.tax}%)</span>
                <span style="font-weight: 500; color: #1f2937;">${formatCurrency(quotation.taxAmount, quotation.clientInfo.currency)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 12px 0; border-top: 2px solid #d1d5db;">
                <span style="font-size: 20px; font-weight: 600; color: #1f2937;">Total</span>
                <span style="font-size: 24px; font-weight: bold; color: #2563eb;">${formatCurrency(quotation.grandTotal, quotation.clientInfo.currency)}</span>
              </div>
            </div>
          </div>

          <div style="border-top: 2px solid #e5e7eb; padding-top: 24px;">
            <h3 style="font-weight: 600; color: #1f2937; margin-bottom: 12px;">Terms & Conditions</h3>
            <div style="font-size: 14px; color: #6b7280; line-height: 1.6;">
              <p style="margin: 8px 0;"><strong>Payment Terms:</strong> 50% advance, 50% upon completion</p>
              <p style="margin: 8px 0;"><strong>Validity:</strong> This quotation is valid for 30 days from the date of issue</p>
              <p style="margin: 8px 0;"><strong>Contact:</strong> For any queries, please reach out to contact@quotegen.com</p>
            </div>
          </div>

          <div style="margin-top: 32px; text-align: center; font-size: 14px; color: #6b7280;">
            <p>Thank you for your business!</p>
          </div>
        </div>
      `;
      
      document.body.appendChild(tempElement);
      
      // Generate PDF using the old method
      await generatePDF('temp-pdf-content', `${quotation.id}.pdf`);
      
      // Clean up
      document.body.removeChild(tempElement);
      
    } catch (error) {
      console.error('Error downloading quotation:', error);
      alert('Error downloading quotation. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-50 py-12">
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
                className="bg-cravora-purple text-white px-6 py-3 rounded-lg font-medium hover:bg-cravora-purple-dark transition flex items-center space-x-2"
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
                  className="bg-cravora-purple text-white px-6 py-3 rounded-lg font-medium hover:bg-cravora-purple-dark transition"
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
                              onClick={() => handleDownloadQuotation(quotation)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </motion.button>
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
