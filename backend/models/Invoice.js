const mongoose = require('mongoose');

const InvoiceItemSchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    hours: { type: Number, required: true },
    rate: { type: Number, required: true },
    total: { type: Number, required: true },
}, { _id: false });

const InvoiceSchema = new mongoose.Schema({
    invoiceNumber: { type: String, required: true, unique: true },
    quotationId: { type: String, required: true, unique: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    clientSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    items: [InvoiceItemSchema],
    subtotal: { type: Number, default: 0 },
    discountRate: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    gstDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
    grandTotal: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    issueDate: { type: Date },
    dueDate: { type: Date },
    status: {
        type: String,
        enum: ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled'],
        default: 'draft',
    },
    notes: { type: String, default: '' },
    terms: { type: [String], default: [] },
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    lastFollowUpAt: { type: Date },
    nextFollowUpAt: { type: Date },
    collectionNotes: { type: String, default: '' },
    issuedSnapshot: { type: mongoose.Schema.Types.Mixed },
    emailLog: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });

InvoiceSchema.index({ status: 1, dueDate: 1 });

module.exports = mongoose.model('Invoice', InvoiceSchema);
