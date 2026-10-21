const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const Receipt = require('../models/Receipt');
const Account = require('../models/Account');
const LedgerEntry = require('../models/LedgerEntry');
const { round2 } = require('../utils/totals');
const { deriveInvoiceStatus, planClientReceipt, PAYMENT_METHODS } = require('../utils/finance');
const { nextDocumentNumber } = require('../utils/numbers');
const { logAudit } = require('../utils/audit');
const { pageQuery } = require('../utils/http');
const { requireFinance } = require('../utils/auth');

const METHODS = PAYMENT_METHODS;

async function paidTotal(invoiceNumber) {
    const rows = await Payment.find({ invoiceId: invoiceNumber, status: 'recorded' }).select('amount').lean();
    return round2(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
}

async function applyPaymentStatus(invoice) {
    const paid = await paidTotal(invoice.invoiceNumber);
    const next = deriveInvoiceStatus({
        status: invoice.status,
        grandTotal: invoice.grandTotal,
        amountPaid: paid,
        dueDate: invoice.dueDate,
    });
    invoice.amountPaid = next.amountPaid;
    invoice.balanceDue = next.balanceDue;
    invoice.status = next.status;
    return invoice;
}

router.get('/', async (req, res) => {
    try {
        const { page, limit, skip } = pageQuery(req);
        const filter = {};
        if (req.query.invoiceId) filter.invoiceId = String(req.query.invoiceId);
        if (req.query.paymentMethod) filter.paymentMethod = String(req.query.paymentMethod);
        if (req.query.status) filter.status = String(req.query.status);
        if (req.query.clientId) filter.clientId = String(req.query.clientId);
        if (req.query.from || req.query.to) {
            filter.paymentDate = {};
            if (req.query.from) filter.paymentDate.$gte = new Date(req.query.from);
            if (req.query.to) filter.paymentDate.$lte = new Date(req.query.to);
        }
        const [items, total] = await Promise.all([
            Payment.find(filter).sort({ paymentDate: -1 }).skip(skip).limit(limit),
            Payment.countDocuments(filter),
        ]);
        res.json({ items, total, page, limit });
    } catch (err) {
        res.status(500).json({ message: 'Could not load payments' });
    }
});

router.post('/', requireFinance, async (req, res) => {
    let idempotencyKey = '';
    try {
        const body = req.body || {};
        idempotencyKey = String(req.get('Idempotency-Key') || body.idempotencyKey || '').trim().slice(0, 80);
        if (idempotencyKey) {
            const existing = await Payment.findOne({ idempotencyKey });
            if (existing) {
                const existingInvoice = await Invoice.findOne({ invoiceNumber: existing.invoiceId });
                return res.json({ payment: existing, invoice: existingInvoice, duplicate: true });
            }
        }
        const invoice = await Invoice.findOne({ invoiceNumber: body.invoiceId });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        if (!invoice.issuedSnapshot || invoice.status === 'draft' || invoice.status === 'cancelled') {
            return res.status(400).json({ message: 'Payments can be recorded on an issued invoice' });
        }
        const amount = round2(body.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ message: 'Payment amount must be greater than zero' });
        }
        if (!METHODS.includes(body.paymentMethod)) {
            return res.status(400).json({ message: 'Payment method is not valid' });
        }
        const alreadyPaid = await paidTotal(invoice.invoiceNumber);
        const balance = round2(invoice.grandTotal - alreadyPaid);
        if (amount - balance > 0.009) {
            return res.status(400).json({ message: 'Payment exceeds the balance due' });
        }
        const paymentDate = body.paymentDate ? new Date(body.paymentDate) : new Date();
        if (Number.isNaN(paymentDate.getTime())) {
            return res.status(400).json({ message: 'Payment date is not valid' });
        }
        if (!body.accountId) {
            return res.status(400).json({ message: 'Choose the cash or bank account that received this payment' });
        }
        let accountId;
        if (body.accountId) {
            const account = await Account.findById(body.accountId);
            if (!account || account.isActive === false) {
                return res.status(400).json({ message: 'Choose an active account' });
            }
            if (account.currency !== (invoice.currency || 'INR')) {
                return res.status(400).json({ message: 'Currency does not match the account' });
            }
            accountId = account._id;
        }
        const payment = await Payment.create({
            invoiceId: invoice.invoiceNumber,
            clientId: invoice.clientId || undefined,
            amount,
            paymentDate,
            paymentMethod: body.paymentMethod,
            transactionReference: String(body.transactionReference || '').slice(0, 120),
            notes: String(body.notes || '').slice(0, 1000),
            status: 'recorded',
            source: 'invoice',
            currency: invoice.currency || 'INR',
            accountId,
            idempotencyKey: idempotencyKey || undefined,
        });
        await applyPaymentStatus(invoice);
        await invoice.save();
        try {
            const snapshot = invoice.clientSnapshot || {};
            const entry = planClientReceipt({
                ...payment.toObject(),
                currency: invoice.currency || 'INR',
                partyName: snapshot.clientName || snapshot.companyName || '',
            });
            if (entry) {
                entry.entryNumber = await nextDocumentNumber('LED', LedgerEntry, 'entryNumber');
                entry.createdBy = req.auth.email || '';
                await LedgerEntry.create(entry);
            }
        } catch (ledgerError) {
            if (!ledgerError || ledgerError.code !== 11000) console.error('Payment ledger link failed');
        }
        await logAudit('payment_recorded', 'payment', payment._id, {
            invoiceId: invoice.invoiceNumber,
            amount,
        });
        res.status(201).json({ payment, invoice });
    } catch (err) {
        if (err && err.code === 11000 && idempotencyKey) {
            const existing = await Payment.findOne({ idempotencyKey });
            if (existing) {
                const existingInvoice = await Invoice.findOne({ invoiceNumber: existing.invoiceId });
                return res.json({ payment: existing, invoice: existingInvoice, duplicate: true });
            }
        }
        res.status(400).json({ message: 'Could not record payment' });
    }
});

router.post('/:id/receipt', requireFinance, async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        if (!payment || payment.status !== 'recorded') {
            return res.status(404).json({ message: 'Payment not found' });
        }
        const existing = await Receipt.findOne({ paymentId: payment._id });
        if (existing) return res.json(existing);
        const invoice = await Invoice.findOne({ invoiceNumber: payment.invoiceId });
        if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
        const receiptNumber = await nextDocumentNumber('RCP', Receipt, 'receiptNumber');
        const snapshot = {
            receiptNumber,
            invoiceNumber: invoice.invoiceNumber,
            clientSnapshot: invoice.clientSnapshot,
            amount: payment.amount,
            paymentDate: payment.paymentDate,
            paymentMethod: payment.paymentMethod,
            transactionReference: payment.transactionReference,
            invoiceTotal: invoice.grandTotal,
            amountPaid: invoice.amountPaid,
            balanceDue: invoice.balanceDue,
            currency: invoice.currency,
        };
        const receipt = await Receipt.create({
            ...snapshot,
            paymentId: payment._id,
            invoiceId: invoice.invoiceNumber,
            issuedSnapshot: snapshot,
        });
        await logAudit('receipt_generated', 'receipt', receipt.receiptNumber, {
            invoiceId: invoice.invoiceNumber,
        });
        res.status(201).json(receipt);
    } catch (err) {
        res.status(400).json({ message: 'Could not create receipt' });
    }
});

router.put('/:id', requireFinance, async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        if (!payment) return res.status(404).json({ message: 'Payment not found' });

        const body = req.body || {};
        if (body.amount !== undefined) {
            const amt = round2(body.amount);
            if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ message: 'Invalid payment amount' });
            payment.amount = amt;
        }
        if (body.paymentDate) {
            const d = new Date(body.paymentDate);
            if (!Number.isNaN(d.getTime())) payment.paymentDate = d;
        }
        if (body.paymentMethod && METHODS.includes(body.paymentMethod)) {
            payment.paymentMethod = body.paymentMethod;
        }
        if (body.transactionReference !== undefined) {
            payment.transactionReference = String(body.transactionReference).slice(0, 120);
        }
        if (body.notes !== undefined) {
            payment.notes = String(body.notes).slice(0, 1000);
        }
        if (body.accountId) {
            const account = await Account.findById(body.accountId);
            if (account && account.isActive !== false) payment.accountId = account._id;
        }

        await payment.save();

        let updatedInvoice = null;
        if (payment.invoiceId) {
            const invoice = await Invoice.findOne({ invoiceNumber: payment.invoiceId });
            if (invoice) {
                await applyPaymentStatus(invoice);
                await invoice.save();
                updatedInvoice = invoice;

                await Receipt.updateMany(
                    { paymentId: payment._id },
                    {
                        $set: {
                            amount: payment.amount,
                            paymentDate: payment.paymentDate,
                            paymentMethod: payment.paymentMethod,
                            transactionReference: payment.transactionReference,
                            amountPaid: invoice.amountPaid,
                            balanceDue: invoice.balanceDue,
                        }
                    }
                );
            }
        }

        await logAudit('payment_updated', 'payment', String(payment._id), {
            amount: payment.amount,
        });
        res.json({ payment, invoice: updatedInvoice });
    } catch (err) {
        res.status(400).json({ message: err.message || 'Could not update payment' });
    }
});

router.delete('/:id', requireFinance, async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        if (!payment) return res.status(404).json({ message: 'Payment not found' });

        await Receipt.deleteMany({ paymentId: payment._id });

        const invoiceId = payment.invoiceId;
        await Payment.findByIdAndDelete(payment._id);

        if (invoiceId) {
            const invoice = await Invoice.findOne({ invoiceNumber: invoiceId });
            if (invoice) {
                await applyPaymentStatus(invoice);
                await invoice.save();
            }
        }

        await logAudit('payment_deleted', 'payment', String(payment._id), {
            invoiceId,
            amount: payment.amount,
        });
        res.json({ message: 'Payment deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message || 'Could not delete payment' });
    }
});

module.exports = router;
