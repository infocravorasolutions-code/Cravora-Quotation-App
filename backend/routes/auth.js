const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const Session = require('../models/Session');
const { hashPassword, verifyPassword, requireAuth } = require('../utils/auth');
const { isEmail } = require('../utils/totals');

const router = express.Router();
const SESSION_DAYS = 14;

function passwordError(password) {
    if (String(password || '').length < 8) return 'Password must be at least 8 characters';
    return '';
}

async function startSession(email, role = 'admin') {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    const safeRole = role === 'accounts' || role === 'viewer' ? role : 'admin';
    await Session.create({ token, email, role: safeRole, expiresAt });
    return { token, email, role: safeRole };
}

router.get('/status', async (req, res) => {
    const count = await User.countDocuments();
    res.json({ needsSetup: count === 0 });
});

router.post('/setup', async (req, res) => {
    const count = await User.countDocuments();
    if (count > 0) return res.status(400).json({ message: 'An account already exists' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!isEmail(email)) return res.status(400).json({ message: 'A valid email is required' });
    const invalid = passwordError(password);
    if (invalid) return res.status(400).json({ message: invalid });
    const { salt, hash } = hashPassword(password);
    await User.create({ email, passwordSalt: salt, passwordHash: hash, role: 'admin' });
    res.json(await startSession(email, 'admin'));
});

router.post('/login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = await User.findOne({ email });
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
        return res.status(401).json({ message: 'Email or password is incorrect' });
    }
    res.json(await startSession(user.email, user.role || 'admin'));
});

router.get('/me', requireAuth, (req, res) => {
    res.json({ email: req.auth.email, role: req.auth.role || 'admin' });
});

router.get('/users', requireAuth, async (req, res) => {
    const users = await User.find().select('email role createdAt').sort({ email: 1 }).lean();
    res.json({ items: users });
});

router.post('/users', requireAuth, async (req, res) => {
    if ((req.auth.role || 'admin') !== 'admin') {
        return res.status(403).json({ message: 'Only an admin can add a user' });
    }
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const role = req.body?.role === 'viewer' ? 'viewer' : 'accounts';
    if (!isEmail(email)) return res.status(400).json({ message: 'A valid email is required' });
    const invalid = passwordError(password);
    if (invalid) return res.status(400).json({ message: invalid });
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'That email already has an account' });
    const { salt, hash } = hashPassword(password);
    const user = await User.create({ email, passwordSalt: salt, passwordHash: hash, role });
    res.status(201).json({ _id: user._id, email: user.email, role: user.role });
});

router.put('/users/:id', requireAuth, async (req, res) => {
    if ((req.auth.role || 'admin') !== 'admin') {
        return res.status(403).json({ message: 'Only an admin can update a user' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (req.body.role) {
        const allowedRoles = ['admin', 'accounts', 'viewer'];
        if (!allowedRoles.includes(req.body.role)) {
            return res.status(400).json({ message: 'Invalid role' });
        }
        if (user.role === 'admin' && req.body.role !== 'admin') {
            const adminCount = await User.countDocuments({ role: 'admin' });
            if (adminCount <= 1) {
                return res.status(400).json({ message: 'Cannot demote the only administrator' });
            }
        }
        user.role = req.body.role;
        await Session.updateMany({ email: user.email }, { role: user.role });
    }

    if (req.body.password) {
        const invalid = passwordError(req.body.password);
        if (invalid) return res.status(400).json({ message: invalid });
        const { salt, hash } = hashPassword(req.body.password);
        user.passwordSalt = salt;
        user.passwordHash = hash;
    }

    await user.save();
    res.json({ _id: user._id, email: user.email, role: user.role });
});

router.delete('/users/:id', requireAuth, async (req, res) => {
    if ((req.auth.role || 'admin') !== 'admin') {
        return res.status(403).json({ message: 'Only an admin can delete a user' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.email === req.auth.email) {
        return res.status(400).json({ message: 'You cannot delete your own active user account' });
    }

    if (user.role === 'admin') {
        const adminCount = await User.countDocuments({ role: 'admin' });
        if (adminCount <= 1) {
            return res.status(400).json({ message: 'Cannot delete the only administrator' });
        }
    }

    await User.deleteOne({ _id: user._id });
    await Session.deleteMany({ email: user.email });
    res.json({ message: `User ${user.email} deleted successfully` });
});

router.post('/logout', requireAuth, async (req, res) => {
    await Session.deleteOne({ token: req.auth.token });
    res.json({ message: 'Signed out' });
});

module.exports = router;
