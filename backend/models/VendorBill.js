const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema({
    fileName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    data: { type: String, default: '' },
}, { _id: false });

const VendorBillSchema = new mongoose.Schema({
    billNumber: { type: String, required: true, unique: true },
    vendorRef: { type: String, default: '' },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    vendorName: { type: String, default: '' },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseCategory' },
    categoryName: { type: String, default: '' },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, enum: ['INR', 'USD'], default: 'INR' },
    billDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ['open', 'partially_paid', 'paid', 'void'], default: 'open' },
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    reference: { type: String, default: '' },
    notes: { type: String, default: '' },
    attachment: { type: AttachmentSchema, default: undefined },
    recurrence: { type: String, enum: ['none', 'weekly', 'monthly', 'yearly'], default: 'none' },
    nextRunAt: { type: Date },
    seriesId: { type: mongoose.Schema.Types.ObjectId },
    idempotencyKey: { type: String },
}, { timestamps: true });

VendorBillSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
VendorBillSchema.index({ vendorId: 1, status: 1, dueDate: 1 });
VendorBillSchema.index({ billDate: -1 });

module.exports = mongoose.model('VendorBill', VendorBillSchema);
