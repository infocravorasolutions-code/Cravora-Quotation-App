const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
    companyName: { type: String, required: true, trim: true },
    contactPerson: { type: String, default: '', trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    mobile: { type: String, default: '', trim: true },
    gstin: { type: String, default: '', trim: true, uppercase: true },
    billingAddress: { type: String, default: '' },
    shippingAddress: { type: String, default: '' },
    website: { type: String, default: '' },
    notes: { type: String, default: '' },
}, { timestamps: true });

ClientSchema.index({ email: 1 });
ClientSchema.index({ companyName: 1 });

module.exports = mongoose.model('Client', ClientSchema);
