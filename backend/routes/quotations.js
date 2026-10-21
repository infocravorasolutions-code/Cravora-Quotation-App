const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Quotation = require('../models/Quotation');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const { computeTotals, quotationContentError } = require('../utils/totals');
const { nextDocumentNumber } = require('../utils/numbers');
const { logAudit } = require('../utils/audit');
const { isEmail } = require('../utils/totals');
const { documentEmailHtml, sendDocumentEmail } = require('../services/mailer');
const { pageQuery } = require('../utils/http');

const LOCKED = ['sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted'];
const PROTECTED = [
    'status', 'publicToken', 'issuedSnapshot', 'issuedAt', 'sentAt', 'viewedAt',
    'acceptedAt', 'acceptedBy', 'acceptedEmail', 'acceptedIp', 'acceptedUserAgent',
    'rejectedAt', 'rejectionReason', 'emailLog',
];

function displayStatus(doc) {
    if (doc.status) return doc.status;
    return doc.isDraft === false ? 'final' : 'draft';
}

function stripProtected(body) {
    const next = { ...body };
    PROTECTED.forEach((key) => delete next[key]);
    if (next.clientId === '' || next.clientId == null) delete next.clientId;
    return next;
}

function issueInvoiceRecord(invoice) {
    invoice.issueDate = invoice.issueDate || new Date();
    invoice.status = 'issued';
    invoice.amountPaid = invoice.amountPaid || 0;
    invoice.balanceDue = invoice.grandTotal;
    invoice.issuedSnapshot = {
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
        amountPaid: 0,
        balanceDue: invoice.grandTotal,
        status: 'issued',
    };
}

function buildSnapshot(doc, totals) {
    return {
        quotationId: doc.quotationId,
        documentType: doc.documentType,
        clientInfo: doc.clientInfo,
        clientId: doc.clientId || null,
        modules: totals.modules,
        tax: totals.tax,
        discountRate: totals.discountRate,
        termsAndConditions: doc.termsAndConditions || [],
        gstDetails: totals.gstDetails,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        grandTotal: totals.grandTotal,
        notes: doc.notes || '',
        validUntil: doc.validUntil || null,
        issuedAt: new Date().toISOString(),
    };
}

router.post('/next-number', async (req, res) => {
    try {
        const documentType = req.body && req.body.documentType === 'Billing' ? 'Billing' : 'Quotation';
        const prefix = documentType === 'Billing' ? 'BILL' : 'QTN';
        const quotationId = await nextDocumentNumber(prefix, Quotation, 'quotationId');
        res.json({ quotationId, documentType });
    } catch (err) {
        res.status(err.status || 500).json({ message: 'Could not allocate a quotation number' });
    }
});

router.get('/', async (req, res) => {
    try {
        if (req.query.page) {
            const { page, limit, skip } = pageQuery(req);
            const filter = {};
            if (req.query.status) filter.status = String(req.query.status);
            const [items, total] = await Promise.all([
                Quotation.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
                Quotation.countDocuments(filter),
            ]);
            return res.json({ items, total, page, limit });
        }
        const quotations = await Quotation.find().sort({ updatedAt: -1 });
        res.json(quotations);
    } catch (err) {
        res.status(500).json({ message: 'Could not load quotations' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const quotation = await Quotation.findOne({ quotationId: req.params.id });
        if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
        res.json(quotation);
    } catch (err) {
        res.status(500).json({ message: 'Could not load quotation' });
    }
});

router.post('/', async (req, res) => {
    const quotationInfo = stripProtected(req.body || {});
    if (!quotationInfo.quotationId) {
        return res.status(400).json({ message: 'quotationId is required' });
    }
    try {
        const existing = await Quotation.findOne({ quotationId: quotationInfo.quotationId });
        if (existing) {
            return res.status(400).json({ message: 'Quotation ID already exists (use PUT to update)' });
        }
        if (!quotationInfo.status) quotationInfo.status = quotationInfo.isDraft === false ? 'final' : 'draft';
        const quotation = new Quotation(quotationInfo);
        const savedQuotation = await quotation.save();
        await logAudit('quotation_created', 'quotation', savedQuotation.quotationId, {
            documentType: savedQuotation.documentType,
        });
        res.status(201).json(savedQuotation);
    } catch (err) {
        res.status(400).json({ message: err.message || 'Could not create quotation' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const existing = await Quotation.findOne({ quotationId: req.params.id });
        if (!existing) return res.status(404).json({ message: 'Quotation not found' });
        
        const updates = stripProtected(req.body || {});
        const current = displayStatus(existing);
        if (LOCKED.includes(current) && updates.isDraft === true) {
            delete updates.isDraft;
        }
        if (updates.isDraft === false && (current === 'draft' || current === 'final')) {
            updates.status = 'final';
            updates.isDraft = false;
        }
        if (updates.isDraft === true && (current === 'draft' || !existing.status)) {
            updates.status = 'draft';
        }

        // Recompute totals if modules/discount/tax/gst are updated
        const mergedForTotals = {
            modules: updates.modules || existing.modules || [],
            discountRate: updates.discountRate !== undefined ? updates.discountRate : existing.discountRate,
            tax: updates.tax !== undefined ? updates.tax : existing.tax,
            gstDetails: updates.gstDetails || existing.gstDetails || {},
        };
        const totals = computeTotals(mergedForTotals);
        updates.subtotal = totals.subtotal;
        updates.discountAmount = totals.discountAmount;
        updates.taxAmount = totals.taxAmount;
        updates.tax = totals.tax;
        updates.grandTotal = totals.grandTotal;
        updates.gstDetails = totals.gstDetails;

        // If issuedSnapshot exists, keep it updated with the edits so links and PDFs reflect changes
        if (existing.issuedSnapshot) {
            updates.issuedSnapshot = buildSnapshot(
                { ...existing.toObject(), ...updates },
                totals
            );
        }

        const updatedQuotation = await Quotation.findOneAndUpdate(
            { quotationId: req.params.id },
            updates,
            { new: true, runValidators: true }
        );
        await logAudit('quotation_updated', 'quotation', req.params.id, {
            grandTotal: updatedQuotation.grandTotal,
        });
        res.json(updatedQuotation);
    } catch (err) {
        res.status(400).json({ message: err.message || 'Could not update quotation' });
    }
});

router.post('/:id/issue', async (req, res) => {
    try {
        const quotation = await Quotation.findOne({ quotationId: req.params.id });
        if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
        if (quotation.issuedSnapshot) return res.json(quotation);
        const current = displayStatus(quotation);
        if (!['draft', 'final'].includes(current)) {
            return res.status(400).json({ message: 'This quotation cannot be issued' });
        }
        const contentError = quotationContentError(quotation);
        if (contentError) return res.status(400).json({ message: contentError });
        const totals = computeTotals(quotation);
        const issuedAt = new Date();
        const snapshot = buildSnapshot(quotation, totals);
        snapshot.issuedAt = issuedAt.toISOString();
        quotation.modules = totals.modules;
        quotation.subtotal = totals.subtotal;
        quotation.discountAmount = totals.discountAmount;
        quotation.taxAmount = totals.taxAmount;
        quotation.tax = totals.tax;
        quotation.grandTotal = totals.grandTotal;
        quotation.gstDetails = totals.gstDetails;
        quotation.issuedSnapshot = snapshot;
        quotation.issuedAt = issuedAt;
        quotation.status = 'sent';
        quotation.isDraft = false;
        if (!quotation.publicToken) quotation.publicToken = crypto.randomBytes(32).toString('hex');
        await quotation.save();
        await logAudit('quotation_issued', 'quotation', quotation.quotationId, {
            grandTotal: quotation.grandTotal,
        });
        res.json(quotation);
    } catch (err) {
        res.status(400).json({ message: err.message || 'Could not issue quotation' });
    }
});

router.post('/:id/email', async (req, res) => {
    try {
        const quotation = await Quotation.findOne({ quotationId: req.params.id });
        if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
        if (!quotation.issuedSnapshot) {
            return res.status(400).json({ message: 'Issue the quotation before sending email' });
        }
        const recipient = String((req.body && req.body.to) || quotation.clientInfo?.clientEmail || '').trim();
        if (!isEmail(recipient)) return res.status(400).json({ message: 'A valid recipient email is required' });
        const pdfBase64 = req.body && req.body.pdfBase64 ? String(req.body.pdfBase64) : '';
        if (pdfBase64 && pdfBase64.length > 20 * 1024 * 1024) {
            return res.status(400).json({ message: 'PDF attachment is too large' });
        }
        const origin = String((req.body && req.body.appUrl) || '').replace(/\/$/, '');
        const link = quotation.publicToken && origin
            ? `${origin}/public/quotation/${quotation.publicToken}`
            : '';
        const total = quotation.issuedSnapshot.grandTotal;
        const currency = quotation.issuedSnapshot.clientInfo?.currency || '';
        const subject = (req.body && req.body.subject) || `Quotation ${quotation.quotationId} from Cravora Solutions`;
        const entry = {
            kind: 'quotation',
            documentType: 'quotation',
            recipient,
            at: new Date(),
            status: 'sent',
        };
        try {
            await sendDocumentEmail({
                to: recipient,
                subject,
                html: documentEmailHtml({
                    kind: 'quotation',
                    number: quotation.quotationId,
                    total,
                    currency,
                    link,
                    message: req.body && req.body.message,
                }),
                filename: `${quotation.quotationId}.pdf`,
                pdfBase64,
            });
            quotation.sentAt = new Date();
        } catch (error) {
            entry.status = 'failed';
            entry.error = error.code === 'EMAIL_NOT_CONFIGURED' ? 'Email is not configured' : 'Email could not be sent';
        }
        quotation.emailLog = quotation.emailLog || [];
        quotation.emailLog.push(entry);
        await quotation.save();
        await logAudit('quotation_email', 'quotation', quotation.quotationId, {
            recipient,
            status: entry.status,
        });
        if (entry.status === 'failed') {
            return res.status(503).json({ message: entry.error, quotation });
        }
        res.json({ message: 'Quotation email sent', quotation });
    } catch (err) {
        res.status(400).json({ message: 'Could not send quotation email' });
    }
});

router.post('/:id/convert', async (req, res) => {
    try {
        const quotation = await Quotation.findOne({ quotationId: req.params.id });
        if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
        const current = displayStatus(quotation);
        const billingReady = quotation.documentType === 'Billing' && ['final', 'sent', 'viewed', 'accepted'].includes(current);
        const quoteReady = current === 'accepted' || current === 'converted';
        if (!billingReady && !quoteReady) {
            return res.status(400).json({ message: 'Only an accepted quotation or a finished bill can be converted' });
        }
        const existing = await Invoice.findOne({ quotationId: quotation.quotationId });
        if (existing) {
            if (!existing.issuedSnapshot && existing.status === 'draft') {
                issueInvoiceRecord(existing);
                await existing.save();
            }
            return res.json(existing);
        }
        const source = quotation.issuedSnapshot || quotation.toObject();
        const totals = computeTotals({
            modules: source.modules,
            discountRate: source.discountRate,
            tax: source.tax,
            gstDetails: source.gstDetails,
        });
        const due = new Date();
        due.setDate(due.getDate() + 15);
        const requestedDue = req.body && req.body.dueDate ? new Date(req.body.dueDate) : null;
        const billDue = source.validUntil ? new Date(source.validUntil) : null;
        const dueDate = requestedDue && !Number.isNaN(requestedDue.getTime())
            ? requestedDue
            : (billDue && !Number.isNaN(billDue.getTime()) ? billDue : due);
        const invoiceNumber = await nextDocumentNumber('INV', Invoice, 'invoiceNumber');
        const invoice = await Invoice.create({
            invoiceNumber,
            quotationId: quotation.quotationId,
            clientId: quotation.clientId || source.clientId || undefined,
            clientSnapshot: source.clientInfo || quotation.clientInfo,
            items: totals.modules,
            subtotal: totals.subtotal,
            discountRate: totals.discountRate,
            discountAmount: totals.discountAmount,
            tax: totals.tax,
            taxAmount: totals.taxAmount,
            gstDetails: totals.gstDetails,
            grandTotal: totals.grandTotal,
            currency: (source.clientInfo || quotation.clientInfo || {}).currency || 'INR',
            dueDate,
            status: 'draft',
            notes: source.notes || quotation.notes || '',
            terms: source.termsAndConditions || quotation.termsAndConditions || [],
            amountPaid: 0,
            balanceDue: totals.grandTotal,
        });
        issueInvoiceRecord(invoice);
        await invoice.save();
        quotation.status = 'converted';
        quotation.isDraft = false;
        await quotation.save();
        await logAudit('invoice_created', 'invoice', invoice.invoiceNumber, {
            quotationId: quotation.quotationId,
        });
        await logAudit('invoice_issued', 'invoice', invoice.invoiceNumber, {
            grandTotal: invoice.grandTotal,
        });
        res.status(201).json(invoice);
    } catch (err) {
        res.status(400).json({ message: err.message || 'Could not convert quotation' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const existing = await Quotation.findOne({ quotationId: req.params.id });
        if (!existing) return res.status(404).json({ message: 'Quotation not found' });

        // If an invoice is linked, prevent deletion only if payments have already been recorded
        const linkedInvoice = await Invoice.findOne({ quotationId: req.params.id });
        if (linkedInvoice) {
            const paymentsCount = await Payment.countDocuments({ invoiceId: linkedInvoice.invoiceNumber, status: 'recorded' });
            if (paymentsCount > 0) {
                return res.status(400).json({
                    message: `Cannot delete quotation: linked invoice ${linkedInvoice.invoiceNumber} already has recorded payments.`
                });
            }
            await Invoice.deleteOne({ invoiceNumber: linkedInvoice.invoiceNumber });
        }

        await Quotation.findOneAndDelete({ quotationId: req.params.id });
        await logAudit('quotation_deleted', 'quotation', req.params.id, {});
        res.json({ message: 'Quotation deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message || 'Could not delete quotation' });
    }
});

module.exports = router;
