const path = require('path');
const fs = require('fs');

let waClient = null;
let sessionState = 'DISCONNECTED'; // 'DISCONNECTED' | 'STARTING' | 'SCAN_QR_CODE' | 'CONNECTED'
let latestQrCode = null;
let isStarting = false;
const activeSends = new Set(); // Prevent duplicate sends concurrently

// Ensure local session directory exists inside backend/.wa_session
const sessionDir = path.join(__dirname, '..', '.wa_session');
if (!fs.existsSync(sessionDir)) {
    try {
        fs.mkdirSync(sessionDir, { recursive: true });
    } catch {
        // ignore directory creation error
    }
}

function getWhatsAppStatus() {
    return {
        status: sessionState,
        qrCode: sessionState === 'SCAN_QR_CODE' ? latestQrCode : null,
        isReady: sessionState === 'CONNECTED' && waClient !== null,
    };
}

async function initializeWhatsApp() {
    if (sessionState === 'CONNECTED' && waClient) {
        return getWhatsAppStatus();
    }
    if (isStarting) {
        return getWhatsAppStatus();
    }

    isStarting = true;
    sessionState = 'STARTING';
    latestQrCode = null;

    try {
        const { create, ev } = require('@open-wa/wa-automate');

        // Capture QR code without logging sensitive data
        ev.on('qr.**', (qrcode) => {
            sessionState = 'SCAN_QR_CODE';
            latestQrCode = qrcode; // data:image/png;base64,...
        });

        const client = await create({
            sessionId: 'cravora_wa_session',
            multiDevice: true,
            authTimeout: 90,
            qrTimeout: 0,
            headless: true,
            useChrome: true,
            sessionDataPath: sessionDir,
            userDataDir: sessionDir,
            disableSpins: true,
            popup: false,
            logConsole: false,
            chromiumArgs: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
            ],
        });

        waClient = client;
        sessionState = 'CONNECTED';
        latestQrCode = null;
        isStarting = false;

        if (typeof client.onStateChanged === 'function') {
            client.onStateChanged((state) => {
                if (state === 'CONFLICT' || state === 'UNPAIRED' || state === 'UNLAUNCHED') {
                    sessionState = 'DISCONNECTED';
                    waClient = null;
                }
            });
        }

        return getWhatsAppStatus();
    } catch (error) {
        sessionState = 'DISCONNECTED';
        waClient = null;
        latestQrCode = null;
        isStarting = false;
        console.error('Failed to initialize local WhatsApp session:', error.message || error);
        throw new Error(error.message || 'WhatsApp session initialization failed');
    }
}

/**
 * Validates and normalizes phone number to international format: <country_code><number>@c.us
 */
function normalizeChatId(phone) {
    if (!phone || typeof phone !== 'string') {
        throw new Error('A valid recipient phone number is required');
    }

    // Strip spaces, dashes, brackets, plus sign
    let clean = phone.replace(/[^\d]/g, '');

    // Handle leading 0 commonly used in national dialing: e.g. 09876543210 -> 9876543210
    if (clean.length === 11 && clean.startsWith('0')) {
        clean = clean.slice(1);
    }

    // Common standard for Indian 10-digit mobile numbers: if 10 digits, prepend 91
    if (clean.length === 10) {
        clean = `91${clean}`;
    }

    // Must be between 10 and 15 digits
    if (clean.length < 10 || clean.length > 15) {
        throw new Error('Phone number must be between 10 and 15 digits with country code');
    }

    return `${clean}@c.us`;
}

/**
 * Ensures chat is verified, created, and initialized in WhatsApp Web
 */
async function ensureChatInitialized(client, chatId) {
    if (!client || typeof client.evaluate !== 'function') return null;

    return await client.evaluate(async (to) => {
        try {
            const widFactory = window.Store?.WidFactory;
            let wid = widFactory?.createWid ? widFactory.createWid(to) : to;

            // 1. Check if number exists on WhatsApp and get canonical registered WID
            if (window.Store?.WapQuery?.queryExist) {
                try {
                    const existRes = await window.Store.WapQuery.queryExist(wid);
                    if (existRes && existRes.jid) {
                        wid = existRes.jid;
                    } else if (existRes && (existRes.status === 404 || existRes.status === 400)) {
                        return { exists: false, error: 'The recipient phone number is not registered on WhatsApp.' };
                    }
                } catch (e) {
                    if (String(e).includes('404')) {
                        return { exists: false, error: 'The recipient phone number is not registered on WhatsApp.' };
                    }
                }
            }

            // 2. Locate or create Chat model using WhatsApp Web's findOrCreateLatestChat
            let chat = null;
            let lid = null;
            const findMod = window.mR?.findModule ? window.mR.findModule('findOrCreateLatestChat')[0] : null;
            if (findMod?.findOrCreateLatestChat) {
                try {
                    const res = await findMod.findOrCreateLatestChat(wid);
                    if (res && res.chat) {
                        chat = res.chat;
                    }
                } catch (e) {
                    console.warn('findOrCreateLatestChat notice:', e.message || e);
                }
            }

            // Fallback to Store.Chat.get if already existing
            if (!chat && window.Store?.Chat) {
                chat = window.Store.Chat.get(wid) || window.Store.Chat.get(to);
            }

            if (chat?.id) {
                lid = chat.id._serialized || String(chat.id);
            }

            // 3. Patch Store.Chat.get with phone-to-LID resolver so OpenWA's media sender finds the chat
            if (!window.__phoneChatMap) {
                window.__phoneChatMap = new Map();
                if (window.Store?.Chat?.get) {
                    const origGet = window.Store.Chat.get.bind(window.Store.Chat);
                    window.Store.Chat.get = function(key) {
                        const direct = origGet(key);
                        if (direct) return direct;
                        const keyStr = (key && key._serialized) || String(key || '');
                        const mapped = window.__phoneChatMap.get(keyStr);
                        if (mapped) return origGet(mapped) || mapped;
                        return direct;
                    };
                }
            }

            if (lid) {
                window.__phoneChatMap.set(to, lid);
                const cleanPhone = to.replace(/[^\d]/g, '');
                window.__phoneChatMap.set(`${cleanPhone}@c.us`, lid);
                window.__phoneChatMap.set(cleanPhone, lid);
            }

            return {
                exists: true,
                lid,
                hasChat: Boolean(chat || (window.Store?.Chat && window.Store.Chat.get(to))),
            };
        } catch (err) {
            return { exists: null, error: err.message || String(err) };
        }
    }, chatId);
}

/**
 * Sends a PDF document with caption text via OpenWA
 */
async function sendWhatsAppDocument({ phone, message, pdfBase64, filename, quotationId }) {
    const chatId = normalizeChatId(phone);

    // Validate PDF
    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
        throw new Error('A valid PDF document is required');
    }

    // Max 20MB limit
    const maxBytes = 20 * 1024 * 1024;
    if (pdfBase64.length > maxBytes * 1.37) {
        throw new Error('PDF attachment is too large (maximum 20MB)');
    }

    if (!waClient || sessionState !== 'CONNECTED') {
        throw new Error('WhatsApp is not connected. Please connect and scan the QR code first.');
    }

    // Format Data URL
    const dataUrl = pdfBase64.startsWith('data:')
        ? pdfBase64
        : `data:application/pdf;base64,${pdfBase64}`;

    // Sanitize filename
    const safeFilename = (filename || `${quotationId || 'Quotation'}.pdf`)
        .replace(/[^a-zA-Z0-9._-]/g, '_');

    // Duplicate send protection
    const sendKey = `${chatId}_${safeFilename}_${quotationId || ''}`;
    if (activeSends.has(sendKey)) {
        throw new Error('A message is already being sent for this document. Please wait.');
    }

    activeSends.add(sendKey);

    try {
        const caption = typeof message === 'string' ? message.slice(0, 4000) : '';

        // 1. Ensure chat model is loaded into WhatsApp Web and aliased in Store.Chat
        const chatInit = await ensureChatInitialized(waClient, chatId);
        if (chatInit && chatInit.exists === false) {
            throw new Error(chatInit.error || 'The recipient phone number is not registered on WhatsApp.');
        }

        // Brief delay for store sync
        await new Promise((resolve) => setTimeout(resolve, 600));

        // 2. OpenWA v5.6 expects options object matching MediaSendOptionsSchema: { type: 'document', caption }
        // We use chatInit.lid or chatId directly (Store.Chat.get resolves both via our resolver)
        const targetChatId = (chatInit && chatInit.lid) || chatId;
        const result = await waClient.sendFile(
            targetChatId,
            dataUrl,
            safeFilename,
            {
                type: 'document',
                caption,
            }
        );

        return {
            success: true,
            chatId,
            messageId: typeof result === 'string' ? result : (result && result._serialized) || 'sent',
        };
    } finally {
        activeSends.delete(sendKey);
    }
}

module.exports = {
    getWhatsAppStatus,
    initializeWhatsApp,
    sendWhatsAppDocument,
    normalizeChatId,
    getClient: () => waClient,
};
