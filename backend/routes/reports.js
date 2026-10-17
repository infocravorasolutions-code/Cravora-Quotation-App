const express = require('express');
const router = express.Router();
const Quotation = require('../models/Quotation');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const { round2 } = require('../utils/totals');
const Expense = require('../models/Expense');
const VendorBill = require('../models/VendorBill');
const LedgerEntry = require('../models/LedgerEntry');
const {
    outstandingRows,
    expenseReportRows,
    transactionRows,
    partnerPayableRows,
    categoryTotals,
    cashMovementRows,
    dateBounds,
    inRange,
    toCsv,
} = require('../utils/finance');

router.get('/summary', async (req, res) => {
    try {
        const quotationGroups = await Quotation.aggregate([
            {
                $group: {
                    _id: {
                        $ifNull: [
                            '$status',
                            { $cond: [{ $eq: ['$isDraft', false] }, 'final', 'draft'] },
                        ],
                    },
                    count: { $sum: 1 },
                },
            },
        ]);
        const quotations = { total: 0, draft: 0, sent: 0, viewed: 0, accepted: 0, rejected: 0, converted: 0, final: 0 };
        quotationGroups.forEach((row) => {
            quotations.total += row.count;
            if (quotations[row._id] != null) quotations[row._id] += row.count;
            else quotations[row._id] = row.count;
        });
        const invoiceGroups = await Invoice.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$grandTotal' } } },
        ]);
        const invoices = { total: 0, unpaid: 0, overdue: 0, invoiced: 0 };
        invoiceGroups.forEach((row) => {
            invoices.total += row.count;
            if (row._id !== 'cancelled') invoices.invoiced += row.total || 0;
            if (['issued', 'partially_paid', 'overdue', 'draft'].includes(row._id)) invoices.unpaid += row.count;
            if (row._id === 'overdue') invoices.overdue += row.count;
        });
        const dueSoon = await Invoice.countDocuments({
            status: { $in: ['issued', 'partially_paid'] },
            dueDate: { $lt: new Date() },
        });
        invoices.overdue += dueSoon;

        const paidRows = await Payment.aggregate([
            { $match: { status: 'recorded' } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        const paid = round2(paidRows[0] ? paidRows[0].total : 0);
        invoices.invoiced = round2(invoices.invoiced);

        res.json({
            quotations,
            invoices,
            paid,
            outstanding: round2(Math.max(invoices.invoiced - paid, 0)),
        });
    } catch (err) {
        res.status(500).json({ message: 'Could not load the dashboard' });
    }
});

function sendRows(req, res, filename, rows) {
    const items = rows.slice(0, 1000);
    if (String(req.query.format || '') === 'csv') {
        res.set('Content-Type', 'text/csv; charset=utf-8');
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(toCsv(items));
    }
    return res.json({ items, total: rows.length, truncated: rows.length > 1000 });
}

router.get('/outstanding', async (req, res) => {
    try {
        const bounds = dateBounds(req.query.from, req.query.to);
        if (bounds.error) return res.status(400).json({ message: bounds.error });
        const filter = { status: { $nin: ['draft', 'cancelled'] }, balanceDue: { $gt: 0 } };
        if (req.query.clientId) filter.clientId = String(req.query.clientId);
        const invoices = await Invoice.find(filter)
            .select('invoiceNumber clientId clientSnapshot issueDate dueDate status currency grandTotal amountPaid balanceDue')
            .lean();
        const rows = outstandingRows(invoices, { from: req.query.from, to: req.query.to });
        return sendRows(req, res, 'outstanding.csv', rows);
    } catch (err) {
        return res.status(500).json({ message: 'Could not load the outstanding report' });
    }
});

router.get('/expenses', async (req, res) => {
    try {
        const bounds = dateBounds(req.query.from, req.query.to);
        if (bounds.error) return res.status(400).json({ message: bounds.error });
        const [expenses, vendorBills] = await Promise.all([
            Expense.find().select('-attachment.data').lean(),
            VendorBill.find().select('-attachment.data').lean(),
        ]);
        const rows = expenseReportRows({
            expenses: expenses.filter((expense) => inRange(expense.expenseDate, req.query.from, req.query.to)),
            vendorBills: vendorBills.filter((bill) => inRange(bill.billDate, req.query.from, req.query.to)),
        });
        return sendRows(req, res, 'expenses.csv', rows);
    } catch (err) {
        return res.status(500).json({ message: 'Could not load the expense report' });
    }
});

router.get('/transactions', async (req, res) => {
    try {
        const bounds = dateBounds(req.query.from, req.query.to);
        if (bounds.error) return res.status(400).json({ message: bounds.error });
        const posted = {};
        const paid = {};
        if (bounds.from || bounds.to) {
            posted.postedAt = {};
            paid.paymentDate = {};
            if (bounds.from) {
                posted.postedAt.$gte = bounds.from;
                paid.paymentDate.$gte = bounds.from;
            }
            if (bounds.to) {
                posted.postedAt.$lte = bounds.to;
                paid.paymentDate.$lte = bounds.to;
            }
        }
        const [ledger, payments, invoiceCurrencies] = await Promise.all([
            LedgerEntry.find(posted).lean(),
            Payment.find(paid).lean(),
            Invoice.find().select('invoiceNumber currency').lean(),
        ]);
        const currencyByInvoice = {};
        invoiceCurrencies.forEach((invoice) => {
            currencyByInvoice[invoice.invoiceNumber] = invoice.currency || 'INR';
        });
        const paymentsWithCurrency = payments.map((payment) => ({
            ...payment,
            currency: payment.currency || currencyByInvoice[payment.invoiceId] || 'INR',
        }));
        const rows = transactionRows({ ledger, payments: paymentsWithCurrency }).filter((row) => inRange(row.date, req.query.from, req.query.to));
        return sendRows(req, res, 'transactions.csv', rows);
    } catch (err) {
        return res.status(500).json({ message: 'Could not load the transaction report' });
    }
});

router.get('/partners', async (req, res) => {
    try {
        const expenses = await Expense.find({ status: { $ne: 'void' }, paymentSource: 'partner_personal' })
            .select('amount currency paymentSource paidByUserId paidByName reimbursedAmount status')
            .lean();
        const rows = partnerPayableRows(expenses).map((row) => ({
            partner: row.paidByName || 'Partner',
            INR: row.INR,
            USD: row.USD,
        }));
        return sendRows(req, res, 'partners.csv', rows);
    } catch (err) {
        return res.status(500).json({ message: 'Could not load partner balances' });
    }
});

router.get('/categories', async (req, res) => {
    try {
        const bounds = dateBounds(req.query.from, req.query.to);
        if (bounds.error) return res.status(400).json({ message: bounds.error });
        const expenses = await Expense.find().select('categoryName amount currency status expenseDate').lean();
        const rows = categoryTotals(expenses.filter((expense) => inRange(expense.expenseDate, req.query.from, req.query.to)));
        return sendRows(req, res, 'categories.csv', rows);
    } catch (err) {
        return res.status(500).json({ message: 'Could not load category totals' });
    }
});

router.get('/cash', async (req, res) => {
    try {
        const bounds = dateBounds(req.query.from, req.query.to);
        if (bounds.error) return res.status(400).json({ message: bounds.error });
        const ledger = await LedgerEntry.find().select('kind amount currency postedAt reversedBy affectsIncome affectsExpense').lean();
        const rows = cashMovementRows(ledger.filter((entry) => inRange(entry.postedAt, req.query.from, req.query.to)));
        return sendRows(req, res, 'cash-movement.csv', rows);
    } catch (err) {
        return res.status(500).json({ message: 'Could not load cash movement' });
    }
});

module.exports = router;
