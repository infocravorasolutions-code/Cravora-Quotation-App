const express = require('express');
const router = express.Router();
const Quotation = require('../models/Quotation');
const { logAudit } = require('../utils/audit');

function publicQuotation(doc) {
    const source = doc.issuedSnapshot || {};
    return {
        quotationId: doc.quotationId,
        documentType: source.documentType || doc.documentType,
        status: doc.status,
        clientInfo: source.clientInfo || {},
        modules: source.modules || [],
        tax: source.tax,
        discountRate: source.discountRate,
        discountAmount: source.discountAmount,
        termsAndConditions: source.termsAndConditions || [],
        gstDetails: source.gstDetails || {},
        subtotal: source.subtotal,
        taxAmount: source.taxAmount,
        grandTotal: source.grandTotal,
        notes: source.notes || '',
        validUntil: source.validUntil || null,
        issuedAt: source.issuedAt || doc.issuedAt,
        acceptedAt: doc.acceptedAt || null,
        rejectedAt: doc.rejectedAt || null,
        rejectionReason: doc.status === 'rejected' ? doc.rejectionReason || '' : '',
    };
}

router.get('/:token', async (req, res) => {
    try {
        const quotation = await Quotation.findOne({ publicToken: req.params.token });
        if (!quotation || !quotation.issuedSnapshot) {
            return res.status(404).json({ message: 'Quotation not found' });
        }
        if (quotation.status === 'sent') {
            quotation.status = 'viewed';
            quotation.viewedAt = new Date();
            await quotation.save();
            await logAudit('quotation_viewed', 'quotation', quotation.quotationId, {});
        }
        res.json(publicQuotation(quotation));
    } catch (err) {
        res.status(404).json({ message: 'Quotation not found' });
    }
});

router.post('/:token/accept', async (req, res) => {
    try {
        const quotation = await Quotation.findOne({ publicToken: req.params.token });
        if (!quotation || !quotation.issuedSnapshot) {
            return res.status(404).json({ message: 'Quotation not found' });
        }
        if (!['sent', 'viewed'].includes(quotation.status)) {
            return res.status(400).json({ message: 'This quotation can no longer be accepted' });
        }
        const ipHeader = req.headers['x-forwarded-for'];
        const ip = typeof ipHeader === 'string' ? ipHeader.split(',')[0].trim() : req.ip;
        quotation.status = 'accepted';
        quotation.isDraft = false;
        quotation.acceptedAt = new Date();
        quotation.acceptedBy = quotation.issuedSnapshot.clientInfo?.clientName || '';
        quotation.acceptedEmail = quotation.issuedSnapshot.clientInfo?.clientEmail || '';
        quotation.acceptedIp = ip || '';
        quotation.acceptedUserAgent = req.get('user-agent') || '';
        await quotation.save();
        await logAudit('quotation_accepted', 'quotation', quotation.quotationId, {
            acceptedBy: quotation.acceptedBy,
        });
        res.json(publicQuotation(quotation));
    } catch (err) {
        res.status(400).json({ message: 'Could not accept quotation' });
    }
});

router.post('/:token/reject', async (req, res) => {
    try {
        const quotation = await Quotation.findOne({ publicToken: req.params.token });
        if (!quotation || !quotation.issuedSnapshot) {
            return res.status(404).json({ message: 'Quotation not found' });
        }
        if (!['sent', 'viewed'].includes(quotation.status)) {
            return res.status(400).json({ message: 'This quotation can no longer be rejected' });
        }
        const reason = String((req.body && req.body.reason) || '').trim();
        if (!reason) return res.status(400).json({ message: 'A rejection reason is required' });
        quotation.status = 'rejected';
        quotation.isDraft = false;
        quotation.rejectedAt = new Date();
        quotation.rejectionReason = reason.slice(0, 1000);
        await quotation.save();
        await logAudit('quotation_rejected', 'quotation', quotation.quotationId, {
            reason: quotation.rejectionReason,
        });
        res.json(publicQuotation(quotation));
    } catch (err) {
        res.status(400).json({ message: 'Could not reject quotation' });
    }
});

module.exports = router;
