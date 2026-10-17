const Counter = require('../models/Counter');

async function maxSequence(Model, field, prefix, year) {
    const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
    const docs = await Model.find({ [field]: pattern }).select(field).lean();
    let max = 0;
    for (const doc of docs) {
        const match = String(doc[field] || '').match(pattern);
        if (match) max = Math.max(max, parseInt(match[1], 10));
    }
    return max;
}

async function nextDocumentNumber(prefix, Model, field, session) {
    const year = new Date().getFullYear();
    const key = `${prefix}-${year}`;
    const existingQuery = Counter.findOne({ key });
    if (session) existingQuery.session(session);
    const existing = await existingQuery.lean();
    if (!existing) {
        const max = await maxSequence(Model, field, prefix, year);
        const options = { upsert: true };
        if (session) options.session = session;
        await Counter.updateOne({ key }, { $setOnInsert: { seq: max } }, options);
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const options = { new: true };
        if (session) options.session = session;
        const updated = await Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, options);
        const number = `${prefix}-${year}-${String(updated.seq).padStart(3, '0')}`;
        const clashQuery = Model.exists({ [field]: number });
        if (session) clashQuery.session(session);
        const clash = await clashQuery;
        if (!clash) return number;
    }

    const error = new Error('Could not allocate a document number');
    error.status = 500;
    throw error;
}

module.exports = { nextDocumentNumber };
