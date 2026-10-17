const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true },
    type: { type: String, enum: ['cash', 'bank'], required: true },
    currency: { type: String, enum: ['INR', 'USD'], required: true },
    openingBalance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    idempotencyKey: { type: String },
}, { timestamps: true });

AccountSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Account', AccountSchema);
