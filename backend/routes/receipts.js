const express = require('express');
const router = express.Router();
const Receipt = require('../models/Receipt');
const Invoice = require('../models/Invoice');
const Client = require('../models/Client');
const Payment = require('../models/Payment');
const { isEmail, round2 } = require('../utils/totals');
const { logAudit } = require('../utils/audit');
const { documentEmailHtml, sendDocumentEmail } = require('../services/mailer');
const { pageQuery, escapeRegex } = require('../utils/http');
const { requireFinance } = require('../utils/auth');

async function syncReceiptWithInvoiceAndPayment(receipt) {
    if (!receipt) return receipt;
    try {
        let changed = false;
        const [payment, invoice] = await Promise.all([
            receipt.paymentId ? Payment.findById(receipt.paymentId).lean() : null,
            receipt.invoiceId ? Invoice.findOne({ invoiceNumber: receipt.invoiceId }).lean() : null,
        ]);

        if (payment && Number.isFinite(payment.amount)) {
            const paymentAmount = round2(payment.amount);
            if (receipt.amount !== paymentAmount) {
                receipt.amount = paymentAmount;
                changed = true;
            }
            if (payment.paymentDate && (!receipt.paymentDate || new Date(receipt.paymentDate).getTime() !== new Date(payment.paymentDate).getTime())) {
                receipt.paymentDate = payment.paymentDate;
                changed = true;
            }
            if (payment.paymentMethod && receipt.paymentMethod !== payment.paymentMethod) {
                receipt.paymentMethod = payment.paymentMethod;
                changed = true;
            }
            if (payment.transactionReference !== undefined && receipt.transactionReference !== payment.transactionReference) {
                receipt.transactionReference = payment.transactionReference;
                changed = true;
            }
        }

        let invoiceTotal = round2(receipt.invoiceTotal || 0);
        let totalPaid = round2(receipt.amountPaid || receipt.amount || 0);
        let balanceDue = receipt.balanceDue !== undefined ? round2(receipt.balanceDue) : round2(Math.max(0, invoiceTotal - totalPaid));

        if (invoice) {
            invoiceTotal = round2(invoice.grandTotal || 0);
            const recordedPayments = await Payment.find({
                invoiceId: receipt.invoiceId,
                status: 'recorded',
            }).select('amount').lean();
            totalPaid = round2(recordedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0));
            balanceDue = round2(Math.max(0, invoiceTotal - totalPaid));

            if (receipt.invoiceTotal !== invoiceTotal) {
                receipt.invoiceTotal = invoiceTotal;
                changed = true;
            }
            if (receipt.amountPaid !== totalPaid) {
                receipt.amountPaid = totalPaid;
                changed = true;
            }
            if (receipt.balanceDue !== balanceDue) {
                receipt.balanceDue = balanceDue;
                changed = true;
            }
            if (invoice.currency && receipt.currency !== invoice.currency) {
                receipt.currency = invoice.currency;
                changed = true;
            }
            if (invoice.clientSnapshot && (!receipt.clientSnapshot || !receipt.clientSnapshot.clientName)) {
                receipt.clientSnapshot = invoice.clientSnapshot;
                changed = true;
            }
        }

        const currentSnapshot = receipt.issuedSnapshot || {};
        const expectedSnapshot = {
            ...currentSnapshot,
            receiptNumber: receipt.receiptNumber,
            invoiceNumber: receipt.invoiceId,
            clientSnapshot: receipt.clientSnapshot || currentSnapshot.clientSnapshot || (invoice && invoice.clientSnapshot) || {},
            amount: receipt.amount,
            paymentDate: receipt.paymentDate,
            paymentMethod: receipt.paymentMethod,
            transactionReference: receipt.transactionReference || '',
            invoiceTotal,
            amountPaid: totalPaid,
            balanceDue,
            currency: receipt.currency || (invoice && invoice.currency) || 'INR',
        };

        if (JSON.stringify(currentSnapshot) !== JSON.stringify(expectedSnapshot)) {
            receipt.issuedSnapshot = expectedSnapshot;
            changed = true;
        }

        if (changed && typeof receipt.save === 'function') {
            await receipt.save();
        }
    } catch (e) {
        console.error('Error syncing receipt:', e);
    }
    return receipt;
}

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
        const [rawItems, total] = await Promise.all([
            Receipt.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Receipt.countDocuments(filter),
        ]);
        const items = await Promise.all(rawItems.map(syncReceiptWithInvoiceAndPayment));
        res.json({ items, total, page, limit });
    } catch (err) {
        res.status(500).json({ message: 'Could not load receipts' });
    }
});

router.get('/:receiptNumber', async (req, res) => {
    try {
        let receipt = await Receipt.findOne({ receiptNumber: req.params.receiptNumber });
        if (!receipt) return res.status(404).json({ message: 'Receipt not found' });
        receipt = await syncReceiptWithInvoiceAndPayment(receipt);
        res.json(receipt);
    } catch (err) {
        res.status(500).json({ message: 'Could not load receipt' });
    }
});

router.post('/:receiptNumber/email', requireFinance, async (req, res) => {
    try {
        let receipt = await Receipt.findOne({ receiptNumber: req.params.receiptNumber });
        if (!receipt) return res.status(404).json({ message: 'Receipt not found' });
        receipt = await syncReceiptWithInvoiceAndPayment(receipt);
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

router.delete('/:receiptNumber', requireFinance, async (req, res) => {
    try {
        const receipt = await Receipt.findOne({ receiptNumber: req.params.receiptNumber });
        if (!receipt) return res.status(404).json({ message: 'Receipt not found' });

        await Receipt.deleteOne({ receiptNumber: req.params.receiptNumber });
        await logAudit('receipt_deleted', 'receipt', req.params.receiptNumber, {});
        res.json({ message: `Receipt ${req.params.receiptNumber} deleted successfully` });
    } catch (err) {
        res.status(500).json({ message: err.message || 'Could not delete receipt' });
    }
});

module.exports = router;
