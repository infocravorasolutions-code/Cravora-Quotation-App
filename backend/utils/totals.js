function round2(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round((number + Number.EPSILON) * 100) / 100;
}

function lineTotal(module) {
    return round2(Number(module.hours) * Number(module.rate));
}

function computeTotals(doc) {
    const modules = (doc.modules || []).map((module) => {
        const plain = typeof module.toObject === 'function' ? module.toObject() : module;
        return {
            id: String(plain.id || ''),
            name: plain.name || '',
            description: plain.description || '',
            hours: Number(plain.hours) || 0,
            rate: Number(plain.rate) || 0,
            total: lineTotal(plain),
        };
    });
    const subtotal = round2(modules.reduce((sum, module) => sum + module.total, 0));
    const discountRate = Number(doc.discountRate) || 0;
    const discountAmount = round2((subtotal * discountRate) / 100);
    const taxable = round2(subtotal - discountAmount);
    const gst = doc.gstDetails || {};
    const gstType = gst.gstType === 'inter' ? 'inter' : 'intra';
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    let totalGstAmount = 0;

    if (gstType === 'intra') {
        cgstAmount = round2((taxable * (Number(gst.cgstRate) || 0)) / 100);
        sgstAmount = round2((taxable * (Number(gst.sgstRate) || 0)) / 100);
        totalGstAmount = round2(cgstAmount + sgstAmount);
    } else {
        igstAmount = round2((taxable * (Number(gst.igstRate) || 0)) / 100);
        totalGstAmount = igstAmount;
    }

    const taxRate = gst.gstRate != null ? Number(gst.gstRate) : Number(doc.tax) || 0;
    const taxAmount = round2((taxable * taxRate) / 100);
    const grandTotal = round2(subtotal - discountAmount + totalGstAmount);

    return {
        modules,
        subtotal,
        discountRate,
        discountAmount,
        tax: taxRate,
        taxAmount,
        grandTotal,
        gstDetails: {
            gstType,
            gstRate: taxRate,
            cgstRate: Number(gst.cgstRate) || 0,
            sgstRate: Number(gst.sgstRate) || 0,
            igstRate: Number(gst.igstRate) || 0,
            cgstAmount,
            sgstAmount,
            igstAmount,
            totalGstAmount,
        },
    };
}

function quotationContentError(doc) {
    if (!doc.clientInfo || !String(doc.clientInfo.clientName || '').trim()) {
        return 'Client name is required';
    }
    if (!isEmail(doc.clientInfo.clientEmail)) {
        return 'A valid client email is required';
    }
    if (!Array.isArray(doc.modules) || doc.modules.length === 0) {
        return 'At least one line item is required';
    }
    for (const module of doc.modules) {
        if (!String(module.name || '').trim()) return 'Each line item needs a name';
        if (!Number.isFinite(Number(module.hours)) || Number(module.hours) < 0) {
            return 'Hours must be zero or greater';
        }
        if (!Number.isFinite(Number(module.rate)) || Number(module.rate) < 0) {
            return 'Rate must be zero or greater';
        }
    }
    const discountRate = Number(doc.discountRate) || 0;
    if (discountRate < 0 || discountRate > 100) return 'Discount must be between 0 and 100';
    return null;
}

function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isGstin(value) {
    if (!value) return true;
    return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(value).trim().toUpperCase());
}

function isMobile(value) {
    if (!value) return true;
    const digits = String(value).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
}

module.exports = {
    round2,
    computeTotals,
    quotationContentError,
    isEmail,
    isGstin,
    isMobile,
};
