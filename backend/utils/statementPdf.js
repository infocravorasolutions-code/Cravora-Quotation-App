const pdfParse = require('pdf-parse');

const MONTHS = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
};
const MONTH_NAMES = Object.keys(MONTHS).filter((name) => name.length >= 3).join('|');
const DATE_SLASH = /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/;
const REF = /\b(?:UPI|IMPS|NEFT|RTGS|CHQ|CHEQUE|REF|UTR)[-:\s/]*[A-Z0-9/-]{6,}/i;

function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function moneyValue(token) {
    const amount = Number(String(token || '').replace(/,/g, ''));
    if (!Number.isFinite(amount)) return null;
    return Math.abs(amount);
}

function moneyText(amount) {
    const fixed = round2(amount).toFixed(2);
    const [whole, decimals] = fixed.split('.');
    const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return [`${withCommas}.${decimals}`, fixed];
}

function pickReference(description) {
    const match = String(description || '').match(REF);
    return match ? match[0].slice(0, 120) : '';
}

function formatDayMonthYear(day, monthName, year) {
    const month = MONTHS[String(monthName || '').toLowerCase()];
    if (!month || !day || !year) return '';
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function takeEndAmount(text) {
    const source = String(text || '');
    // Kotak glues amount and balance: 35.0055.68 or 29,600.0029,928.72
    // Allow a space between them for CSV-like PDF text. Ignore footer text after the balance.
    const pairRe = /(\d{1,3}(?:,\d{3})*\.\d{2})\s*(\d{1,3}(?:,\d{3})*\.\d{2})/g;
    let pair = null;
    let match;
    while ((match = pairRe.exec(source)) !== null) pair = match;
    if (pair) {
        return {
            raw: pair[2],
            value: moneyValue(pair[2]),
            txnRaw: pair[1],
            txnValue: moneyValue(pair[1]),
            text: source.slice(0, pair.index).trimEnd(),
        };
    }
    const singleRe = /(\d{1,3}(?:,\d{3})*\.\d{2})/g;
    let single = null;
    while ((match = singleRe.exec(source)) !== null) single = match;
    if (single) {
        return {
            raw: single[1],
            value: moneyValue(single[1]),
            text: source.slice(0, single.index).trimEnd(),
        };
    }
    return null;
}

function stripKnownAmount(text, amount) {
    let source = String(text || '');
    for (const form of moneyText(amount)) {
        if (source.endsWith(form)) return source.slice(0, -form.length).trimEnd();
    }
    return source;
}

function cleanDescription(text) {
    return String(text || '')
        .replace(/Statement Generated[\s\S]*$/i, ' ')
        .replace(/Account No\.[\s\S]*$/i, ' ')
        .replace(/Account Statement\d{0,2}\s*[A-Za-z]{3}\s+\d{4}[\s\S]*$/i, ' ')
        .replace(/#?DateDescription[\s\S]*?Balance/gi, ' ')
        .replace(/Savings Account Transactions/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
}

function rowFromBalanceChange(date, body, previousBalance) {
    const end = takeEndAmount(body);
    if (!end || end.value == null) return null;
    const balance = end.value;
    let description = end.text;
    let amount = null;
    let debit = '';
    let credit = '';

    if (previousBalance != null && Number.isFinite(previousBalance)) {
        amount = round2(Math.abs(balance - previousBalance));
        if (!(amount > 0)) return null;
        if (balance > previousBalance) credit = String(amount);
        else debit = String(amount);
    } else if (end.txnValue != null && end.txnValue > 0) {
        amount = end.txnValue;
        const hint = String(body || '').toLowerCase();
        if (/\b(recd|received|deposit|neftinw|credit)\b/.test(hint)) credit = String(amount);
        else debit = String(amount);
    } else {
        return null;
    }

    description = stripKnownAmount(description, amount);
    if (end.txnValue != null) description = stripKnownAmount(description, end.txnValue);
    description = cleanDescription(description);
    if (!description) description = 'Bank transaction';
    return {
        row: [date, description, pickReference(description), debit, credit, String(balance)],
        balance,
    };
}

function kotakTable(text) {
    const source = String(text || '').replace(/\u00a0/g, ' ');
    const header = ['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'];
    const rows = [header];
    let previousBalance = null;
    const opening = source.match(/Opening Balance[-:\s]*([\d,]+\.\d{2})/i);
    if (opening) previousBalance = moneyValue(opening[1]);

    let expected = 1;
    let cursor = 0;
    while (expected <= 500) {
        const pattern = new RegExp(String(expected) + `(\\d{1,2})\\s+(${MONTH_NAMES})\\s+(\\d{4})`, 'i');
        const slice = source.slice(cursor);
        const match = slice.match(pattern);
        if (!match) break;
        const start = cursor + match.index;
        const date = formatDayMonthYear(match[1], match[2], match[3]);
        const bodyStart = start + match[0].length;
        const nextPattern = new RegExp(String(expected + 1) + `(\\d{1,2})\\s+(${MONTH_NAMES})\\s+(\\d{4})`, 'i');
        const next = source.slice(bodyStart).match(nextPattern);
        const bodyEnd = next ? bodyStart + next.index : Math.min(source.length, bodyStart + 1200);
        let body = source.slice(bodyStart, bodyEnd);
        body = body.replace(/Statement Generated[\s\S]*?(?:Page \d+ of \d+)/gi, ' ');
        body = body.replace(/#?DateDescription[\s\S]*?Balance/gi, ' ');
        body = body.replace(/End of Statement[\s\S]*$/i, ' ');
        const built = rowFromBalanceChange(date, body, previousBalance);
        if (built) {
            rows.push(built.row);
            previousBalance = built.balance;
        }
        cursor = bodyStart;
        expected += 1;
    }
    return rows;
}

function slashDateTable(text) {
    const header = ['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'];
    const rows = [header];
    const lines = String(text || '').split(/\r?\n/);
    let pending = '';
    let previousBalance = null;
    const opening = String(text || '').match(/Opening Balance[-:\s]*([\d,]+\.\d{2})/i);
    if (opening) previousBalance = moneyValue(opening[1]);

    const flush = () => {
        if (!pending) return;
        const trimmed = pending.replace(/\s+/g, ' ').trim();
        const dateMatch = trimmed.match(DATE_SLASH);
        if (!dateMatch) {
            pending = '';
            return;
        }
        const date = dateMatch[1];
        const body = trimmed.slice(dateMatch[0].length).trim();
        const built = rowFromBalanceChange(date, body, previousBalance);
        if (built) {
            rows.push(built.row);
            previousBalance = built.balance;
        }
        pending = '';
    };

    lines.forEach((raw) => {
        const line = String(raw || '').trim();
        if (!line) return;
        if (DATE_SLASH.test(line)) {
            flush();
            pending = line;
            return;
        }
        if (pending && !/^(page|statement|account|opening|closing|total)\b/i.test(line)) {
            pending = `${pending} ${line}`;
        }
    });
    flush();
    return rows;
}

function pdfTextToTable(text) {
    const source = String(text || '').replace(/\u00a0/g, ' ');
    if (!source.trim()) {
        const error = new Error('This PDF has no readable text. Ask the bank for a text PDF, or export CSV / Excel.');
        error.status = 400;
        throw error;
    }

    let rows = kotakTable(source);
    if (rows.length < 2) rows = slashDateTable(source);

    if (rows.length < 2) {
        const error = new Error('No statement lines were found in this PDF. Use a bank text PDF, or export CSV / Excel.');
        error.status = 400;
        throw error;
    }
    return rows;
}

async function extractPdfText(buffer) {
    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
    if (!bytes.length) {
        const error = new Error('Choose a statement file');
        error.status = 400;
        throw error;
    }
    try {
        const parsed = await pdfParse(bytes);
        return String(parsed.text || '');
    } catch (err) {
        const error = new Error('Could not read this PDF. Use a text PDF from the bank, or export CSV / Excel.');
        error.status = 400;
        throw error;
    }
}

async function tableFromPdfBuffer(buffer) {
    const text = await extractPdfText(buffer);
    return pdfTextToTable(text);
}

module.exports = {
    pdfTextToTable,
    extractPdfText,
    tableFromPdfBuffer,
};
