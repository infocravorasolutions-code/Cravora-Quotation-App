const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Client = require('../models/Client');
const { isEmail } = require('../utils/totals');
const { logAudit } = require('../utils/audit');
const { documentEmailHtml, sendDocumentEmail } = require('../services/mailer');
const { pageQuery, escapeRegex } = require('../utils/http');

async function resolveInvoiceRecipient(invoice, requestedTo) {
    const requested = String(requestedTo || '').trim();
    if (isEmail(requested)) return requested;
    if (invoice.clientId) {
        const client = await Client.findById(invoice.clientId).select('email').lean();
        if (client && isEmail(client.email)) return String(client.email).trim();
    }
    return String((invoice.clientSnapshot && invoice.clientSnapshot.clientEmail) || '').trim();
}

async function refreshOverdue() {
    await Invoice.updateMany(
        {
            status: { $in: ['issued', 'partially_paid'] },
            dueDate: { $lt: new Date() },
        },
        { $set: { status: 'overdue' } }
    );
}

function snapshotFrom(invoice) {
    return {
        invoiceNumber: invoice.invoiceNumber,
        quotationId: invoice.quotationId,
        clientSnapshot: invoice.clientSnapshot,
        items: invoice.items,
        subtotal: invoice.subtotal,
        discountRate: invoice.discountRate,
        discountAmount: invoice.discountAmount,
        tax: invoice.tax,
        taxAmount: invoice.taxAmount,
        gstDetails: invoice.gstDetails,
        grandTotal: invoice.grandTotal,
        currency: invoice.currency,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        notes: invoice.notes,
        terms: invoice.terms,
        amountPaid: invoice.amountPaid,
        balanceDue: invoice.balanceDue,
        status: invoice.status,
    };
}

router.get('/', async (req, res) => {
    try {
        await refreshOverdue();
        const { page, limit, skip } = pageQuery(req);
        const filter = {};
        if (req.query.status) filter.status = String(req.query.status);
        if (req.query.q) {
            const pattern = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), 'i');
            filter.$or = [{ invoiceNumber: pattern }, { quotationId: pattern }];
        }
        const [items, total] = await Promise.all([
            Invoice.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
            Invoice.countDocuments(filter),
        ]);
        res.json({ items, total, page, limit });
    } catch (err) {
        res.status(500).json({ message: 'Could not load invoices' });
    }
});

router.get('/:invoiceNumber', async (req, res) => {
    try {
        const invoice = await Invoice.findOne({ invoiceNumber: req.params.invoiceNumber });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        res.json(invoice);
    } catch (err) {
        res.status(500).json({ message: 'Could not load invoice' });
    }
});

router.post('/:invoiceNumber/follow-up', async (req, res) => {
    try {
        const invoice = await Invoice.findOne({ invoiceNumber: req.params.invoiceNumber });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        const body = req.body || {};
        if (body.nextFollowUpAt) {
            const next = new Date(body.nextFollowUpAt);
            if (Number.isNaN(next.getTime())) return res.status(400).json({ message: 'Next follow-up date is not valid' });
            invoice.nextFollowUpAt = next;
        }
        if (body.collectionNotes != null) invoice.collectionNotes = String(body.collectionNotes).slice(0, 1000);
        invoice.lastFollowUpAt = new Date();
        await invoice.save();
        await logAudit('invoice_follow_up', 'invoice', invoice.invoiceNumber, {
            nextFollowUpAt: invoice.nextFollowUpAt,
        });
        res.json(invoice);
    } catch (err) {
        res.status(400).json({ message: 'Could not save the follow-up' });
    }
});

router.post('/:invoiceNumber/issue', async (req, res) => {
    try {
        const invoice = await Invoice.findOne({ invoiceNumber: req.params.invoiceNumber });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        if (invoice.issuedSnapshot) return res.json(invoice);
        if (invoice.status !== 'draft') {
            return res.status(400).json({ message: 'This invoice cannot be issued' });
        }
        invoice.issueDate = new Date();
        invoice.status = 'issued';
        invoice.balanceDue = invoice.grandTotal;
        invoice.amountPaid = 0;
        invoice.issuedSnapshot = snapshotFrom(invoice);
        await invoice.save();
        await logAudit('invoice_issued', 'invoice', invoice.invoiceNumber, {
            grandTotal: invoice.grandTotal,
        });
        res.json(invoice);
    } catch (err) {
        res.status(400).json({ message: 'Could not issue invoice' });
    }
});

router.post('/:invoiceNumber/email', async (req, res) => {
    try {
        const invoice = await Invoice.findOne({ invoiceNumber: req.params.invoiceNumber });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        if (!invoice.issuedSnapshot) {
            return res.status(400).json({ message: 'Issue the invoice before sending email' });
        }
        const recipient = await resolveInvoiceRecipient(invoice, req.body && req.body.to);
        if (!isEmail(recipient)) {
            return res.status(400).json({ message: 'A valid recipient email is required. Update the client email, then send again.' });
        }
        const pdfBase64 = req.body && req.body.pdfBase64 ? String(req.body.pdfBase64) : '';
        if (pdfBase64 && pdfBase64.length > 20 * 1024 * 1024) {
            return res.status(400).json({ message: 'PDF attachment is too large' });
        }
        const subject = (req.body && req.body.subject) || `Invoice ${invoice.invoiceNumber} from Cravora Solutions`;
        const entry = {
            kind: 'invoice',
            documentType: 'invoice',
            recipient,
            at: new Date(),
            status: 'sent',
        };
        try {
            await sendDocumentEmail({
                to: recipient,
                subject,
                html: documentEmailHtml({
                    kind: 'invoice',
                    number: invoice.invoiceNumber,
                    total: invoice.issuedSnapshot.grandTotal,
                    currency: invoice.currency,
                    message: req.body && req.body.message,
                }),
                filename: `${invoice.invoiceNumber}.pdf`,
                pdfBase64,
            });
        } catch (error) {
            entry.status = 'failed';
            entry.error = error.code === 'EMAIL_NOT_CONFIGURED' ? 'Email is not configured' : 'Email could not be sent';
        }
        invoice.emailLog = invoice.emailLog || [];
        invoice.emailLog.push(entry);
        await invoice.save();
        await logAudit('invoice_email', 'invoice', invoice.invoiceNumber, {
            recipient,
            status: entry.status,
        });
        if (entry.status === 'failed') {
            return res.status(503).json({ message: entry.error, invoice });
        }
        res.json({ message: `Invoice email sent to ${recipient}`, recipient, invoice });
    } catch (err) {
        res.status(400).json({ message: 'Could not send invoice email' });
    }
});

router.post('/:invoiceNumber/cancel', async (req, res) => {
    try {
        const invoice = await Invoice.findOne({ invoiceNumber: req.params.invoiceNumber });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        const payments = await Payment.countDocuments({ invoiceId: invoice.invoiceNumber, status: 'recorded' });
        if (payments > 0 || invoice.status === 'paid') {
            return res.status(400).json({ message: 'Invoices with payments cannot be cancelled' });
        }
        invoice.status = 'cancelled';
        await invoice.save();
        await logAudit('invoice_cancelled', 'invoice', invoice.invoiceNumber, {});
        res.json(invoice);
    } catch (err) {
        res.status(400).json({ message: 'Could not cancel invoice' });
    }
});

module.exports = router;
