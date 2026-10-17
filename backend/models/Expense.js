const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema({
    fileName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    data: { type: String, default: '' },
}, { _id: false });

const ExpenseSchema = new mongoose.Schema({
    expenseNumber: { type: String, required: true, unique: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseCategory' },
    categoryName: { type: String, default: '' },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    vendorName: { type: String, default: '' },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, enum: ['INR', 'USD'], default: 'INR' },
    expenseDate: { type: Date, required: true },
    dueDate: { type: Date },
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
    paymentSource: { type: String, enum: ['company_cash', 'company_bank', 'partner_personal'], default: 'company_bank' },
    paidByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paidByName: { type: String, default: '' },
    reimbursedAmount: { type: Number, default: 0 },
    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
}, { timestamps: true });

ExpenseSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
ExpenseSchema.index({ status: 1, dueDate: 1 });
ExpenseSchema.index({ expenseDate: -1 });

module.exports = mongoose.model('Expense', ExpenseSchema);
