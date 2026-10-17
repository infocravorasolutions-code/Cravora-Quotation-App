const mongoose = require('mongoose');

const ReceiptSchema = new mongoose.Schema({
    receiptNumber: { type: String, required: true, unique: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, unique: true },
    invoiceId: { type: String, required: true },
    clientSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    amount: { type: Number, required: true },
    paymentDate: { type: Date, required: true },
    paymentMethod: { type: String, required: true },
    transactionReference: { type: String, default: '' },
    invoiceTotal: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    issuedSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    emailLog: { type: [mongoose.Schema.Types.Mixed], default: undefined },
}, { timestamps: true });

module.exports = mongoose.model('Receipt', ReceiptSchema);
