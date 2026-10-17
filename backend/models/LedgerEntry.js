const mongoose = require('mongoose');

const LedgerEntrySchema = new mongoose.Schema({
    entryNumber: { type: String, required: true, unique: true },
    kind: {
        type: String,
        enum: ['opening', 'client_receipt', 'advance', 'invoice_allocation', 'expense_payment', 'vendor_payment', 'transfer', 'reversal', 'adjustment', 'partner_reimbursement'],
        required: true,
    },
    direction: { type: String, enum: ['in', 'out', 'transfer'], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, enum: ['INR', 'USD'], default: 'INR' },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    counterAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    invoiceNumber: { type: String, default: '' },
    expenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' },
    vendorBillId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorBill' },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    partyName: { type: String, default: '' },
    postedAt: { type: Date, default: Date.now },
    method: { type: String, default: '' },
    reference: { type: String, default: '' },
    notes: { type: String, default: '' },
    affectsIncome: { type: Boolean, default: false },
    affectsExpense: { type: Boolean, default: false },
    cashEffect: { type: Boolean, default: true },
    status: { type: String, enum: ['posted'], default: 'posted' },
    reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry' },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry' },
    idempotencyKey: { type: String },
    createdBy: { type: String, default: '' },
}, { timestamps: true });

LedgerEntrySchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
LedgerEntrySchema.index(
    { reversalOf: 1 },
    { unique: true, partialFilterExpression: { kind: 'reversal', reversalOf: { $type: 'objectId' } } }
);
LedgerEntrySchema.index(
    { paymentId: 1 },
    { unique: true, partialFilterExpression: { kind: 'client_receipt', paymentId: { $type: 'objectId' } } }
);
LedgerEntrySchema.index({ postedAt: -1, kind: 1 });
LedgerEntrySchema.index({ clientId: 1, postedAt: -1 });
LedgerEntrySchema.index({ accountId: 1, postedAt: -1 });

module.exports = mongoose.model('LedgerEntry', LedgerEntrySchema);
