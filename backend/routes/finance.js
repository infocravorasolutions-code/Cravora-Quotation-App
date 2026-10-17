const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const router = express.Router();
const Account = require('../models/Account');
const LedgerEntry = require('../models/LedgerEntry');
const Vendor = require('../models/Vendor');
const ExpenseCategory = require('../models/ExpenseCategory');
const Expense = require('../models/Expense');
const VendorBill = require('../models/VendorBill');
const Allocation = require('../models/Allocation');
const Client = require('../models/Client');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const User = require('../models/User');
const StatementBatch = require('../models/StatementBatch');
const StatementLine = require('../models/StatementLine');
const { requireFinance } = require('../utils/auth');
const { runTransaction, transactionsSupported } = require('../utils/transaction');
const { nextDocumentNumber } = require('../utils/numbers');
const { logAudit } = require('../utils/audit');
const { pageQuery } = require('../utils/http');
const { isEmail, isGstin, isMobile, round2 } = require('../utils/totals');
const {
    PAYMENT_METHODS,
    sumMoney,
    deriveInvoiceStatus,
    deriveObligation,
    invoicePosition,
    isOverdueInvoice,
    unallocatedAmount,
    emptyMoney,
    addBucket,
    planAdvance,
    planAllocation,
    planTransfer,
    planAdjustment,
    planOpening,
    planExpenseDocument,
    planPartnerReimbursement,
    partnerPayableRows,
    spentInRange,
    spendBreakdown,
    statementFingerprint,
    matchStatementLine,
    duplicateSupplierName,
    planVendorBill,
    planObligationPayment,
    buildReversal,
    financeSummary,
    accountBalance,
    receivableRows,
    transactionRows,
    dateBounds,
    childFromSeries,
    toCents,
} = require('../utils/finance');

router.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    return requireFinance(req, res, next);
});

function fail(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    throw error;
}

function requestKey(req) {
    return String(req.get('Idempotency-Key') || (req.body && req.body.idempotencyKey) || '').trim().slice(0, 80);
}

function compact(doc) {
    const next = {};
    Object.entries(doc).forEach(([key, value]) => {
        if (value !== undefined) next[key] = value;
    });
    return next;
}

function postedAtFrom(value) {
    if (!value) return new Date();
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) fail('Date is not valid');
    return date;
}

async function createOne(Model, doc, session) {
    const rows = await Model.create([compact(doc)], { session });
    return rows[0];
}

async function addLedger(fields, session) {
    const entryNumber = await nextDocumentNumber('LED', LedgerEntry, 'entryNumber', session);
    return createOne(LedgerEntry, {
        ...fields,
        entryNumber,
        status: 'posted',
        postedAt: fields.postedAt || new Date(),
    }, session);
}

async function postFinancial(res, options, work) {
    const key = options.key || '';
    if (key && options.find) {
        const existing = await options.find(key);
        if (existing) return res.json({ ...existing, duplicate: true });
    }
    try {
        const result = await runTransaction((session) => work(session));
        if (options.audit) {
            await logAudit(
                options.audit.action,
                options.audit.entityType,
                options.audit.entityId(result),
                options.audit.metadata(result)
            );
        }
        return res.status(options.status || 201).json(result);
    } catch (error) {
        if (error && error.code === 11000 && key && options.find) {
            const existing = await options.find(key);
            if (existing) return res.json({ ...existing, duplicate: true });
        }
        if (error && error.status) return res.status(error.status).json({ message: error.message });
        return res.status(400).json({ message: options.fallback });
    }
}

async function loadAccount(id, session) {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) fail('Choose an active account');
    const account = await Account.findById(id).session(session);
    if (!account || account.isActive === false) fail('Choose an active account');
    return account;
}

async function refreshInvoice(invoiceNumber, session) {
    const invoice = await Invoice.findOne({ invoiceNumber }).session(session);
    if (!invoice) fail('Invoice not found', 404);
    const payments = await Payment.find({ invoiceId: invoiceNumber, status: 'recorded' }).session(session);
    const next = deriveInvoiceStatus({
        status: invoice.status,
        grandTotal: invoice.grandTotal,
        amountPaid: sumMoney(payments.map((payment) => payment.amount)),
        dueDate: invoice.dueDate,
    });
    invoice.amountPaid = next.amountPaid;
    invoice.balanceDue = next.balanceDue;
    invoice.status = next.status;
    await invoice.save({ session });
    return invoice;
}

async function refreshObligation(Model, id, kind, field, session) {
    const doc = await Model.findById(id).session(session);
    if (!doc) fail('Record not found', 404);
    const entries = await LedgerEntry.find({ [field]: doc._id, kind, reversedBy: null }).session(session);
    const next = deriveObligation({
        amount: doc.amount,
        amountPaid: sumMoney(entries.map((entry) => entry.amount)),
        voided: doc.status === 'void',
    });
    doc.amountPaid = next.amountPaid;
    doc.balanceDue = next.balanceDue;
    if (doc.status !== 'void') doc.status = next.status;
    await doc.save({ session });
    return doc;
}

function hideFile(doc) {
    const json = doc.toObject ? doc.toObject() : { ...doc };
    if (json.attachment) {
        json.hasAttachment = Boolean(json.attachment.data);
        delete json.attachment.data;
    } else {
        json.hasAttachment = false;
    }
    return json;
}

function accountCode(name) {
    const base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
    return base || 'account';
}

function vendorError(body) {
    if (!String(body.name || '').trim()) return 'Vendor name is required';
    if (body.email && !isEmail(body.email)) return 'A valid email is required';
    if (body.phone && !isMobile(body.phone)) return 'Mobile must contain 8 to 15 digits';
    if (!isGstin(body.gstin)) return 'GSTIN is not valid';
    return '';
}

function vendorPayload(body) {
    return {
        name: String(body.name || '').trim().slice(0, 160),
        email: String(body.email || '').trim().toLowerCase(),
        phone: String(body.phone || '').trim(),
        gstin: String(body.gstin || '').trim().toUpperCase(),
        notes: String(body.notes || '').slice(0, 1000),
        isActive: body.isActive !== false,
    };
}

router.get('/summary', async (req, res) => {
    try {
        const now = new Date();
        const from = req.query.from || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
        const to = req.query.to || now.toISOString().slice(0, 10);
        const bounds = dateBounds(from, to);
        if (bounds.error) return res.status(400).json({ message: bounds.error });
        const [invoices, payments, invoiceCurrencies, ledger, expenses, vendorBills, accounts, recent, transactionsAvailable, statementReviewCount] = await Promise.all([
            Invoice.find({ status: { $nin: ['draft', 'cancelled'] }, balanceDue: { $gt: 0 } })
                .select('invoiceNumber clientId clientSnapshot grandTotal amountPaid balanceDue status dueDate currency issueDate')
                .lean(),
            Payment.find({ status: 'recorded' }).select('invoiceId amount status source currency paymentDate accountId clientId').lean(),
            Invoice.find().select('invoiceNumber currency').lean(),
            LedgerEntry.find().select('kind amount currency accountId counterAccountId direction cashEffect affectsIncome affectsExpense postedAt reversedBy paymentId clientId').lean(),
            Expense.find({ status: { $ne: 'void' } }).select('expenseNumber description vendorName amount balanceDue status currency dueDate expenseDate categoryName paymentSource paidByUserId paidByName reimbursedAmount').lean(),
            VendorBill.find({ status: { $ne: 'void' } }).select('billNumber description vendorName amount balanceDue status currency dueDate').lean(),
            Account.find().sort({ name: 1 }).lean(),
            LedgerEntry.find().sort({ postedAt: -1 }).limit(8).select('entryNumber kind amount currency partyName postedAt direction reference').lean(),
            transactionsSupported(),
            StatementLine.countDocuments({ status: { $in: ['unmatched', 'potential_duplicate', 'needs_review'] } }),
        ]);
        const currencyByInvoice = {};
        invoiceCurrencies.forEach((invoice) => {
            currencyByInvoice[invoice.invoiceNumber] = invoice.currency || 'INR';
        });
        const paymentsWithCurrency = payments.map((payment) => ({
            ...payment,
            currency: payment.currency || currencyByInvoice[payment.invoiceId] || 'INR',
        }));
        const summary = financeSummary({
            invoices,
            payments: paymentsWithCurrency,
            ledger,
            expenses,
            vendorBills,
            accounts,
            now,
            from,
            to,
        });
        const attentionRow = (invoice) => ({
            invoiceNumber: invoice.invoiceNumber,
            party: (invoice.clientSnapshot && (invoice.clientSnapshot.clientName || invoice.clientSnapshot.companyName)) || '',
            balanceDue: invoice.balanceDue,
            currency: invoice.currency || 'INR',
            dueDate: invoice.dueDate,
        });
        const overdueInvoices = invoices.filter((invoice) => isOverdueInvoice(invoice, now)).slice(0, 8).map(attentionRow);
        const soon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        const dueSoonInvoices = invoices.filter((invoice) => {
            if (isOverdueInvoice(invoice, now) || !invoice.dueDate) return false;
            if (!['issued', 'partially_paid'].includes(invoice.status)) return false;
            const due = new Date(invoice.dueDate);
            return due >= now && due <= soon;
        }).slice(0, 8).map(attentionRow);
        res.json({
            ...summary,
            from,
            to,
            overdueInvoices,
            dueSoonInvoices,
            moneySpent: spentInRange(ledger, from, to),
            spendBreakdown: spendBreakdown(expenses, from, to),
            partnerPayables: partnerPayableRows(expenses),
            statementReviewCount,
            upcoming: summary.upcoming.slice(0, 12),
            recent,
            transactionsAvailable,
        });
    } catch (err) {
        res.status(500).json({ message: 'Could not load the accounts dashboard' });
    }
});

router.get('/accounts', async (req, res) => {
    try {
        const accounts = await Account.find().sort({ name: 1 }).lean();
        const ledger = await LedgerEntry.find().select('kind amount accountId counterAccountId direction cashEffect').lean();
        res.json({
            items: accounts.map((account) => ({ ...account, balance: accountBalance(ledger, account._id) })),
            total: accounts.length,
        });
    } catch (err) {
        res.status(500).json({ message: 'Could not load accounts' });
    }
});

router.post('/accounts', async (req, res) => {
    const body = req.body || {};
    return postFinancial(res, {
        key: requestKey(req),
        fallback: 'Could not create the account',
        find: async (idempotencyKey) => {
            const account = await Account.findOne({ idempotencyKey });
            return account ? { account } : null;
        },
        audit: {
            action: 'account_created',
            entityType: 'account',
            entityId: (result) => result.account.code,
            metadata: (result) => ({ name: result.account.name, email: req.auth.email }),
        },
    }, async (session) => {
        const name = String(body.name || '').trim().slice(0, 80);
        if (!name) fail('Account name is required');
        if (!['cash', 'bank'].includes(body.type)) fail('Account type must be cash or bank');
        if (!['INR', 'USD'].includes(body.currency)) fail('Currency must be INR or USD');
        const opening = planOpening({ amount: body.openingBalance || 0, account: { _id: new mongoose.Types.ObjectId(), currency: body.currency } });
        if (opening.error) fail(opening.error);
        let code = accountCode(name);
        for (let attempt = 1; attempt < 20; attempt += 1) {
            const clash = await Account.exists({ code }).session(session);
            if (!clash) break;
            code = `${accountCode(name)}-${attempt + 1}`;
        }
        const account = await createOne(Account, {
            name,
            code,
            type: body.type,
            currency: body.currency,
            openingBalance: Number(body.openingBalance || 0),
            isActive: true,
            idempotencyKey: requestKey(req) || undefined,
        }, session);
        if (opening.entry) {
            await addLedger({ ...opening.entry, accountId: account._id, partyName: account.name }, session);
        }
        return { account };
    });
});

router.post('/accounts/:id/active', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Account not found' });
        const account = await Account.findById(req.params.id);
        if (!account) return res.status(404).json({ message: 'Account not found' });
        account.isActive = Boolean(req.body && req.body.isActive);
        await account.save();
        await logAudit('account_updated', 'account', account.code, { isActive: account.isActive, email: req.auth.email });
        res.json({ account });
    } catch (err) {
        res.status(400).json({ message: 'Could not update the account' });
    }
});

router.patch('/accounts/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Account not found' });
        const account = await Account.findById(req.params.id);
        if (!account) return res.status(404).json({ message: 'Account not found' });
        const body = req.body || {};
        if (body.name !== undefined) {
            const name = String(body.name || '').trim().slice(0, 80);
            if (!name) return res.status(400).json({ message: 'Account name is required' });
            account.name = name;
        }
        if (body.type !== undefined) {
            if (!['cash', 'bank'].includes(body.type)) return res.status(400).json({ message: 'Account type must be cash or bank' });
            account.type = body.type;
        }
        if (body.currency !== undefined) {
            return res.status(400).json({ message: 'Currency cannot be changed. Create a new account instead.' });
        }
        await account.save();
        await logAudit('account_updated', 'account', account.code, { name: account.name, type: account.type, email: req.auth.email });
        res.json({ account });
    } catch (err) {
        res.status(400).json({ message: 'Could not update the account' });
    }
});

router.delete('/accounts/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Account not found' });
        const account = await Account.findById(req.params.id);
        if (!account) return res.status(404).json({ message: 'Account not found' });
        const openCount = await LedgerEntry.countDocuments({
            $or: [{ accountId: account._id }, { counterAccountId: account._id }],
            reversedBy: null,
            kind: { $ne: 'reversal' },
        });
        if (openCount > 0) {
            account.isActive = false;
            await account.save();
            await logAudit('account_closed', 'account', account.code, { email: req.auth.email });
            return res.json({
                account,
                closed: true,
                message: 'This account has movements, so it was closed instead of deleted. Undo those movements first if you want it removed.',
            });
        }
        await Account.deleteOne({ _id: account._id });
        await logAudit('account_deleted', 'account', account.code, { email: req.auth.email });
        res.json({ deleted: true, accountId: String(account._id) });
    } catch (err) {
        res.status(400).json({ message: 'Could not remove the account' });
    }
});

router.get('/register', async (req, res) => {
    try {
        const { page, limit, skip } = pageQuery(req);
        const bounds = dateBounds(req.query.from, req.query.to);
        if (bounds.error) return res.status(400).json({ message: bounds.error });
        const filter = {};
        if (req.query.kind) filter.kind = String(req.query.kind);
        if (req.query.accountId && mongoose.Types.ObjectId.isValid(String(req.query.accountId))) {
            filter.$or = [{ accountId: req.query.accountId }, { counterAccountId: req.query.accountId }];
        }
        if (bounds.from || bounds.to) {
            filter.postedAt = {};
            if (bounds.from) filter.postedAt.$gte = bounds.from;
            if (bounds.to) filter.postedAt.$lte = bounds.to;
        }
        const [items, total] = await Promise.all([
            LedgerEntry.find(filter).sort({ postedAt: -1 }).skip(skip).limit(limit),
            LedgerEntry.countDocuments(filter),
        ]);
        res.json({ items, total, page, limit });
    } catch (err) {
        res.status(500).json({ message: 'Could not load the register' });
    }
});

router.post('/transfers', async (req, res) => {
    const body = req.body || {};
    const key = requestKey(req);
    return postFinancial(res, {
        key,
        fallback: 'Could not record the transfer',
        find: async (idempotencyKey) => {
            const entry = await LedgerEntry.findOne({ idempotencyKey });
            return entry ? { entry } : null;
        },
        audit: {
            action: 'transfer_posted',
            entityType: 'ledger',
            entityId: (result) => result.entry.entryNumber,
            metadata: (result) => ({ amount: result.entry.amount, email: req.auth.email }),
        },
    }, async (session) => {
        const fromAccount = await loadAccount(body.fromAccountId, session);
        const toAccount = await loadAccount(body.toAccountId, session);
        const plan = planTransfer({ amount: body.amount, fromAccount, toAccount });
        if (plan.error) fail(plan.error);
        const entry = await addLedger({
            ...plan.entry,
            postedAt: postedAtFrom(body.postedAt),
            reference: String(body.reference || '').slice(0, 120),
            notes: String(body.notes || '').slice(0, 1000),
            idempotencyKey: key || undefined,
        }, session);
        return { entry };
    });
});

router.post('/adjustments', async (req, res) => {
    const body = req.body || {};
    const key = requestKey(req);
    return postFinancial(res, {
        key,
        fallback: 'Could not record the adjustment',
        find: async (idempotencyKey) => {
            const entry = await LedgerEntry.findOne({ idempotencyKey });
            return entry ? { entry } : null;
        },
        audit: {
            action: 'adjustment_posted',
            entityType: 'ledger',
            entityId: (result) => result.entry.entryNumber,
            metadata: (result) => ({ amount: result.entry.amount, email: req.auth.email }),
        },
    }, async (session) => {
        const account = await loadAccount(body.accountId, session);
        const plan = planAdjustment({ amount: body.amount, direction: body.direction, account, notes: body.notes });
        if (plan.error) fail(plan.error);
        const entry = await addLedger({
            ...plan.entry,
            postedAt: postedAtFrom(body.postedAt),
            reference: String(body.reference || '').slice(0, 120),
            idempotencyKey: key || undefined,
        }, session);
        return { entry };
    });
});

router.post('/entries/:id/reverse', async (req, res) => {
    const key = requestKey(req);
    return postFinancial(res, {
        key,
        fallback: 'Could not reverse the entry',
        find: async (idempotencyKey) => {
            const entry = await LedgerEntry.findOne({ idempotencyKey });
            return entry ? { entry } : null;
        },
        audit: {
            action: 'ledger_reversed',
            entityType: 'ledger',
            entityId: (result) => result.entry.entryNumber,
            metadata: (result) => ({ reversalOf: String(result.entry.reversalOf || ''), email: req.auth.email }),
        },
    }, async (session) => {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) fail('Entry not found', 404);
        const entry = await LedgerEntry.findById(req.params.id).session(session);
        if (!entry) fail('Entry not found', 404);
        if (entry.kind === 'advance') {
            const openAllocations = await Allocation.countDocuments({ sourceEntryId: entry._id, status: 'posted' }).session(session);
            if (openAllocations) fail('Reverse the invoice allocations before reversing this advance');
        }
        const plan = buildReversal(entry, new Date());
        if (plan.error) fail(plan.error);
        const reversal = await addLedger({ ...plan.reversal, idempotencyKey: key || undefined }, session);
        const locked = await LedgerEntry.findOneAndUpdate(
            { _id: entry._id, reversedBy: null },
            { $set: { reversedBy: reversal._id } },
            { new: true, session }
        );
        if (!locked) fail('This entry is already reversed');
        if ((entry.kind === 'client_receipt' || entry.kind === 'invoice_allocation') && entry.paymentId) {
            const payment = await Payment.findById(entry.paymentId).session(session);
            if (payment && payment.status === 'recorded') {
                payment.status = 'reversed';
                await payment.save({ session });
                await refreshInvoice(payment.invoiceId, session);
            }
            if (entry.kind === 'invoice_allocation') {
                await Allocation.updateMany(
                    { paymentId: entry.paymentId, status: 'posted' },
                    { $set: { status: 'reversed' } },
                    { session }
                );
            }
        }
        if (entry.kind === 'expense_payment' && entry.expenseId) {
            await refreshObligation(Expense, entry.expenseId, 'expense_payment', 'expenseId', session);
        }
        if (entry.kind === 'vendor_payment' && entry.vendorBillId) {
            await refreshObligation(VendorBill, entry.vendorBillId, 'vendor_payment', 'vendorBillId', session);
        }
        if (entry.kind === 'partner_reimbursement' && entry.expenseId) {
            const expense = await Expense.findById(entry.expenseId).session(session);
            if (expense) {
                const rows = await LedgerEntry.find({
                    expenseId: expense._id,
                    kind: 'partner_reimbursement',
                    reversedBy: null,
                }).session(session);
                expense.reimbursedAmount = sumMoney(rows.map((row) => row.amount));
                expense.updatedBy = req.auth.email || '';
                await expense.save({ session });
            }
        }
        return { entry: reversal };
    });
});

router.get('/vendors', async (req, res) => {
    try {
        const { page, limit, skip } = pageQuery(req);
        const filter = {};
        if (req.query.q) filter.name = new RegExp(String(req.query.q).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const [items, total] = await Promise.all([
            Vendor.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
            Vendor.countDocuments(filter),
        ]);
        res.json({ items, total, page, limit });
    } catch (err) {
        res.status(500).json({ message: 'Could not load vendors' });
    }
});

router.post('/vendors', async (req, res) => {
    const message = vendorError(req.body || {});
    if (message) return res.status(400).json({ message });
    try {
        const payload = vendorPayload(req.body || {});
        const existing = await Vendor.find().select('name').lean();
        if (duplicateSupplierName(existing, payload.name)) {
            return res.status(400).json({ message: 'That supplier already exists' });
        }
        const vendor = await Vendor.create(payload);
        await logAudit('vendor_created', 'vendor', vendor._id, { name: vendor.name, email: req.auth.email });
        res.status(201).json(vendor);
    } catch (err) {
        res.status(400).json({ message: 'Could not create the vendor' });
    }
});

router.put('/vendors/:id', async (req, res) => {
    const message = vendorError(req.body || {});
    if (message) return res.status(400).json({ message });
    try {
        const vendor = await Vendor.findByIdAndUpdate(req.params.id, vendorPayload(req.body || {}), { new: true, runValidators: true });
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
        await logAudit('vendor_updated', 'vendor', vendor._id, { name: vendor.name, email: req.auth.email });
        res.json(vendor);
    } catch (err) {
        res.status(400).json({ message: 'Could not update the vendor' });
    }
});

router.get('/categories', async (req, res) => {
    try {
        const filter = {};
        if (req.query.kind) filter.kind = String(req.query.kind);
        const items = await ExpenseCategory.find(filter).sort({ name: 1 });
        res.json({ items, total: items.length });
    } catch (err) {
        res.status(500).json({ message: 'Could not load categories' });
    }
});

router.post('/categories', async (req, res) => {
    try {
        const name = String((req.body && req.body.name) || '').trim().slice(0, 80);
        if (!name) return res.status(400).json({ message: 'Category name is required' });
        if (!['operating', 'vendor'].includes(req.body && req.body.kind)) {
            return res.status(400).json({ message: 'Category type is not valid' });
        }
        const category = await ExpenseCategory.create({ name, kind: req.body.kind });
        await logAudit('category_created', 'category', category._id, { name, email: req.auth.email });
        res.status(201).json(category);
    } catch (err) {
        if (err && err.code === 11000) return res.status(400).json({ message: 'That category already exists' });
        res.status(400).json({ message: 'Could not create the category' });
    }
});

router.patch('/categories/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Category not found' });
        const category = await ExpenseCategory.findById(req.params.id);
        if (!category) return res.status(404).json({ message: 'Category not found' });
        const name = String((req.body && req.body.name) || '').trim().slice(0, 80);
        if (!name) return res.status(400).json({ message: 'Category name is required' });
        category.name = name;
        await category.save();
        await Expense.updateMany({ categoryId: category._id }, { $set: { categoryName: name } });
        await logAudit('category_updated', 'category', category._id, { name, email: req.auth.email });
        res.json(category);
    } catch (err) {
        if (err && err.code === 11000) return res.status(400).json({ message: 'That category already exists' });
        res.status(400).json({ message: 'Could not update the category' });
    }
});

router.delete('/categories/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Category not found' });
        const category = await ExpenseCategory.findById(req.params.id);
        if (!category) return res.status(404).json({ message: 'Category not found' });
        const inUse = await Expense.countDocuments({ categoryId: category._id, status: { $ne: 'void' } });
        if (inUse > 0) return res.status(400).json({ message: 'This category is used on expenses. Void or reassign those first.' });
        await ExpenseCategory.deleteOne({ _id: category._id });
        await logAudit('category_deleted', 'category', category._id, { name: category.name, email: req.auth.email });
        res.json({ deleted: true });
    } catch (err) {
        res.status(400).json({ message: 'Could not delete the category' });
    }
});

router.get('/expenses', async (req, res) => {
    try {
        const { page, limit, skip } = pageQuery(req);
        const bounds = dateBounds(req.query.from, req.query.to);
        if (bounds.error) return res.status(400).json({ message: bounds.error });
        const filter = {};
        if (req.query.status) filter.status = String(req.query.status);
        if (req.query.paymentSource) filter.paymentSource = String(req.query.paymentSource);
        if (req.query.partner && mongoose.Types.ObjectId.isValid(String(req.query.partner))) filter.paidByUserId = req.query.partner;
        if (req.query.categoryId && mongoose.Types.ObjectId.isValid(String(req.query.categoryId))) filter.categoryId = req.query.categoryId;
        if (bounds.from || bounds.to) {
            filter.expenseDate = {};
            if (bounds.from) filter.expenseDate.$gte = bounds.from;
            if (bounds.to) filter.expenseDate.$lte = bounds.to;
        }
        const [items, total] = await Promise.all([
            Expense.find(filter).select('-attachment.data').sort({ expenseDate: -1 }).skip(skip).limit(limit),
            Expense.countDocuments(filter),
        ]);
        res.json({ items: items.map(hideFile), total, page, limit });
    } catch (err) {
        res.status(500).json({ message: 'Could not load expenses' });
    }
});

router.get('/expenses/:id', async (req, res) => {
    try {
        const expense = await Expense.findById(req.params.id);
        if (!expense) return res.status(404).json({ message: 'Expense not found' });
        res.json(expense);
    } catch (err) {
        res.status(404).json({ message: 'Expense not found' });
    }
});

router.post('/expenses', async (req, res) => {
    const body = req.body || {};
    const key = requestKey(req);
    return postFinancial(res, {
        key,
        fallback: 'Could not record the expense',
        find: async (idempotencyKey) => {
            const expense = await Expense.findOne({ idempotencyKey }).select('-attachment.data');
            return expense ? { expense: hideFile(expense) } : null;
        },
        audit: {
            action: 'expense_posted',
            entityType: 'expense',
            entityId: (result) => result.expense.expenseNumber,
            metadata: (result) => ({ amount: result.expense.amount, email: req.auth.email }),
        },
    }, async (session) => {
        const category = body.categoryId ? await ExpenseCategory.findById(body.categoryId).session(session) : null;
        const plan = planExpenseDocument(body, category);
        if (plan.error) fail(plan.error);
        let vendor = null;
        if (body.vendorId) {
            if (!mongoose.Types.ObjectId.isValid(String(body.vendorId))) fail('Vendor not found', 404);
            vendor = await Vendor.findById(body.vendorId).session(session);
            if (!vendor) fail('Vendor not found', 404);
        }
        const partnerPaid = plan.paymentSource === 'partner_personal';
        let paidByName = '';
        if (partnerPaid) {
            const partner = await User.findById(plan.paidByUserId).session(session);
            if (!partner) fail('Choose the partner who paid', 404);
            paidByName = partner.email;
        }
        const expenseNumber = await nextDocumentNumber('EXP', Expense, 'expenseNumber', session);
        const expense = await createOne(Expense, {
            ...plan,
            expenseNumber,
            categoryId: category._id,
            vendorId: vendor ? vendor._id : undefined,
            vendorName: vendor ? vendor.name : '',
            paidByName,
            reimbursedAmount: 0,
            createdBy: req.auth.email || '',
            updatedBy: req.auth.email || '',
            amountPaid: partnerPaid ? plan.amount : 0,
            balanceDue: partnerPaid ? 0 : plan.amount,
            status: partnerPaid ? 'paid' : 'open',
            idempotencyKey: key || undefined,
        }, session);
        expense.seriesId = expense._id;
        await expense.save({ session });
        if (!partnerPaid && body.paidAmount !== undefined && body.paidAmount !== '' && Number(body.paidAmount) > 0) {
            if (!PAYMENT_METHODS.includes(body.paymentMethod)) fail('Payment method is not valid');
            const account = await loadAccount(body.accountId, session);
            const payment = planObligationPayment({
                kind: 'expense_payment',
                document: expense,
                amount: body.paidAmount,
                account,
                vendorId: vendor ? vendor._id : undefined,
            });
            if (payment.error) fail(payment.error);
            await addLedger({
                ...payment.ledger,
                method: body.paymentMethod,
                reference: String(body.reference || plan.reference || '').slice(0, 120),
                postedAt: plan.expenseDate,
                idempotencyKey: key ? `pay:${key}` : undefined,
            }, session);
            await refreshObligation(Expense, expense._id, 'expense_payment', 'expenseId', session);
        }
        const saved = await Expense.findById(expense._id).session(session);
        return { expense: hideFile(saved) };
    });
});

router.post('/expenses/:id/payments', async (req, res) => {
    const body = req.body || {};
    const key = requestKey(req);
    return postFinancial(res, {
        key,
        fallback: 'Could not record the expense payment',
        find: async (idempotencyKey) => {
            const entry = await LedgerEntry.findOne({ idempotencyKey });
            return entry ? { entry } : null;
        },
        audit: {
            action: 'expense_paid',
            entityType: 'ledger',
            entityId: (result) => result.entry.entryNumber,
            metadata: (result) => ({ amount: result.entry.amount, email: req.auth.email }),
        },
    }, async (session) => {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) fail('Expense not found', 404);
        const expense = await Expense.findById(req.params.id).session(session);
        if (!expense) fail('Expense not found', 404);
        if (expense.paymentSource === 'partner_personal') fail('Reimburse this partner instead of paying the expense again');
        if (!PAYMENT_METHODS.includes(body.paymentMethod)) fail('Payment method is not valid');
        const account = await loadAccount(body.accountId, session);
        const payment = planObligationPayment({
            kind: 'expense_payment',
            document: expense,
            amount: body.amount,
            account,
            vendorId: body.vendorId || expense.vendorId,
        });
        if (payment.error) fail(payment.error);
        const entry = await addLedger({
            ...payment.ledger,
            method: body.paymentMethod,
            reference: String(body.reference || '').slice(0, 120),
            notes: String(body.notes || '').slice(0, 1000),
                postedAt: postedAtFrom(body.paymentDate),
                idempotencyKey: key || undefined,
                createdBy: req.auth.email || '',
            }, session);
        const updated = await refreshObligation(Expense, expense._id, 'expense_payment', 'expenseId', session);
        return { entry, expense: hideFile(updated) };
    });
});

router.post('/expenses/:id/void', async (req, res) => {
    const key = requestKey(req);
    return postFinancial(res, {
        key,
        fallback: 'Could not remove the expense',
        find: async () => null,
        audit: {
            action: 'expense_voided',
            entityType: 'expense',
            entityId: (result) => result.expense.expenseNumber,
            metadata: () => ({ email: req.auth.email }),
        },
    }, async (session) => {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) fail('Expense not found', 404);
        const expense = await Expense.findById(req.params.id).session(session);
        if (!expense) fail('Expense not found', 404);
        if (expense.status === 'void') return { expense: hideFile(expense) };
        const related = await LedgerEntry.find({
            expenseId: expense._id,
            kind: { $in: ['expense_payment', 'partner_reimbursement'] },
            reversedBy: null,
        }).session(session);
        for (const entry of related) {
            const plan = buildReversal(entry, new Date());
            if (plan.error) fail(plan.error);
            const reversal = await addLedger({
                ...plan.reversal,
                notes: `Removed with expense ${expense.expenseNumber}`,
                createdBy: req.auth.email || '',
            }, session);
            const locked = await LedgerEntry.findOneAndUpdate(
                { _id: entry._id, reversedBy: null },
                { $set: { reversedBy: reversal._id } },
                { new: true, session }
            );
            if (!locked) fail('Could not reverse a linked payment for this expense');
        }
        if (expense.paymentSource !== 'partner_personal') {
            await refreshObligation(Expense, expense._id, 'expense_payment', 'expenseId', session);
        } else {
            expense.reimbursedAmount = 0;
        }
        const fresh = await Expense.findById(expense._id).session(session);
        fresh.status = 'void';
        fresh.balanceDue = 0;
        fresh.amountPaid = 0;
        fresh.updatedBy = req.auth.email || '';
        await fresh.save({ session });
        return { expense: hideFile(fresh) };
    });
});

router.patch('/expenses/:id', async (req, res) => {
    try {
        const body = req.body || {};
        if (body.amount !== undefined || body.paymentSource !== undefined || body.paidByUserId !== undefined) {
            return res.status(400).json({ message: 'Amount, payment source, and partner are corrected by reversing the entry' });
        }
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Expense not found' });
        const expense = await Expense.findById(req.params.id);
        if (!expense) return res.status(404).json({ message: 'Expense not found' });
        if (expense.status === 'void') return res.status(400).json({ message: 'A void expense cannot be edited' });
        if (body.categoryId) {
            const category = await ExpenseCategory.findById(body.categoryId);
            if (!category || category.kind !== 'operating') return res.status(400).json({ message: 'Choose an expense category' });
            expense.categoryId = category._id;
            expense.categoryName = category.name;
        }
        if (body.description !== undefined) {
            const description = String(body.description).trim().slice(0, 300);
            if (!description) return res.status(400).json({ message: 'Description is required' });
            expense.description = description;
        }
        if (body.reference !== undefined) expense.reference = String(body.reference).slice(0, 120);
        if (body.notes !== undefined) expense.notes = String(body.notes).slice(0, 1000);
        if (body.attachment) {
            const file = body.attachment;
            const data = String(file.data || '');
            if (!['image/png', 'image/jpeg', 'application/pdf'].includes(file.mimeType)) {
                return res.status(400).json({ message: 'Attachment must be a PNG, JPEG, or PDF' });
            }
            if (!String(file.fileName || '').trim() || data.length > 700000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(data)) {
                return res.status(400).json({ message: 'Attachment is not valid' });
            }
            expense.attachment = {
                fileName: String(file.fileName).trim().slice(0, 180),
                mimeType: file.mimeType,
                data,
            };
        }
        expense.updatedBy = req.auth.email || '';
        await expense.save();
        await logAudit('expense_edited', 'expense', expense.expenseNumber, { email: req.auth.email });
        res.json({ expense: hideFile(expense) });
    } catch (err) {
        res.status(400).json({ message: 'Could not update the expense' });
    }
});

router.post('/expenses/:id/reimburse', async (req, res) => {
    const body = req.body || {};
    const key = requestKey(req);
    return postFinancial(res, {
        key,
        fallback: 'Could not record the reimbursement',
        find: async (idempotencyKey) => {
            const entry = await LedgerEntry.findOne({ idempotencyKey });
            return entry ? { entry } : null;
        },
        audit: {
            action: 'partner_reimbursed',
            entityType: 'ledger',
            entityId: (result) => result.entry.entryNumber,
            metadata: (result) => ({ amount: result.entry.amount, email: req.auth.email }),
        },
    }, async (session) => {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) fail('Expense not found', 404);
        const expense = await Expense.findById(req.params.id).session(session);
        if (!expense) fail('Expense not found', 404);
        const account = await loadAccount(body.accountId, session);
        const plan = planPartnerReimbursement({ expense, amount: body.amount, account });
        if (plan.error) fail(plan.error);
        const entry = await addLedger({
            ...plan.ledger,
            method: body.paymentMethod || 'bank_transfer',
            reference: String(body.reference || '').slice(0, 120),
            notes: String(body.notes || '').slice(0, 1000),
            postedAt: postedAtFrom(body.paymentDate),
            idempotencyKey: key || undefined,
            createdBy: req.auth.email || '',
        }, session);
        const rows = await LedgerEntry.find({
            expenseId: expense._id,
            kind: 'partner_reimbursement',
            reversedBy: null,
        }).session(session);
        expense.reimbursedAmount = sumMoney(rows.map((row) => row.amount));
        expense.updatedBy = req.auth.email || '';
        await expense.save({ session });
        return { entry, expense: hideFile(expense) };
    });
});

router.get('/vendor-bills', async (req, res) => {
    try {
        const { page, limit, skip } = pageQuery(req);
        const bounds = dateBounds(req.query.from, req.query.to);
        if (bounds.error) return res.status(400).json({ message: bounds.error });
        const filter = {};
        if (req.query.status) filter.status = String(req.query.status);
        if (req.query.vendorId && mongoose.Types.ObjectId.isValid(String(req.query.vendorId))) filter.vendorId = req.query.vendorId;
        if (bounds.from || bounds.to) {
            filter.billDate = {};
            if (bounds.from) filter.billDate.$gte = bounds.from;
            if (bounds.to) filter.billDate.$lte = bounds.to;
        }
        const [items, total] = await Promise.all([
            VendorBill.find(filter).select('-attachment.data').sort({ billDate: -1 }).skip(skip).limit(limit),
            VendorBill.countDocuments(filter),
        ]);
        res.json({ items: items.map(hideFile), total, page, limit });
    } catch (err) {
        res.status(500).json({ message: 'Could not load vendor bills' });
    }
});

router.get('/vendor-bills/:id', async (req, res) => {
    try {
        const bill = await VendorBill.findById(req.params.id);
        if (!bill) return res.status(404).json({ message: 'Vendor bill not found' });
        res.json(bill);
    } catch (err) {
        res.status(404).json({ message: 'Vendor bill not found' });
    }
});

router.post('/vendor-bills', async (req, res) => {
    const body = req.body || {};
    const key = requestKey(req);
    return postFinancial(res, {
        key,
        fallback: 'Could not record the vendor bill',
        find: async (idempotencyKey) => {
            const bill = await VendorBill.findOne({ idempotencyKey }).select('-attachment.data');
            return bill ? { bill: hideFile(bill) } : null;
        },
        audit: {
            action: 'vendor_bill_posted',
            entityType: 'vendor_bill',
            entityId: (result) => result.bill.billNumber,
            metadata: (result) => ({ amount: result.bill.amount, email: req.auth.email }),
        },
    }, async (session) => {
        if (!body.vendorId || !mongoose.Types.ObjectId.isValid(String(body.vendorId))) fail('Vendor is required');
        const vendor = await Vendor.findById(body.vendorId).session(session);
        const category = body.categoryId ? await ExpenseCategory.findById(body.categoryId).session(session) : null;
        const plan = planVendorBill(body, category, vendor);
        if (plan.error) fail(plan.error);
        const billNumber = await nextDocumentNumber('VBL', VendorBill, 'billNumber', session);
        const bill = await createOne(VendorBill, {
            ...plan,
            billNumber,
            categoryId: category._id,
            amountPaid: 0,
            balanceDue: plan.amount,
            status: 'open',
            idempotencyKey: key || undefined,
        }, session);
        bill.seriesId = bill._id;
        await bill.save({ session });
        if (body.paidAmount !== undefined && body.paidAmount !== '' && Number(body.paidAmount) > 0) {
            if (!PAYMENT_METHODS.includes(body.paymentMethod)) fail('Payment method is not valid');
            const account = await loadAccount(body.accountId, session);
            const payment = planObligationPayment({
                kind: 'vendor_payment',
                document: bill,
                amount: body.paidAmount,
                account,
                vendorId: vendor._id,
            });
            if (payment.error) fail(payment.error);
            await addLedger({
                ...payment.ledger,
                method: body.paymentMethod,
                reference: String(body.reference || plan.reference || '').slice(0, 120),
                postedAt: plan.billDate,
                idempotencyKey: key ? `pay:${key}` : undefined,
            }, session);
            await refreshObligation(VendorBill, bill._id, 'vendor_payment', 'vendorBillId', session);
        }
        const saved = await VendorBill.findById(bill._id).session(session);
        return { bill: hideFile(saved) };
    });
});

router.post('/vendor-bills/:id/payments', async (req, res) => {
    const body = req.body || {};
    const key = requestKey(req);
    return postFinancial(res, {
        key,
        fallback: 'Could not record the vendor payment',
        find: async (idempotencyKey) => {
            const entry = await LedgerEntry.findOne({ idempotencyKey });
            return entry ? { entry } : null;
        },
        audit: {
            action: 'vendor_bill_paid',
            entityType: 'ledger',
            entityId: (result) => result.entry.entryNumber,
            metadata: (result) => ({ amount: result.entry.amount, email: req.auth.email }),
        },
    }, async (session) => {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) fail('Vendor bill not found', 404);
        const bill = await VendorBill.findById(req.params.id).session(session);
        if (!bill) fail('Vendor bill not found', 404);
        if (!PAYMENT_METHODS.includes(body.paymentMethod)) fail('Payment method is not valid');
        const account = await loadAccount(body.accountId, session);
        const payment = planObligationPayment({
            kind: 'vendor_payment',
            document: bill,
            amount: body.amount,
            account,
            vendorId: body.vendorId || bill.vendorId,
        });
        if (payment.error) fail(payment.error);
        const entry = await addLedger({
            ...payment.ledger,
            method: body.paymentMethod,
            reference: String(body.reference || '').slice(0, 120),
            notes: String(body.notes || '').slice(0, 1000),
            postedAt: postedAtFrom(body.paymentDate),
            idempotencyKey: key || undefined,
        }, session);
        const updated = await refreshObligation(VendorBill, bill._id, 'vendor_payment', 'vendorBillId', session);
        return { entry, bill: hideFile(updated) };
    });
});

router.post('/vendor-bills/:id/void', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Vendor bill not found' });
        const bill = await VendorBill.findById(req.params.id);
        if (!bill) return res.status(404).json({ message: 'Vendor bill not found' });
        if (bill.status === 'void') return res.json({ bill: hideFile(bill) });
        if (toCents(bill.amountPaid) > 0) {
            return res.status(400).json({ message: 'Reverse the payments before voiding this bill' });
        }
        bill.status = 'void';
        bill.balanceDue = 0;
        await bill.save();
        await logAudit('vendor_bill_voided', 'vendor_bill', bill.billNumber, { email: req.auth.email });
        res.json({ bill: hideFile(bill) });
    } catch (err) {
        res.status(400).json({ message: 'Could not void the vendor bill' });
    }
});

router.get('/receivables', async (req, res) => {
    try {
        const [invoices, clients, advances, allocations] = await Promise.all([
            Invoice.find({ status: { $nin: ['draft', 'cancelled'] }, balanceDue: { $gt: 0 } })
                .select('invoiceNumber clientId clientSnapshot balanceDue status dueDate currency grandTotal amountPaid')
                .lean(),
            Client.find().select('companyName email').lean(),
            LedgerEntry.find({ kind: 'advance' }).select('kind amount currency clientId partyName reversedBy').lean(),
            Allocation.find({ status: 'posted' }).select('sourceEntryId status amount').lean(),
        ]);
        const clientsRows = receivableRows({ invoices, clients, advances, allocations });
        res.json({ items: clientsRows, total: clientsRows.length });
    } catch (err) {
        res.status(500).json({ message: 'Could not load receivables' });
    }
});

router.get('/clients/:id/statement', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Client not found' });
        const client = await Client.findById(req.params.id).lean();
        if (!client) return res.status(404).json({ message: 'Client not found' });
        const invoices = await Invoice.find({ clientId: client._id }).lean();
        const numbers = invoices.map((invoice) => invoice.invoiceNumber);
        const [payments, advances, allocations, ledger] = await Promise.all([
            Payment.find({ $or: [{ clientId: client._id }, { invoiceId: { $in: numbers.length ? numbers : ['__none__'] } }] }).sort({ paymentDate: -1 }).lean(),
            LedgerEntry.find({ clientId: client._id, kind: 'advance' }).sort({ postedAt: -1 }).lean(),
            Allocation.find({ clientId: client._id }).sort({ postedAt: -1 }).lean(),
            LedgerEntry.find({ clientId: client._id }).sort({ postedAt: -1 }).limit(200).lean(),
        ]);
        const positioned = invoices.map((invoice) => invoicePosition(invoice, payments));
        const outstanding = emptyMoney();
        const overdue = emptyMoney();
        positioned.forEach((invoice) => {
            if (invoice.status === 'draft' || invoice.status === 'cancelled' || toCents(invoice.balanceDue) <= 0) return;
            addBucket(outstanding, invoice.currency, invoice.balanceDue);
            if (isOverdueInvoice(invoice)) addBucket(overdue, invoice.currency, invoice.balanceDue);
        });
        const described = advances.map((advance) => ({
            ...advance,
            unallocated: advance.reversedBy ? 0 : unallocatedAmount(advance, allocations),
        }));
        const advance = emptyMoney();
        described.forEach((row) => {
            if (!row.reversedBy) addBucket(advance, row.currency, row.unallocated);
        });
        res.json({
            client,
            outstanding,
            overdue,
            advance,
            invoices: positioned,
            advances: described,
            payments,
            allocations,
            history: transactionRows({ ledger, payments }),
        });
    } catch (err) {
        res.status(500).json({ message: 'Could not load the client statement' });
    }
});

router.post('/advances', async (req, res) => {
    const body = req.body || {};
    const key = requestKey(req);
    return postFinancial(res, {
        key,
        fallback: 'Could not record the advance',
        find: async (idempotencyKey) => {
            const entry = await LedgerEntry.findOne({ idempotencyKey });
            return entry ? { entry } : null;
        },
        audit: {
            action: 'advance_posted',
            entityType: 'ledger',
            entityId: (result) => result.entry.entryNumber,
            metadata: (result) => ({ amount: result.entry.amount, email: req.auth.email }),
        },
    }, async (session) => {
        if (!body.clientId || !mongoose.Types.ObjectId.isValid(String(body.clientId))) fail('Client is required');
        const client = await Client.findById(body.clientId).session(session);
        if (!client) fail('Client not found', 404);
        const account = await loadAccount(body.accountId, session);
        const plan = planAdvance({
            amount: body.amount,
            currency: body.currency || account.currency,
            account,
            client,
            method: body.paymentMethod,
        });
        if (plan.error) fail(plan.error);
        const entry = await addLedger({
            ...plan.entry,
            postedAt: postedAtFrom(body.paymentDate),
            reference: String(body.reference || '').slice(0, 120),
            notes: String(body.notes || '').slice(0, 1000),
            idempotencyKey: key || undefined,
        }, session);
        return { entry };
    });
});

router.post('/allocations', async (req, res) => {
    const body = req.body || {};
    const key = requestKey(req);
    return postFinancial(res, {
        key,
        fallback: 'Could not allocate the advance',
        find: async (idempotencyKey) => {
            const allocation = await Allocation.findOne({ idempotencyKey });
            return allocation ? { allocation } : null;
        },
        audit: {
            action: 'allocation_posted',
            entityType: 'allocation',
            entityId: (result) => String(result.allocation._id),
            metadata: (result) => ({ amount: result.allocation.amount, invoiceId: result.allocation.targetId, email: req.auth.email }),
        },
    }, async (session) => {
        if (!body.advanceId || !mongoose.Types.ObjectId.isValid(String(body.advanceId))) fail('Advance is not available');
        const advance = await LedgerEntry.findById(body.advanceId).session(session);
        if (!advance) fail('Advance is not available');
        const invoiceDoc = await Invoice.findOne({ invoiceNumber: body.invoiceId }).session(session);
        if (!invoiceDoc) fail('Invoice not found', 404);
        const prior = await Payment.find({ invoiceId: invoiceDoc.invoiceNumber, status: 'recorded' }).session(session);
        const allocations = await Allocation.find({ sourceEntryId: advance._id }).session(session);
        const invoice = invoicePosition(invoiceDoc.toObject(), prior.map((payment) => payment.toObject()));
        const plan = planAllocation({ advance, allocations, invoice, amount: body.amount });
        if (plan.error) fail(plan.error);
        const method = body.paymentMethod || advance.method;
        if (!PAYMENT_METHODS.includes(method)) fail('Payment method is not valid');
        const payment = await createOne(Payment, {
            ...plan.payment,
            paymentDate: postedAtFrom(body.paymentDate),
            paymentMethod: method,
            transactionReference: String(body.reference || advance.reference || '').slice(0, 120),
            notes: String(body.notes || '').slice(0, 1000),
            currency: invoice.currency || advance.currency || 'INR',
            accountId: advance.accountId,
            idempotencyKey: key || undefined,
        }, session);
        const allocation = await createOne(Allocation, {
            ...plan.allocation,
            paymentId: payment._id,
            postedAt: payment.paymentDate,
            idempotencyKey: key || undefined,
        }, session);
        await addLedger({
            ...plan.ledger,
            paymentId: payment._id,
            partyName: advance.partyName,
            method,
            reference: payment.transactionReference,
            postedAt: payment.paymentDate,
            idempotencyKey: key ? `memo:${key}` : undefined,
        }, session);
        const updated = await refreshInvoice(invoice.invoiceNumber, session);
        return { allocation, payment, invoice: updated };
    });
});

router.post('/schedules/run', async (req, res) => {
    try {
        const created = await runTransaction(async (session) => {
            const now = new Date();
            const numbers = [];
            const expenses = await Expense.find({
                recurrence: { $in: ['weekly', 'monthly', 'yearly'] },
                nextRunAt: { $lte: now },
                status: { $ne: 'void' },
            }).limit(25).session(session);
            for (const expense of expenses) {
                const plan = childFromSeries(expense.toObject(), now, 'expense');
                if (plan.error) continue;
                const existing = await Expense.findOne({ idempotencyKey: plan.child.idempotencyKey }).session(session);
                if (!existing) {
                    const expenseNumber = await nextDocumentNumber('EXP', Expense, 'expenseNumber', session);
                    const child = await createOne(Expense, { ...plan.child, expenseNumber }, session);
                    numbers.push(child.expenseNumber);
                }
                expense.nextRunAt = plan.following;
                await expense.save({ session });
            }
            const bills = await VendorBill.find({
                recurrence: { $in: ['weekly', 'monthly', 'yearly'] },
                nextRunAt: { $lte: now },
                status: { $ne: 'void' },
            }).limit(25).session(session);
            for (const bill of bills) {
                const plan = childFromSeries(bill.toObject(), now, 'vendor_bill');
                if (plan.error) continue;
                const existing = await VendorBill.findOne({ idempotencyKey: plan.child.idempotencyKey }).session(session);
                if (!existing) {
                    const billNumber = await nextDocumentNumber('VBL', VendorBill, 'billNumber', session);
                    const child = await createOne(VendorBill, { ...plan.child, billNumber }, session);
                    numbers.push(child.billNumber);
                }
                bill.nextRunAt = plan.following;
                await bill.save({ session });
            }
            return numbers;
        });
        await logAudit('schedule_ran', 'ledger', 'schedules', { created: created.length, email: req.auth.email });
        res.json({ created });
    } catch (err) {
        if (err && err.status) return res.status(err.status).json({ message: err.message });
        res.status(400).json({ message: 'Could not run recurring schedules' });
    }
});

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const input = String(text || '').replace(/^\uFEFF/, '');
    for (let index = 0; index < input.length; index += 1) {
        const char = input[index];
        if (quoted) {
            if (char === '"') {
                if (input[index + 1] === '"') {
                    cell += '"';
                    index += 1;
                } else {
                    quoted = false;
                }
            } else {
                cell += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            row.push(cell);
            cell = '';
        } else if (char === '\n') {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else if (char !== '\r') {
            cell += char;
        }
    }
    if (cell || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows.filter((cells) => cells.some((value) => String(value).trim()));
}

function parseStatementDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const text = String(value || '').trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`);
    const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (local) return new Date(Date.UTC(Number(local[3]), Number(local[2]) - 1, Number(local[1])));
    const named = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
    if (named) {
        const months = {
            jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
            may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
            september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
        };
        const month = months[named[2].toLowerCase()];
        if (month != null) return new Date(Date.UTC(Number(named[3]), month, Number(named[1])));
    }
    return null;
}

function moneyCell(value) {
    const text = String(value || '').replace(/[₹$,\s]/g, '');
    if (!text || text === '-' || text === '—') return 0;
    const negative = text.startsWith('-') || text.startsWith('(');
    const amount = Number(text.replace(/[()]/g, ''));
    if (!Number.isFinite(amount)) return null;
    return negative ? -round2(Math.abs(amount)) : round2(Math.abs(amount));
}

function columnMap(header) {
    const cells = header.map((cell) => String(cell || '').trim().toLowerCase());
    const find = (...names) => cells.findIndex((cell) => names.some((name) => cell === name || cell.includes(name)));
    return {
        date: find('date'),
        description: find('description', 'narration', 'particular', 'details'),
        reference: find('reference', 'ref no', 'utr', 'cheque'),
        debit: find('debit', 'withdrawal'),
        credit: find('credit', 'deposit'),
        amount: find('amount'),
        balance: find('balance'),
    };
}

async function tableFromUpload(body) {
    const fileName = String(body.fileName || '').toLowerCase();
    const contentType = String(body.contentType || '').toLowerCase();
    const isPdf = fileName.endsWith('.pdf') || contentType.includes('pdf');
    if (isPdf) {
        const buffer = Buffer.from(String(body.fileBase64 || ''), 'base64');
        if (!buffer.length) fail('Choose a statement file');
        const { tableFromPdfBuffer } = require('../utils/statementPdf');
        return tableFromPdfBuffer(buffer);
    }
    const excel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || contentType.includes('spreadsheet') || contentType.includes('excel');
    if (excel) {
        const XLSX = require('xlsx');
        const buffer = Buffer.from(String(body.fileBase64 || ''), 'base64');
        if (!buffer.length) fail('Choose a statement file');
        const book = XLSX.read(buffer, { type: 'buffer' });
        const sheet = book.Sheets[book.SheetNames[0]];
        if (!sheet) fail('The workbook has no sheets');
        return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    }
    return parseCsv(body.text || '');
}

function statementRows(table, accountId) {
    const headerAt = table.findIndex((row) => {
        const columns = columnMap(row || []);
        return columns.date >= 0 && (columns.debit >= 0 || columns.credit >= 0 || columns.amount >= 0);
    });
    if (headerAt < 0) fail('The file needs date and amount columns');
    const columns = columnMap(table[headerAt]);
    const lines = [];
    table.slice(headerAt + 1).forEach((row) => {
        const postedAt = parseStatementDate(row[columns.date]);
        if (!postedAt) return;
        const debit = columns.debit >= 0 ? moneyCell(row[columns.debit]) : 0;
        const credit = columns.credit >= 0 ? moneyCell(row[columns.credit]) : 0;
        let direction = 'out';
        let amount = 0;
        let presetStatus = '';
        if (debit > 0 && credit > 0) {
            direction = 'out';
            amount = debit;
            presetStatus = 'needs_review';
        } else if (debit > 0) {
            direction = 'out';
            amount = debit;
        } else if (credit > 0) {
            direction = 'in';
            amount = credit;
        } else if (columns.amount >= 0) {
            const signed = moneyCell(row[columns.amount]);
            if (!signed) return;
            direction = signed < 0 ? 'out' : 'in';
            amount = round2(Math.abs(signed));
        } else {
            return;
        }
        if (!(amount > 0)) return;
        const running = columns.balance >= 0 ? moneyCell(row[columns.balance]) : null;
        const line = {
            accountId,
            postedAt,
            description: String(columns.description >= 0 ? row[columns.description] || '' : '').trim().slice(0, 300),
            reference: String(columns.reference >= 0 ? row[columns.reference] || '' : '').trim().slice(0, 120),
            direction,
            amount,
            runningBalance: running == null ? undefined : round2(running),
            presetStatus,
        };
        line.fingerprint = statementFingerprint(line);
        lines.push(line);
    });
    if (!lines.length) fail('No statement lines were found');
    return lines;
}

async function settleStatementLine(line, decision, session, email) {
    if (line.status === 'confirmed') return line;
    const action = decision.action;
    if (action === 'review') {
        line.status = 'needs_review';
        await line.save({ session });
        return line;
    }
    if (line.status === 'potential_duplicate' && action !== 'link') {
        fail('This line looks like a duplicate. Link it to the existing transaction.');
    }
    if (action === 'link' || (action === 'post' && line.status === 'matched')) {
        const ledgerId = decision.ledgerEntryId || line.ledgerEntryId;
        if (!ledgerId) fail('Choose the existing transaction to link');
        const existing = await LedgerEntry.findById(ledgerId).session(session);
        if (!existing || String(existing.accountId) !== String(line.accountId)) fail('That transaction is not on this account');
        line.ledgerEntryId = existing._id;
        line.status = 'confirmed';
        line.classification = 'link';
        await line.save({ session });
        return line;
    }
    if (action !== 'post') fail('Choose whether to link, post, or leave this line for review');
    const account = await loadAccount(line.accountId, session);
    const classification = String(decision.classification || '');
    let entry = null;
    if (classification === 'expense' || classification === 'tax') {
        if (line.direction !== 'out') fail('Only money leaving the account can be recorded as an expense');
        const category = await ExpenseCategory.findOne({ kind: 'operating' }).session(session);
        if (!category) fail('Add an expense category before confirming a bank debit as an expense');
        const description = classification === 'tax'
            ? `Tax payment${line.description ? `: ${line.description}` : ''}`
            : (line.description || 'Bank debit');
        const plan = planExpenseDocument({
            amount: line.amount,
            currency: account.currency,
            description,
            expenseDate: line.postedAt,
            reference: line.reference,
            paymentSource: account.type === 'cash' ? 'company_cash' : 'company_bank',
        }, category);
        if (plan.error) fail(plan.error);
        const expenseNumber = await nextDocumentNumber('EXP', Expense, 'expenseNumber', session);
        const expense = await createOne(Expense, {
            ...plan,
            expenseNumber,
            categoryId: category._id,
            amountPaid: 0,
            balanceDue: plan.amount,
            status: 'open',
            createdBy: email,
            updatedBy: email,
        }, session);
        const payment = planObligationPayment({
            kind: 'expense_payment',
            document: expense,
            amount: line.amount,
            account,
        });
        if (payment.error) fail(payment.error);
        entry = await addLedger({
            ...payment.ledger,
            reference: line.reference,
            postedAt: line.postedAt,
            createdBy: email,
            notes: 'Posted from a confirmed statement line',
        }, session);
        await refreshObligation(Expense, expense._id, 'expense_payment', 'expenseId', session);
    } else if (classification === 'transfer') {
        const counter = await loadAccount(decision.counterAccountId, session);
        const transfer = planTransfer({
            amount: line.amount,
            fromAccount: line.direction === 'out' ? account : counter,
            toAccount: line.direction === 'out' ? counter : account,
        });
        if (transfer.error) fail(transfer.error);
        entry = await addLedger({
            ...transfer.entry,
            reference: line.reference,
            postedAt: line.postedAt,
            createdBy: email,
            notes: line.description || 'Transfer from a statement',
        }, session);
    } else if (classification === 'owner' || classification === 'other') {
        const notes = String(decision.notes || (classification === 'owner' ? 'Owner money from the statement' : '')).trim();
        const adjustment = planAdjustment({
            amount: line.amount,
            direction: line.direction,
            account,
            notes: notes || 'Owner money from the statement',
        });
        if (adjustment.error) fail(adjustment.error);
        entry = await addLedger({
            ...adjustment.entry,
            reference: line.reference,
            postedAt: line.postedAt,
            createdBy: email,
        }, session);
    } else {
        fail('Choose what this line is before posting it');
    }
    line.ledgerEntryId = entry._id;
    line.status = 'confirmed';
    line.classification = classification;
    await line.save({ session });
    return line;
}

router.get('/statements', async (req, res) => {
    try {
        const items = await StatementBatch.find().sort({ createdAt: -1 }).limit(50).lean();
        res.json({ items, total: items.length });
    } catch (err) {
        res.status(500).json({ message: 'Could not load statements' });
    }
});

router.get('/statements/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Statement not found' });
        const batch = await StatementBatch.findById(req.params.id).lean();
        if (!batch) return res.status(404).json({ message: 'Statement not found' });
        const lines = await StatementLine.find({ batchId: batch._id }).sort({ postedAt: 1 }).lean();
        res.json({ batch, lines });
    } catch (err) {
        res.status(404).json({ message: 'Statement not found' });
    }
});

router.post('/statements', async (req, res) => {
    try {
        const body = req.body || {};
        const bytes = body.fileBase64
            ? Buffer.from(String(body.fileBase64), 'base64')
            : Buffer.from(String(body.text || ''), 'utf8');
        if (!bytes.length) return res.status(400).json({ message: 'Choose a statement file' });
        const isPdf = String(body.fileName || '').toLowerCase().endsWith('.pdf') || String(body.contentType || '').toLowerCase().includes('pdf');
        const maxBytes = isPdf ? 8000000 : 2000000;
        if (bytes.length > maxBytes) {
            return res.status(400).json({ message: isPdf ? 'PDF statements must be 8MB or smaller' : 'Statement files must be 2MB or smaller' });
        }
        const account = await Account.findById(body.accountId);
        if (!account || account.isActive === false) return res.status(400).json({ message: 'Choose an active cash or bank account' });
        const fileHash = crypto.createHash('sha256')
            .update(`${String(account._id)}:`)
            .update(bytes)
            .digest('hex');
        const existing = await StatementBatch.findOne({ fileHash }).lean();
        if (existing) {
            const lines = await StatementLine.find({ batchId: existing._id }).sort({ postedAt: 1 }).lean();
            return res.json({ batch: existing, lines, duplicate: true });
        }
        const table = await tableFromUpload(body);
        const bounds = dateBounds(body.periodFrom, body.periodTo);
        if (bounds.error) return res.status(400).json({ message: bounds.error });
        const parsed = statementRows(table, account._id);
        const ledger = await LedgerEntry.find({ accountId: account._id, reversedBy: null })
            .select('accountId postedAt amount direction reference cashEffect reversedBy')
            .lean();
        const prior = await StatementLine.find({
            accountId: account._id,
            status: 'confirmed',
            fingerprint: { $in: parsed.map((line) => line.fingerprint) },
        }).select('fingerprint').lean();
        const confirmed = new Set(prior.map((line) => line.fingerprint));
        const openingBalance = body.openingBalance === undefined || body.openingBalance === '' ? undefined : round2(Number(body.openingBalance));
        const closingBalance = body.closingBalance === undefined || body.closingBalance === '' ? undefined : round2(Number(body.closingBalance));
        if ((openingBalance !== undefined && !Number.isFinite(openingBalance)) || (closingBalance !== undefined && !Number.isFinite(closingBalance))) {
            return res.status(400).json({ message: 'Opening and closing balances must be numbers' });
        }
        const batch = await StatementBatch.create({
            accountId: account._id,
            fileName: String(body.fileName || '').slice(0, 180),
            fileHash,
            periodFrom: bounds.from || undefined,
            periodTo: bounds.to || undefined,
            openingBalance,
            closingBalance,
            difference: openingBalance !== undefined && closingBalance !== undefined ? round2(closingBalance - openingBalance) : undefined,
            currency: account.currency,
            createdBy: req.auth.email || '',
        });
        const lines = await StatementLine.insertMany(parsed.map((line) => {
            const duplicate = confirmed.has(line.fingerprint);
            const match = line.presetStatus ? { status: line.presetStatus } : matchStatementLine(line, ledger);
            return {
                batchId: batch._id,
                accountId: account._id,
                postedAt: line.postedAt,
                description: line.description,
                reference: line.reference,
                direction: line.direction,
                amount: line.amount,
                runningBalance: line.runningBalance,
                fingerprint: line.fingerprint,
                status: duplicate ? 'potential_duplicate' : match.status,
                ledgerEntryId: duplicate ? undefined : match.ledgerEntryId,
            };
        }));
        await logAudit('statement_imported', 'statement', String(batch._id), { lines: lines.length, email: req.auth.email });
        res.status(201).json({ batch, lines, duplicate: false });
    } catch (err) {
        if (err && err.status) return res.status(err.status).json({ message: err.message });
        res.status(400).json({ message: 'Could not read the statement' });
    }
});

router.post('/statements/:id/confirm', async (req, res) => {
    const decisions = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
    if (!decisions.length) return res.status(400).json({ message: 'Choose the lines to confirm' });
    try {
        const lines = await runTransaction(async (session) => {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) fail('Statement not found', 404);
            const batch = await StatementBatch.findById(req.params.id).session(session);
            if (!batch) fail('Statement not found', 404);
            const saved = [];
            for (const decision of decisions.slice(0, 500)) {
                const line = await StatementLine.findOne({ _id: decision.lineId, batchId: batch._id }).session(session);
                if (!line) fail('Statement line not found', 404);
                saved.push(await settleStatementLine(line, decision, session, req.auth.email || ''));
            }
            return saved;
        });
        await logAudit('statement_confirmed', 'statement', req.params.id, { lines: lines.length, email: req.auth.email });
        res.json({ lines });
    } catch (err) {
        if (err && err.status) return res.status(err.status).json({ message: err.message });
        res.status(400).json({ message: 'Could not confirm the statement' });
    }
});

module.exports = router;
