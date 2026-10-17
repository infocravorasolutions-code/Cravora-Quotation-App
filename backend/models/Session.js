const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    role: { type: String, enum: ['admin', 'accounts', 'viewer'], default: 'admin' },
    expiresAt: { type: Date, required: true },
});

module.exports = mongoose.model('Session', sessionSchema);
