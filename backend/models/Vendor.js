const mongoose = require('mongoose');

const VendorSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    gstin: { type: String, default: '', trim: true, uppercase: true },
    notes: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

VendorSchema.index({ name: 1 });

module.exports = mongoose.model('Vendor', VendorSchema);
