const nodemailer = require('nodemailer');

function isConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function documentEmailHtml({ kind, number, total, currency, link, message }) {
    const title = kind === 'invoice' ? 'Invoice' : kind === 'receipt' ? 'Receipt' : 'Quotation';
    const amountLabel = kind === 'receipt' ? 'Amount received' : 'Total';
    const safeMessage = escapeHtml(message || `Please find your ${title.toLowerCase()} attached.`);
    const linkBlock = link
        ? `<p><a href="${escapeHtml(link)}">View ${title.toLowerCase()} online</a></p>`
        : '';
    return `
        <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
            <p>${safeMessage}</p>
            <p><strong>${title}:</strong> ${escapeHtml(number)}</p>
            <p><strong>${amountLabel}:</strong> ${escapeHtml(currency || '')} ${escapeHtml(total)}</p>
            ${linkBlock}
            <p>Cravora Solutions</p>
        </div>
    `;
}

async function sendDocumentEmail({ to, subject, html, filename, pdfBase64 }) {
    if (!isConfigured()) {
        const error = new Error('Email is not configured');
        error.code = 'EMAIL_NOT_CONFIGURED';
        throw error;
    }

    const port = Number(process.env.SMTP_PORT) || 587;
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        requireTLS: port === 587,
        auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' }
            : undefined,
    });

    const attachments = [];
    if (pdfBase64) {
        attachments.push({
            filename: filename || 'document.pdf',
            content: Buffer.from(pdfBase64, 'base64'),
            contentType: 'application/pdf',
        });
    }

    const info = await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to,
        subject,
        html,
        attachments,
    });
    if (Array.isArray(info.rejected) && info.rejected.length) {
        const error = new Error('The mail server rejected the recipient');
        error.code = 'EMAIL_REJECTED';
        throw error;
    }
    return info;
}

async function sendTestEmail(to) {
    if (!isConfigured()) {
        const error = new Error('Email is not configured');
        error.code = 'EMAIL_NOT_CONFIGURED';
        throw error;
    }
    return sendDocumentEmail({
        to,
        subject: 'Cravora mail check',
        html: documentEmailHtml({
            kind: 'quotation',
            number: 'TEST',
            total: '0',
            currency: 'INR',
            message: 'This is a test from Cravora Settings. If you received it, quotation and invoice email can be sent.',
        }),
    });
}

module.exports = { isConfigured, documentEmailHtml, sendDocumentEmail, sendTestEmail };
