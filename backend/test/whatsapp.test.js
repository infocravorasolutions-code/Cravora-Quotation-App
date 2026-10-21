const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeChatId,
    getWhatsAppStatus,
    sendWhatsAppDocument,
} = require('../services/whatsapp');

test('normalizeChatId formats 10-digit Indian numbers with country code 91', () => {
    assert.equal(normalizeChatId('9876543210'), '919876543210@c.us');
    assert.equal(normalizeChatId(' 98765 43210 '), '919876543210@c.us');
    assert.equal(normalizeChatId('98765-43210'), '919876543210@c.us');
    assert.equal(normalizeChatId('09876543210'), '919876543210@c.us');
});

test('normalizeChatId formats full international numbers properly', () => {
    assert.equal(normalizeChatId('+919876543210'), '919876543210@c.us');
    assert.equal(normalizeChatId('+1 (555) 234-5678'), '15552345678@c.us');
    assert.equal(normalizeChatId('+447123456789'), '447123456789@c.us');
});

test('normalizeChatId rejects invalid phone numbers', () => {
    assert.throws(() => normalizeChatId(''), /valid recipient phone/i);
    assert.throws(() => normalizeChatId('123'), /between 10 and 15 digits/i);
    assert.throws(() => normalizeChatId('12345678901234567'), /between 10 and 15 digits/i);
    assert.throws(() => normalizeChatId(null), /valid recipient phone/i);
});

test('getWhatsAppStatus returns initial disconnected state safely', () => {
    const status = getWhatsAppStatus();
    assert.equal(status.status, 'DISCONNECTED');
    assert.equal(status.qrCode, null);
    assert.equal(status.isReady, false);
});

test('sendWhatsAppDocument throws if not connected', async () => {
    await assert.rejects(
        async () => {
            await sendWhatsAppDocument({
                phone: '9876543210',
                message: 'Hello',
                pdfBase64: 'JVBERi0xLjQK...',
                filename: 'QTN-2026-001.pdf',
            });
        },
        /WhatsApp is not connected/i
    );
});

test('sendWhatsAppDocument validates required parameters', async () => {
    // Missing phone
    await assert.rejects(
        async () => {
            await sendWhatsAppDocument({
                phone: '',
                message: 'Test',
                pdfBase64: 'data',
            });
        },
        /valid recipient phone/i
    );
});
