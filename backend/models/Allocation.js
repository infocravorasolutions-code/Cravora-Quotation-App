const mongoose = require('mongoose');

const AllocationSchema = new mongoose.Schema({
    sourceEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry', required: true },
    targetType: { type: String, enum: ['invoice'], required: true },
    targetId: { type: String, required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    amount: { type: Number, required: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    status: { type: String, enum: ['posted', 'reversed'], default: 'posted' },
    idempotencyKey: { type: String },
    postedAt: { type: Date, default: Date.now },
}, { timestamps: true });

AllocationSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
AllocationSchema.index({ sourceEntryId: 1, status: 1 });
AllocationSchema.index({ clientId: 1, postedAt: -1 });

module.exports = mongoose.model('Allocation', AllocationSchema);
