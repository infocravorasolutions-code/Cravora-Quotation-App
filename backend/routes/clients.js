const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const { isEmail, isGstin, isMobile } = require('../utils/totals');
const { logAudit } = require('../utils/audit');
const { pageQuery, escapeRegex } = require('../utils/http');

function clientError(body) {
    if (!String(body.companyName || '').trim()) return 'Company name is required';
    if (!isEmail(body.email)) return 'A valid email is required';
    if (!isMobile(body.mobile)) return 'Mobile must contain 8 to 15 digits';
    if (!isGstin(body.gstin)) return 'GSTIN is not valid';
    return null;
}

function clientPayload(body) {
    return {
        companyName: String(body.companyName || '').trim(),
        contactPerson: String(body.contactPerson || '').trim(),
        email: String(body.email || '').trim(),
        mobile: String(body.mobile || '').trim(),
        gstin: String(body.gstin || '').trim().toUpperCase(),
        billingAddress: String(body.billingAddress || ''),
        shippingAddress: String(body.shippingAddress || ''),
        website: String(body.website || '').trim(),
        notes: String(body.notes || ''),
    };
}

router.get('/', async (req, res) => {
    try {
        const { page, limit, skip } = pageQuery(req);
        const filter = {};
        if (req.query.q) {
            const pattern = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), 'i');
            filter.$or = [{ companyName: pattern }, { contactPerson: pattern }, { email: pattern }];
        }
        const [items, total] = await Promise.all([
            Client.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
            Client.countDocuments(filter),
        ]);
        res.json({ items, total, page, limit });
    } catch (err) {
        res.status(500).json({ message: 'Could not load clients' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);
        if (!client) return res.status(404).json({ message: 'Client not found' });
        res.json(client);
    } catch (err) {
        res.status(400).json({ message: 'Client not found' });
    }
});

router.post('/', async (req, res) => {
    const message = clientError(req.body || {});
    if (message) return res.status(400).json({ message });
    try {
        const client = await Client.create(clientPayload(req.body));
        await logAudit('client_created', 'client', client._id, { companyName: client.companyName });
        res.status(201).json(client);
    } catch (err) {
        res.status(400).json({ message: 'Could not create client' });
    }
});

router.put('/:id', async (req, res) => {
    const message = clientError(req.body || {});
    if (message) return res.status(400).json({ message });
    try {
        const client = await Client.findByIdAndUpdate(req.params.id, clientPayload(req.body), {
            new: true,
            runValidators: true,
        });
        if (!client) return res.status(404).json({ message: 'Client not found' });
        await logAudit('client_updated', 'client', client._id, { companyName: client.companyName });
        res.json(client);
    } catch (err) {
        res.status(400).json({ message: 'Could not update client' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const client = await Client.findByIdAndDelete(req.params.id);
        if (!client) return res.status(404).json({ message: 'Client not found' });
        await logAudit('client_deleted', 'client', client._id, { companyName: client.companyName });
        res.json({ message: 'Client deleted' });
    } catch (err) {
        res.status(400).json({ message: 'Could not delete client' });
    }
});

module.exports = router;
