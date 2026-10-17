const mongoose = require('mongoose');

const ModuleSchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    hours: { type: Number, required: true },
    rate: { type: Number, required: true },
    total: { type: Number, required: true }
});

const QuotationSchema = new mongoose.Schema({
    quotationId: { type: String, required: true, unique: true },
    isDraft: { type: Boolean, default: true },
    lastSaved: { type: Date, default: Date.now },
    documentType: { type: String, enum: ['Quotation', 'Billing'], default: 'Quotation' },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    status: {
        type: String,
        enum: ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted', 'final'],
    },
    publicToken: { type: String, unique: true, sparse: true },
    validUntil: { type: Date },
    notes: { type: String, default: '' },
    issuedSnapshot: { type: mongoose.Schema.Types.Mixed },
    issuedAt: { type: Date },
    sentAt: { type: Date },
    viewedAt: { type: Date },
    acceptedAt: { type: Date },
    acceptedBy: { type: String },
    acceptedEmail: { type: String },
    acceptedIp: { type: String },
    acceptedUserAgent: { type: String },
    rejectedAt: { type: Date },
    rejectionReason: { type: String },
    emailLog: { type: [mongoose.Schema.Types.Mixed], default: undefined },

    clientInfo: {
        clientName: String,
        clientEmail: String,
        projectName: String,
        projectDescription: String,
        currency: String,
        pricingType: String,
        gstNumber: String,
        clientGstNumber: String,
        clientAddress: String,
        companyAddress: String,
        companyPan: String,
        clientPan: String,
        placeOfSupply: String,
        countryOfSupply: String
    },

    modules: [ModuleSchema],

    tax: { type: Number, default: 18 },
    discountRate: { type: Number, default: 0 },
    termsAndConditions: [String],

    gstDetails: {
        gstType: { type: String, enum: ['intra', 'inter'], default: 'intra' },
        gstRate: { type: Number, default: 18 },
        cgstRate: { type: Number, default: 9 },
        sgstRate: { type: Number, default: 9 },
        igstRate: { type: Number, default: 18 },
        cgstAmount: { type: Number, default: 0 },
        sgstAmount: { type: Number, default: 0 },
        igstAmount: { type: Number, default: 0 },
        totalGstAmount: { type: Number, default: 0 }
    },

    // Calculated Totals
    subtotal: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 }
}, {
    timestamps: true
});

module.exports = mongoose.model('Quotation', QuotationSchema);
