const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    invoiceId: { type: String, required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    amount: { type: Number, required: true },
    paymentDate: { type: Date, required: true },
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank_transfer', 'upi', 'cheque', 'card', 'other'],
        required: true,
    },
    transactionReference: { type: String, default: '' },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['recorded', 'reversed'], default: 'recorded' },
    source: { type: String, enum: ['invoice', 'advance_allocation'], default: 'invoice' },
    currency: { type: String, enum: ['INR', 'USD'] },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    advanceEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry' },
    idempotencyKey: { type: String },
}, { timestamps: true });

PaymentSchema.index({ invoiceId: 1, paymentDate: -1 });
PaymentSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Payment', PaymentSchema);
