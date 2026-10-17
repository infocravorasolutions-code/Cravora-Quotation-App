const crypto = require('crypto');
const Session = require('../models/Session');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return { salt, hash };
}

function verifyPassword(password, salt, hash) {
    const next = crypto.scryptSync(String(password), salt, 64);
    const stored = Buffer.from(String(hash || ''), 'hex');
    if (next.length !== stored.length) return false;
    return crypto.timingSafeEqual(next, stored);
}

async function requireAuth(req, res, next) {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ message: 'Sign in required' });
    const session = await Session.findOne({ token, expiresAt: { $gt: new Date() } });
    if (!session) return res.status(401).json({ message: 'Sign in required' });
    req.auth = { email: session.email, token, role: session.role || 'admin' };
    return next();
}

function canPostFinance(role) {
    return role === 'admin' || role === 'accounts';
}

function requireFinance(req, res, next) {
    if (!canPostFinance(req.auth && req.auth.role)) {
        return res.status(403).json({ message: 'You do not have permission to change accounts' });
    }
    return next();
}

module.exports = { hashPassword, verifyPassword, requireAuth, canPostFinance, requireFinance };
