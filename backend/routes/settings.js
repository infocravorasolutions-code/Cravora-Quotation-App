const express = require('express');
const nodemailer = require('nodemailer');
const { writeEnv } = require('../utils/envFile');
const { isEmail } = require('../utils/totals');
const { sendTestEmail } = require('../services/mailer');

const router = express.Router();

function smtpView() {
    return {
        configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM),
        host: process.env.SMTP_HOST || '',
        port: Number(process.env.SMTP_PORT) || 587,
        user: process.env.SMTP_USER || '',
        from: process.env.SMTP_FROM || '',
        passwordSet: Boolean(process.env.SMTP_PASSWORD),
    };
}

router.get('/smtp', (req, res) => {
    res.json(smtpView());
});

router.post('/smtp', async (req, res) => {
    const host = String(req.body?.host || '').trim();
    const from = String(req.body?.from || '').trim();
    const user = String(req.body?.user || '').trim();
    const port = Number(req.body?.port) || 587;
    const password = req.body?.password == null ? '' : String(req.body.password);
    const testTo = String(req.body?.testTo || from).trim();
    if (!host) return res.status(400).json({ message: 'SMTP host is required' });
    if (!isEmail(from)) return res.status(400).json({ message: 'A valid from email is required' });
    if (!user) return res.status(400).json({ message: 'SMTP user is required' });
    if (port < 1 || port > 65535) return res.status(400).json({ message: 'SMTP port is invalid' });
    if (!isEmail(testTo)) return res.status(400).json({ message: 'A valid test email address is required' });
    const nextPassword = password || process.env.SMTP_PASSWORD || '';
    if (!nextPassword) return res.status(400).json({ message: 'SMTP password is required' });

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        requireTLS: port === 587,
        auth: { user, pass: nextPassword },
    });
    try {
        await transporter.verify();
    } catch {
        return res.status(400).json({ message: 'Could not sign in to the mail server. Check the host, user, and password.' });
    }

    writeEnv({
        SMTP_HOST: host,
        SMTP_PORT: String(port),
        SMTP_USER: user,
        SMTP_PASSWORD: nextPassword,
        SMTP_FROM: from,
    });

    try {
        await sendTestEmail(testTo);
    } catch {
        return res.status(400).json({
            message: 'Mail login worked, but the test message could not be sent. Check the mailbox password and that the host allows sending.',
            ...smtpView(),
        });
    }

    res.json({
        message: `Mail server saved. A test message was sent to ${testTo}. Check that inbox (and spam).`,
        testTo,
        ...smtpView(),
    });
});

module.exports = router;
