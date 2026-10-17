const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { pageQuery } = require('../utils/http');

router.get('/', async (req, res) => {
    try {
        const { page, limit, skip } = pageQuery(req);
        const filter = {};
        if (req.query.entityType) filter.entityType = String(req.query.entityType);
        if (req.query.entityId) filter.entityId = String(req.query.entityId);
        const [items, total] = await Promise.all([
            AuditLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit),
            AuditLog.countDocuments(filter),
        ]);
        res.json({ items, total, page, limit });
    } catch (err) {
        res.status(500).json({ message: 'Could not load audit history' });
    }
});

module.exports = router;
