const express = require('express');
const router = express.Router();
const Receipt = require('../models/Receipt');
const Invoice = require('../models/Invoice');
const Client = require('../models/Client');
const { isEmail } = require('../utils/totals');
const { logAudit } = require('../utils/audit');
const { documentEmailHtml, sendDocumentEmail } = require('../services/mailer');
const { pageQuery, escapeRegex } = require('../utils/http');
const { requireFinance } = require('../utils/auth');

async function resolveReceiptRecipient(receipt, requestedTo) {
    const requested = String(requestedTo || '').trim();
    if (isEmail(requested)) return requested;
    const invoice = await Invoice.findOne({ invoiceNumber: receipt.invoiceId }).select('clientId clientSnapshot').lean();
    if (invoice && invoice.clientId) {
        const client = await Client.findById(invoice.clientId).select('email').lean();
        if (client && isEmail(client.email)) return String(client.email).trim();
    }
    const fromInvoice = invoice && invoice.clientSnapshot && invoice.clientSnapshot.clientEmail;
    if (isEmail(fromInvoice)) return String(fromInvoice).trim();
    const fromReceipt = receipt.clientSnapshot && receipt.clientSnapshot.clientEmail;
    return String(fromReceipt || '').trim();
}

router.get('/', async (req, res) => {
    try {
        const { page, limit, skip } = pageQuery(req);
        const filter = {};
        if (req.query.invoiceId) filter.invoiceId = String(req.query.invoiceId);
        if (req.query.q) {
            const pattern = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), 'i');
            filter.$or = [{ receiptNumber: pattern }, { invoiceId: pattern }];
        }
        const [items, total] = await Promise.all([
            Receipt.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Receipt.countDocuments(filter),
        ]);
        res.json({ items, total, page, limit });
    } catch (err) {
        res.status(500).json({ message: 'Could not load receipts' });
    }
});

router.get('/:receiptNumber', async (req, res) => {
    try {
        const receipt = await Receipt.findOne({ receiptNumber: req.params.receiptNumber });
        if (!receipt) return res.status(404).json({ message: 'Receipt not found' });
        res.json(receipt);
    } catch (err) {
        res.status(500).json({ message: 'Could not load receipt' });
    }
});

router.post('/:receiptNumber/email', requireFinance, async (req, res) => {
    try {
        const receipt = await Receipt.findOne({ receiptNumber: req.params.receiptNumber });
        if (!receipt) return res.status(404).json({ message: 'Receipt not found' });
        const recipient = await resolveReceiptRecipient(receipt, req.body && req.body.to);
        if (!isEmail(recipient)) {
            return res.status(400).json({ message: 'A valid recipient email is required. Update the client email, then send again.' });
        }
        const pdfBase64 = req.body && req.body.pdfBase64 ? String(req.body.pdfBase64) : '';
        if (pdfBase64 && pdfBase64.length > 20 * 1024 * 1024) {
            return res.status(400).json({ message: 'PDF attachment is too large' });
        }
        const subject = (req.body && req.body.subject) || `Receipt ${receipt.receiptNumber} from Cravora Solutions`;
        const entry = {
            kind: 'receipt',
            documentType: 'receipt',
            recipient,
            at: new Date(),
            status: 'sent',
        };
        try {
            await sendDocumentEmail({
                to: recipient,
                subject,
                html: documentEmailHtml({
                    kind: 'receipt',
                    number: receipt.receiptNumber,
                    total: receipt.amount,
                    currency: receipt.currency,
                    message: (req.body && req.body.message) || 'Please find your payment receipt attached.',
                }),
                filename: `${receipt.receiptNumber}.pdf`,
                pdfBase64,
            });
        } catch (error) {
            entry.status = 'failed';
            entry.error = error.code === 'EMAIL_NOT_CONFIGURED' ? 'Email is not configured' : 'Email could not be sent';
        }
        receipt.emailLog = receipt.emailLog || [];
        receipt.emailLog.push(entry);
        await receipt.save();
        await logAudit('receipt_email', 'receipt', receipt.receiptNumber, {
            recipient,
            status: entry.status,
        });
        if (entry.status === 'failed') {
            return res.status(503).json({ message: entry.error, receipt });
        }
        res.json({ message: `Receipt email sent to ${recipient}`, recipient, receipt });
    } catch (err) {
        res.status(400).json({ message: 'Could not send receipt email' });
    }
});

module.exports = router;
