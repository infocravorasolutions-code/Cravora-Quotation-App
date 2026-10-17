const mongoose = require('mongoose');

const StatementLineSchema = new mongoose.Schema({
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'StatementBatch', required: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    postedAt: { type: Date, required: true },
    description: { type: String, default: '' },
    reference: { type: String, default: '' },
    direction: { type: String, enum: ['in', 'out'], required: true },
    amount: { type: Number, required: true },
    runningBalance: { type: Number },
    fingerprint: { type: String, default: '' },
    status: {
        type: String,
        enum: ['matched', 'unmatched', 'potential_duplicate', 'needs_review', 'confirmed'],
        default: 'unmatched',
    },
    ledgerEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry' },
    classification: { type: String, default: '' },
}, { timestamps: true });

StatementLineSchema.index({ batchId: 1 });
StatementLineSchema.index({ accountId: 1, fingerprint: 1 });

module.exports = mongoose.model('StatementLine', StatementLineSchema);
