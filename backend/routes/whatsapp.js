const express = require('express');
const router = express.Router();
const {
    getWhatsAppStatus,
    initializeWhatsApp,
    sendWhatsAppDocument,
} = require('../services/whatsapp');
const { logAudit } = require('../utils/audit');

// GET /api/whatsapp/status - Returns WhatsApp connection and QR state
router.get('/status', (req, res) => {
    try {
        const status = getWhatsAppStatus();
        res.json(status);
    } catch (err) {
        res.status(500).json({ message: err.message || 'Failed to get WhatsApp status' });
    }
});

// POST /api/whatsapp/connect - Starts the local WhatsApp session
router.post('/connect', async (req, res) => {
    try {
        const status = await initializeWhatsApp();
        res.json(status);
    } catch (err) {
        res.status(500).json({ message: err.message || 'Could not connect to WhatsApp' });
    }
});

// POST /api/whatsapp/send - Sends document with message after manual confirmation
router.post('/send', async (req, res) => {
    try {
        const { phone, message, pdfBase64, filename, quotationId } = req.body || {};

        if (!phone || typeof phone !== 'string') {
            return res.status(400).json({ message: 'A valid recipient phone number is required' });
        }

        if (!pdfBase64 || typeof pdfBase64 !== 'string') {
            return res.status(400).json({ message: 'PDF document content is required' });
        }

        const isReceipt = Boolean(quotationId && String(quotationId).startsWith('REC'));
        const isInvoice = Boolean(quotationId && String(quotationId).startsWith('INV'));
        const docType = isReceipt ? 'receipt' : (isInvoice ? 'invoice' : 'quotation');
        const docLabel = isReceipt ? 'Receipt' : (isInvoice ? 'Invoice' : 'Quotation');

        const result = await sendWhatsAppDocument({
            phone,
            message: message || '',
            pdfBase64,
            filename: filename || `${docLabel}.pdf`,
            quotationId,
        });

        if (quotationId) {
            await logAudit(`${docType}_whatsapp`, docType, quotationId, {
                recipientPhone: phone.replace(/.(?=.{4})/g, '*'), // Mask phone for audit log privacy
                at: new Date().toISOString(),
            });
        }

        res.json({
            message: `${docLabel} successfully sent via WhatsApp`,
            chatId: result.chatId,
            messageId: result.messageId,
        });
    } catch (err) {
        let msg = err.message || 'Could not send WhatsApp message';
        try {
            const parsed = JSON.parse(msg);
            if (Array.isArray(parsed) && parsed[0]?.message) {
                msg = parsed.map((p) => p.message).filter(Boolean).join(', ');
            }
        } catch {
            // Not a JSON string
        }
        res.status(400).json({ message: msg });
    }
});

module.exports = router;
