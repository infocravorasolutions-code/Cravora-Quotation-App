const mongoose = require('mongoose');

const StatementBatchSchema = new mongoose.Schema({
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    fileName: { type: String, default: '' },
    fileHash: { type: String, required: true, unique: true },
    periodFrom: { type: Date },
    periodTo: { type: Date },
    openingBalance: { type: Number },
    closingBalance: { type: Number },
    difference: { type: Number },
    currency: { type: String, enum: ['INR', 'USD'], default: 'INR' },
    createdBy: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('StatementBatch', StatementBatchSchema);
