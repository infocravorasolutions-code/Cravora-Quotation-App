const AuditLog = require('../models/AuditLog');

async function logAudit(action, entityType, entityId, metadata) {
    try {
        await AuditLog.create({
            action,
            entityType,
            entityId: entityId == null ? '' : String(entityId),
            metadata: metadata || {},
            timestamp: new Date(),
        });
    } catch (error) {
        console.error('Audit log failed:', error.message);
    }
}

module.exports = { logAudit };
