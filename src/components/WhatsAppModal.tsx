import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, FileText, CheckCircle2, AlertCircle, QrCode, RefreshCw } from 'lucide-react';
import { apiJson, publicQuotationUrl } from '../utils/api';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotationId: string;
  documentType?: 'Quotation' | 'Billing' | 'Invoice' | 'Receipt';
  initialPhone?: string;
  clientName?: string;
  grandTotal?: number;
  currency?: string;
  publicToken?: string;
  isDraft: boolean;
  pdfBase64: string;
  filename: string;
  onIssueQuotation?: () => Promise<{ publicToken?: string }>;
  onSuccess?: (notice: string) => void;
}

interface WhatsAppStatusResponse {
  status: 'DISCONNECTED' | 'STARTING' | 'SCAN_QR_CODE' | 'CONNECTED';
  qrCode?: string | null;
  isReady?: boolean;
  message?: string;
}

export default function WhatsAppModal({
  isOpen,
  onClose,
  quotationId,
  documentType = 'Quotation',
  initialPhone = '',
  clientName = '',
  grandTotal = 0,
  currency = 'INR',
  publicToken = '',
  isDraft,
  pdfBase64,
  filename,
  onIssueQuotation,
  onSuccess,
}: WhatsAppModalProps) {
  const [phone, setPhone] = useState(initialPhone);
  const [message, setMessage] = useState('');
  const [shouldIssue, setShouldIssue] = useState(false);
  const [currentToken, setCurrentToken] = useState(publicToken);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [waStatus, setWaStatus] = useState<WhatsAppStatusResponse>({ status: 'DISCONNECTED' });
  const [loadingStatus, setLoadingStatus] = useState(false);

  const isReceipt = documentType === 'Receipt' || quotationId.startsWith('REC');
  const isInvoice = documentType === 'Invoice' || quotationId.startsWith('INV');

  // Sync initial phone and token when opened
  useEffect(() => {
    if (isOpen) {
      setPhone(initialPhone);
      setCurrentToken(publicToken);
      setError('');
      setIsSending(false);
      checkStatus();
    }
  }, [isOpen, initialPhone, publicToken]);

  // Build message template
  useEffect(() => {
    if (!isOpen) return;
    const formattedTotal = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
    }).format(grandTotal || 0);

    const linkText = currentToken
      ? `\n\nYou can review and accept this quotation online at:\n${publicQuotationUrl(currentToken)}`
      : '';

    const defaultMsg = isReceipt
      ? `Dear ${clientName ? clientName : 'Client'},\n\nPlease find attached payment receipt ${quotationId} from Cravora Solutions for ${formattedTotal}.\n\nThank you,\nCravora Solutions`
      : (isInvoice
          ? `Dear ${clientName ? clientName : 'Client'},\n\nPlease find attached invoice ${quotationId} from Cravora Solutions for ${formattedTotal}.\n\nThank you,\nCravora Solutions`
          : `Dear ${clientName ? clientName : 'Client'},\n\nPlease find attached quotation ${quotationId} from Cravora Solutions for ${formattedTotal}.${linkText}\n\nThank you,\nCravora Solutions`);
    setMessage(defaultMsg);
  }, [isOpen, clientName, quotationId, grandTotal, currency, currentToken, isInvoice, isReceipt]);

  const checkStatus = async () => {
    setLoadingStatus(true);
    try {
      const data = await apiJson('/api/whatsapp/status');
      setWaStatus({
        status: (data.status as WhatsAppStatusResponse['status']) || 'DISCONNECTED',
        qrCode: (data.qrCode as string) || null,
        isReady: Boolean(data.isReady),
      });
    } catch {
      setWaStatus({ status: 'DISCONNECTED' });
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleConnect = async () => {
    setLoadingStatus(true);
    setError('');
    try {
      const data = await apiJson('/api/whatsapp/connect', { method: 'POST' });
      setWaStatus({
        status: (data.status as WhatsAppStatusResponse['status']) || 'STARTING',
        qrCode: (data.qrCode as string) || null,
        isReady: Boolean(data.isReady),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not initialize WhatsApp');
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanPhone = phone.replace(/[\s\-()]/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      setError('Please provide a valid phone number with country code (e.g. +91 98765 43210).');
      return;
    }

    if (waStatus.status !== 'CONNECTED') {
      setError('WhatsApp is not connected yet. Please connect and scan the QR code first.');
      return;
    }

    setIsSending(true);

    try {
      let finalMessage = message;

      // Handle optional issuance if user explicitly checked it
      if (isDraft && shouldIssue && onIssueQuotation) {
        const issued = await onIssueQuotation();
        if (issued?.publicToken) {
          setCurrentToken(issued.publicToken);
          const reviewUrl = publicQuotationUrl(issued.publicToken);
          if (!finalMessage.includes(reviewUrl)) {
            finalMessage = `${finalMessage}\n\nReview & accept online:\n${reviewUrl}`;
          }
        }
      }

      // Explicit backend call to send the document via OpenWA
      const res = await apiJson('/api/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({
          phone: cleanPhone,
          message: finalMessage,
          pdfBase64,
          filename: filename || `${quotationId}.pdf`,
          quotationId,
        }),
      });

      const docLabel = isReceipt ? 'Receipt' : (isInvoice ? 'Invoice' : 'Quotation');
      const successNotice = res.message || `${docLabel} successfully sent to ${cleanPhone} via WhatsApp.`;
      if (onSuccess) onSuccess(successNotice);
      onClose();
    } catch (err) {
      let msg = err instanceof Error ? err.message : 'Failed to send WhatsApp message';
      try {
        const parsed = JSON.parse(msg);
        if (Array.isArray(parsed) && parsed[0]?.message) {
          msg = parsed.map((p: { message?: string }) => p.message).filter(Boolean).join(', ');
        }
      } catch {
        // Not a JSON string
      }
      setError(msg);
    } finally {
      setIsSending(false);
    }
  };

  const fileSizeKb = pdfBase64 ? Math.round((pdfBase64.length * 3) / 4 / 1024) : 0;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-3 sm:p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="bg-[#075E54] text-white px-5 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center text-white font-bold">
                WA
              </div>
              <div>
                <h3 className="font-semibold text-lg leading-tight">Send via WhatsApp</h3>
                <p className="text-xs text-green-100">Review recipient & message before sending</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSending}
              className="text-white hover:text-gray-200 transition p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSend} className="p-5 overflow-y-auto space-y-4 flex-1">
            {/* WhatsApp Connection Status Bar */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-700">Connection Status:</span>
                {waStatus.status === 'CONNECTED' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Connected
                  </span>
                ) : waStatus.status === 'SCAN_QR_CODE' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
                    <QrCode className="w-3.5 h-3.5 mr-1" />
                    Scan QR Code
                  </span>
                ) : waStatus.status === 'STARTING' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                    <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                    Starting...
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-200 text-gray-700">
                    Disconnected
                  </span>
                )}
              </div>

              {/* QR Code Presentation if Pairing Needed */}
              {waStatus.status === 'SCAN_QR_CODE' && waStatus.qrCode && (
                <div className="mt-3 p-3 bg-white border border-yellow-200 rounded-lg text-center">
                  <p className="text-xs text-gray-600 mb-2 font-medium">
                    Scan with WhatsApp on your phone (Settings → Linked Devices → Link a Device)
                  </p>
                  <img
                    src={waStatus.qrCode}
                    alt="WhatsApp QR Code"
                    className="w-48 h-48 mx-auto border border-gray-300 rounded shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={checkStatus}
                    className="mt-2 text-xs text-blue-600 hover:underline flex items-center justify-center mx-auto"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" /> Refresh status
                  </button>
                </div>
              )}

              {/* Connect Button if Disconnected */}
              {waStatus.status === 'DISCONNECTED' && (
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={loadingStatus}
                    className="text-xs bg-[#25D366] text-white px-3 py-1 rounded font-medium hover:bg-[#128C7E] transition disabled:opacity-50"
                  >
                    {loadingStatus ? 'Connecting...' : 'Connect WhatsApp Session'}
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Phone Number Field */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                Recipient Phone Number *
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                required
                disabled={isSending}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#25D366] focus:border-transparent text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Include country code (e.g. +91 for India).
              </p>
            </div>

            {/* Optional Quotation Issuance Checkbox if in draft */}
            {isDraft && !isInvoice && !isReceipt && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <label className="flex items-start space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shouldIssue}
                    onChange={(e) => setShouldIssue(e.target.checked)}
                    disabled={isSending}
                    className="mt-0.5 h-4 w-4 text-[#25D366] rounded border-gray-300 focus:ring-[#25D366]"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-amber-900">
                      Issue quotation now
                    </span>
                    <p className="text-amber-700">
                      Freezes commercial terms and generates a public client accept/reject link. Leave unchecked to send as a draft.
                    </p>
                  </div>
                </label>
              </div>
            )}

            {/* Message Textarea */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                WhatsApp Message Text
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                disabled={isSending}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#25D366] focus:border-transparent text-sm font-sans"
              />
            </div>

            {/* PDF Attachment Badge */}
            <div className="bg-gray-100 rounded-lg p-3 flex items-center justify-between text-xs text-gray-700">
              <div className="flex items-center space-x-2 overflow-hidden">
                <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="font-medium truncate">{filename || `${quotationId}.pdf`}</span>
              </div>
              <span className="text-gray-500 ml-2 flex-shrink-0">
                {fileSizeKb > 0 ? `${fileSizeKb} KB (PDF)` : 'Ready'}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex items-center justify-end space-x-3 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                disabled={isSending}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending || waStatus.status !== 'CONNECTED'}
                className="px-5 py-2 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-lg text-sm font-semibold transition flex items-center space-x-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send via WhatsApp</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
