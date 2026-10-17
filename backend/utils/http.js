function safeMessage(error) {
    const message = error && error.message ? String(error.message) : 'Request failed';
    if (/mongodb(\+srv)?:\/\//i.test(message) || /MONGODB_URI|SMTP_PASSWORD|password/i.test(message)) {
        return 'Request failed';
    }
    return message;
}

function pageQuery(req) {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    return { page, limit, skip: (page - 1) * limit };
}

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { safeMessage, pageQuery, escapeRegex };
