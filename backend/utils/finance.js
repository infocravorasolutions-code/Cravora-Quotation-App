const { round2 } = require('./totals');

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'upi', 'cheque', 'card', 'other'];
const RECURRENCE = ['none', 'weekly', 'monthly', 'yearly'];
const ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];

function toCents(value) {
    return Math.round(round2(value) * 100);
}

function fromCents(cents) {
    return cents / 100;
}

function sumMoney(values) {
    const cents = (values || []).reduce((sum, value) => sum + toCents(value), 0);
    return fromCents(cents);
}

function addMoney(left, right) {
    return fromCents(toCents(left) + toCents(right));
}

function subMoney(left, right) {
    return fromCents(toCents(left) - toCents(right));
}

function emptyMoney() {
    return { INR: 0, USD: 0 };
}

function addBucket(buckets, currency, amount) {
    const key = currency === 'USD' ? 'USD' : 'INR';
    buckets[key] = addMoney(buckets[key] || 0, amount || 0);
    return buckets;
}

function positiveAmountError(amount) {
    const number = Number(amount);
    if (!Number.isFinite(number) || number <= 0) return 'Amount must be greater than zero';
    const cents = toCents(number);
    if (cents <= 0) return 'Amount must be greater than zero';
    if (Math.abs(number - (cents / 100)) > 0.001) return 'Amount can have at most two decimal places';
    return '';
}

function exceedsBalance(amount, balance) {
    return toCents(amount) > toCents(balance);
}

function sameParty(left, right) {
    if (left == null || right == null || left === '' || right === '') return false;
    return String(left) === String(right);
}

function normalizeCurrency(value) {
    if (value === 'USD' || value === 'INR') return value;
    return '';
}

function deriveInvoiceStatus({ status, grandTotal, amountPaid, dueDate, now = new Date() }) {
    const paid = round2(amountPaid);
    const total = round2(grandTotal);
    const balanceDue = round2(Math.max(subMoney(total, paid), 0));
    if (status === 'cancelled') return { status: 'cancelled', amountPaid: paid, balanceDue };
    const overdue = dueDate && new Date(dueDate) < new Date(now);
    if (paid <= 0) {
        return { status: overdue ? 'overdue' : 'issued', amountPaid: paid, balanceDue };
    }
    if (paid + 0.009 < total) {
        return { status: overdue ? 'overdue' : 'partially_paid', amountPaid: paid, balanceDue };
    }
    return { status: 'paid', amountPaid: paid, balanceDue: 0 };
}

function invoicePosition(invoice, payments, now = new Date()) {
    const paid = sumMoney((payments || [])
        .filter((payment) => payment.status === 'recorded' && payment.invoiceId === invoice.invoiceNumber)
        .map((payment) => payment.amount));
    return {
        ...invoice,
        ...deriveInvoiceStatus({
            status: invoice.status,
            grandTotal: invoice.grandTotal,
            amountPaid: paid,
            dueDate: invoice.dueDate,
            now,
        }),
    };
}

function deriveObligation({ amount, amountPaid, voided }) {
    const paid = round2(amountPaid);
    const total = round2(amount);
    const balanceDue = round2(Math.max(subMoney(total, paid), 0));
    if (voided) return { status: 'void', amountPaid: paid, balanceDue };
    if (toCents(paid) <= 0) return { status: 'open', amountPaid: 0, balanceDue: total };
    if (toCents(paid) < toCents(total)) return { status: 'partially_paid', amountPaid: paid, balanceDue };
    return { status: 'paid', amountPaid: total, balanceDue: 0 };
}

function isOpenInvoice(invoice) {
    if (!invoice || invoice.status === 'draft' || invoice.status === 'cancelled') return false;
    return toCents(invoice.balanceDue) > 0;
}

function isOverdueInvoice(invoice, now = new Date()) {
    if (!isOpenInvoice(invoice)) return false;
    if (invoice.status === 'overdue') return true;
    return Boolean(invoice.dueDate) && new Date(invoice.dueDate) < new Date(now);
}

function unallocatedAmount(advance, allocations) {
    const used = sumMoney((allocations || [])
        .filter((row) => row.status === 'posted' && sameParty(row.sourceEntryId, advance._id))
        .map((row) => row.amount));
    return round2(Math.max(subMoney(advance.amount, used), 0));
}

function invoiceParty(invoice) {
    const snapshot = (invoice && invoice.clientSnapshot) || {};
    return snapshot.clientName || snapshot.companyName || '';
}

function matchClient(invoice, clients) {
    const list = clients || [];
    if (invoice.clientId) {
        return list.find((client) => sameParty(client._id, invoice.clientId))
            || { _id: invoice.clientId, companyName: invoiceParty(invoice) || 'Client' };
    }
    const email = String((invoice.clientSnapshot && invoice.clientSnapshot.clientEmail) || '').trim().toLowerCase();
    if (!email) return null;
    return list.find((client) => String(client.email || '').toLowerCase() === email) || null;
}

function receivableRows({ invoices, clients, advances, allocations, now = new Date() }) {
    const groups = new Map();
    const ensure = (key, name, clientId) => {
        if (!groups.has(key)) {
            groups.set(key, {
                clientId: clientId || '',
                partyName: name || 'Unlinked',
                outstanding: emptyMoney(),
                overdue: emptyMoney(),
                advance: emptyMoney(),
                invoices: 0,
                allocatable: 0,
            });
        }
        return groups.get(key);
    };

    (invoices || []).forEach((invoice) => {
        if (!isOpenInvoice(invoice)) return;
        const client = matchClient(invoice, clients);
        const key = client ? String(client._id) : `snapshot:${invoiceParty(invoice) || invoice.invoiceNumber}`;
        const row = ensure(key, client ? client.companyName : invoiceParty(invoice), client ? client._id : '');
        addBucket(row.outstanding, invoice.currency, invoice.balanceDue);
        if (isOverdueInvoice(invoice, now)) addBucket(row.overdue, invoice.currency, invoice.balanceDue);
        row.invoices += 1;
        if (client && sameParty(invoice.clientId, client._id)) row.allocatable += 1;
    });

    (advances || []).forEach((advance) => {
        if (advance.kind !== 'advance' || advance.reversedBy) return;
        const open = unallocatedAmount(advance, allocations);
        if (toCents(open) <= 0) return;
        const client = (clients || []).find((item) => sameParty(item._id, advance.clientId));
        const row = ensure(String(advance.clientId), (client && client.companyName) || advance.partyName || 'Client', advance.clientId);
        addBucket(row.advance, advance.currency, open);
    });

    return Array.from(groups.values());
}

function activeAccountError(account) {
    if (!account || account.isActive === false) return 'Choose an active account';
    return '';
}

function planAdvance({ amount, currency, account, client, method }) {
    const amountError = positiveAmountError(amount);
    if (amountError) return { error: amountError };
    const accountError = activeAccountError(account);
    if (accountError) return { error: accountError };
    const normalized = normalizeCurrency(currency || account.currency);
    if (!normalized) return { error: 'Currency must be INR or USD' };
    if (account.currency !== normalized) return { error: 'Currency does not match the account' };
    if (!client || !client._id) return { error: 'Client is required' };
    if (!PAYMENT_METHODS.includes(method)) return { error: 'Payment method is not valid' };
    const rounded = round2(amount);
    return {
        entry: {
            kind: 'advance',
            direction: 'in',
            amount: rounded,
            currency: normalized,
            accountId: account._id,
            clientId: client._id,
            partyName: client.companyName || '',
            method,
            affectsIncome: true,
            affectsExpense: false,
            cashEffect: true,
            status: 'posted',
        },
    };
}

function planAllocation({ advance, allocations, invoice, amount }) {
    if (!advance || advance.kind !== 'advance' || advance.reversedBy) return { error: 'Advance is not available' };
    if (!invoice) return { error: 'Invoice not found' };
    if (!invoice.issuedSnapshot || invoice.status === 'draft' || invoice.status === 'cancelled') {
        return { error: 'Payments can be recorded on an issued invoice' };
    }
    if (!sameParty(advance.clientId, invoice.clientId)) {
        return { error: 'This receipt cannot be applied to another client' };
    }
    if (advance.currency && invoice.currency && advance.currency !== invoice.currency) {
        return { error: 'Currency does not match the invoice' };
    }
    const amountError = positiveAmountError(amount);
    if (amountError) return { error: amountError };
    const open = unallocatedAmount(advance, allocations);
    const balance = round2(invoice.balanceDue != null ? invoice.balanceDue : subMoney(invoice.grandTotal, invoice.amountPaid || 0));
    if (exceedsBalance(amount, open)) return { error: 'Amount exceeds the unallocated advance' };
    if (exceedsBalance(amount, balance)) return { error: 'Payment exceeds the balance due' };
    const rounded = round2(amount);
    return {
        amount: rounded,
        payment: {
            invoiceId: invoice.invoiceNumber,
            clientId: invoice.clientId,
            amount: rounded,
            source: 'advance_allocation',
            status: 'recorded',
            advanceEntryId: advance._id,
        },
        allocation: {
            sourceEntryId: advance._id,
            targetType: 'invoice',
            targetId: invoice.invoiceNumber,
            clientId: invoice.clientId,
            amount: rounded,
            status: 'posted',
        },
        ledger: {
            kind: 'invoice_allocation',
            direction: 'in',
            amount: rounded,
            currency: invoice.currency || advance.currency || 'INR',
            clientId: invoice.clientId,
            invoiceNumber: invoice.invoiceNumber,
            affectsIncome: false,
            affectsExpense: false,
            cashEffect: false,
            status: 'posted',
        },
    };
}

function planTransfer({ amount, fromAccount, toAccount }) {
    const amountError = positiveAmountError(amount);
    if (amountError) return { error: amountError };
    const fromError = activeAccountError(fromAccount);
    if (fromError) return { error: fromError };
    const toError = activeAccountError(toAccount);
    if (toError) return { error: toError };
    if (sameParty(fromAccount._id, toAccount._id)) return { error: 'Choose two different accounts' };
    if (fromAccount.currency !== toAccount.currency) return { error: 'Accounts must use the same currency' };
    return {
        entry: {
            kind: 'transfer',
            direction: 'transfer',
            amount: round2(amount),
            currency: fromAccount.currency,
            accountId: fromAccount._id,
            counterAccountId: toAccount._id,
            affectsIncome: false,
            affectsExpense: false,
            cashEffect: true,
            status: 'posted',
        },
    };
}

function planAdjustment({ amount, direction, account, notes }) {
    const amountError = positiveAmountError(amount);
    if (amountError) return { error: amountError };
    const accountError = activeAccountError(account);
    if (accountError) return { error: accountError };
    if (direction !== 'in' && direction !== 'out') return { error: 'Direction is not valid' };
    if (String(notes || '').trim().length < 3) return { error: 'Enter a reason for the adjustment' };
    return {
        entry: {
            kind: 'adjustment',
            direction,
            amount: round2(amount),
            currency: account.currency,
            accountId: account._id,
            notes: String(notes).trim().slice(0, 1000),
            affectsIncome: false,
            affectsExpense: false,
            cashEffect: true,
            status: 'posted',
        },
    };
}

function planOpening({ amount, account }) {
    const number = Number(amount || 0);
    if (!Number.isFinite(number) || number < 0) return { error: 'Opening balance cannot be negative' };
    if (number === 0) return { entry: null };
    const amountError = positiveAmountError(number);
    if (amountError) return { error: amountError };
    if (!account || !account._id) return { error: 'Account is required' };
    return {
        entry: {
            kind: 'opening',
            direction: 'in',
            amount: round2(number),
            currency: account.currency,
            accountId: account._id,
            affectsIncome: false,
            affectsExpense: false,
            cashEffect: true,
            status: 'posted',
            notes: 'Opening balance',
        },
    };
}

function attachmentError(attachment) {
    if (!attachment || !attachment.data) return '';
    if (!ATTACHMENT_TYPES.includes(attachment.mimeType)) return 'Attachment must be a PNG, JPEG, or PDF';
    if (!String(attachment.fileName || '').trim()) return 'Attachment needs a file name';
    const data = String(attachment.data);
    if (data.length > 700000) return 'Attachment must be 500KB or smaller';
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(data)) return 'Attachment is not valid';
    return '';
}

function cleanAttachment(attachment) {
    if (!attachment || !attachment.data) return undefined;
    return {
        fileName: String(attachment.fileName).trim().slice(0, 180),
        mimeType: attachment.mimeType,
        data: String(attachment.data),
    };
}

function readDate(value, label) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return { error: `${label} is not valid` };
    return { date };
}

function planExpenseDocument(body, category) {
    const source = body || {};
    if (!category) return { error: 'Category is required' };
    if (category.kind !== 'operating') return { error: 'Choose an expense category' };
    const amountError = positiveAmountError(source.amount);
    if (amountError) return { error: amountError };
    const currency = normalizeCurrency(source.currency || 'INR');
    if (!currency) return { error: 'Currency must be INR or USD' };
    const fileError = attachmentError(source.attachment);
    if (fileError) return { error: fileError };
    const recurrence = source.recurrence || 'none';
    if (!RECURRENCE.includes(recurrence)) return { error: 'Recurrence is not valid' };
    if (!String(source.description || '').trim()) return { error: 'Description is required' };
    const paymentSource = normalizePaymentSource(source.paymentSource);
    if (!paymentSource) return { error: 'Payment source is not valid' };
    if (paymentSource === 'partner_personal' && !source.paidByUserId) return { error: 'Choose the partner who paid' };
    const dated = readDate(source.expenseDate, 'Date');
    if (dated.error) return { error: dated.error };
    let dueDate;
    if (source.dueDate) {
        const due = readDate(source.dueDate, 'Due date');
        if (due.error) return { error: due.error };
        dueDate = due.date;
    }
    return {
        amount: round2(source.amount),
        currency,
        recurrence,
        expenseDate: dated.date,
        dueDate,
        description: String(source.description).trim().slice(0, 300),
        notes: String(source.notes || '').slice(0, 1000),
        reference: String(source.reference || '').slice(0, 120),
        categoryName: category.name,
        attachment: cleanAttachment(source.attachment),
        nextRunAt: recurrence === 'none' ? undefined : nextRecurrence(dated.date, recurrence),
        paymentSource,
        paidByUserId: paymentSource === 'partner_personal' ? source.paidByUserId : undefined,
    };
}

function normalizePaymentSource(value) {
    const source = value || 'company_bank';
    if (!['company_cash', 'company_bank', 'partner_personal'].includes(source)) return '';
    return source;
}

function planPartnerReimbursement({ expense, amount, account }) {
    if (!expense || expense.status === 'void') return { error: 'This expense cannot be reimbursed' };
    if (expense.paymentSource !== 'partner_personal') return { error: 'This expense was not paid by a partner' };
    const amountError = positiveAmountError(amount);
    if (amountError) return { error: amountError };
    const accountError = activeAccountError(account);
    if (accountError) return { error: accountError };
    const currency = expense.currency || 'INR';
    if (account.currency !== currency) return { error: 'Currency does not match the account' };
    const remaining = round2(subMoney(expense.amount, expense.reimbursedAmount || 0));
    if (exceedsBalance(amount, remaining)) return { error: 'Reimbursement exceeds the amount owed to the partner' };
    const rounded = round2(amount);
    return {
        amount: rounded,
        remaining: round2(subMoney(remaining, rounded)),
        ledger: {
            kind: 'partner_reimbursement',
            direction: 'out',
            amount: rounded,
            currency,
            accountId: account._id,
            expenseId: expense._id,
            partyName: expense.paidByName || '',
            affectsIncome: false,
            affectsExpense: false,
            cashEffect: true,
            status: 'posted',
        },
    };
}

function partnerPayableRows(expenses) {
    const rows = new Map();
    (expenses || []).forEach((expense) => {
        if (!expense || expense.paymentSource !== 'partner_personal' || expense.status === 'void') return;
        const remaining = round2(subMoney(expense.amount, expense.reimbursedAmount || 0));
        if (toCents(remaining) <= 0) return;
        const key = String(expense.paidByUserId || '');
        const current = rows.get(key) || { paidByUserId: expense.paidByUserId || '', paidByName: expense.paidByName || '', INR: 0, USD: 0 };
        const currency = expense.currency === 'USD' ? 'USD' : 'INR';
        current[currency] = addMoney(current[currency], remaining);
        if (expense.paidByName) current.paidByName = expense.paidByName;
        rows.set(key, current);
    });
    return [...rows.values()];
}

function spentInRange(ledger, from, to) {
    const totals = emptyMoney();
    (ledger || []).forEach((entry) => {
        if (!entry || entry.reversedBy) return;
        if (entry.kind !== 'expense_payment' && entry.kind !== 'vendor_payment') return;
        if (!inRange(entry.postedAt, from, to)) return;
        addBucket(totals, entry.currency, entry.amount);
    });
    return totals;
}

function monthKey(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function spendBreakdown(expenses, from, to) {
    const company = emptyMoney();
    const partner = emptyMoney();
    const byPartner = new Map();
    const byCategory = new Map();
    const byMonth = new Map();
    (expenses || []).forEach((expense) => {
        if (!expense || expense.status === 'void') return;
        if (!inRange(expense.expenseDate, from, to)) return;
        const currency = expense.currency === 'USD' ? 'USD' : 'INR';
        const isPartner = expense.paymentSource === 'partner_personal';
        addBucket(isPartner ? partner : company, currency, expense.amount);
        if (isPartner) {
            const name = String(expense.paidByName || 'Partner').trim() || 'Partner';
            const row = byPartner.get(name) || { name, INR: 0, USD: 0 };
            addBucket(row, currency, expense.amount);
            byPartner.set(name, row);
        }
        const category = String(expense.categoryName || 'Uncategorised').trim() || 'Uncategorised';
        const categoryRow = byCategory.get(category) || {
            category,
            company: emptyMoney(),
            partner: emptyMoney(),
        };
        addBucket(isPartner ? categoryRow.partner : categoryRow.company, currency, expense.amount);
        byCategory.set(category, categoryRow);
        const month = monthKey(expense.expenseDate);
        if (month) {
            const monthRow = byMonth.get(month) || {
                month,
                company: emptyMoney(),
                partner: emptyMoney(),
            };
            addBucket(isPartner ? monthRow.partner : monthRow.company, currency, expense.amount);
            byMonth.set(month, monthRow);
        }
    });
    return {
        company,
        partner,
        byPartner: [...byPartner.values()].sort((left, right) => (right.INR + right.USD) - (left.INR + left.USD)),
        byCategory: [...byCategory.values()]
            .map((row) => ({
                category: row.category,
                companyINR: row.company.INR,
                companyUSD: row.company.USD,
                partnerINR: row.partner.INR,
                partnerUSD: row.partner.USD,
            }))
            .sort((left, right) => (right.companyINR + right.partnerINR) - (left.companyINR + left.partnerINR)),
        byMonth: [...byMonth.values()].sort((left, right) => left.month.localeCompare(right.month)),
    };
}

function statementDay(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
}

function statementFingerprint(line) {
    const reference = String(line.reference || '').trim().toLowerCase();
    const day = statementDay(line.postedAt);
    const amount = round2(line.amount);
    const direction = line.direction === 'in' ? 'in' : 'out';
    const accountId = String(line.accountId || '');
    if (reference) return `${accountId}|${reference}|${day}|${amount}|${direction}`;
    return `${accountId}|${day}|${amount}|${direction}`;
}

function matchStatementLine(line, entries) {
    const day = statementDay(line.postedAt);
    const amount = round2(line.amount);
    const direction = line.direction === 'in' ? 'in' : 'out';
    const candidates = (entries || []).filter((entry) => {
        if (!entry || entry.reversedBy || entry.cashEffect === false) return false;
        if (String(entry.accountId || '') !== String(line.accountId || '')) return false;
        if (round2(entry.amount) !== amount) return false;
        const entryDirection = entry.direction === 'in' ? 'in' : 'out';
        if (entryDirection !== direction) return false;
        return statementDay(entry.postedAt) === day;
    });
    const reference = String(line.reference || '').trim().toLowerCase();
    const pool = reference
        ? candidates.filter((entry) => String(entry.reference || '').trim().toLowerCase() === reference)
        : candidates;
    const chosen = reference && pool.length === 0 ? candidates : pool;
    if (chosen.length === 1) return { status: 'matched', ledgerEntryId: chosen[0]._id };
    if (chosen.length > 1) return { status: 'potential_duplicate' };
    return { status: 'unmatched' };
}

function planVendorBill(body, category, vendor) {
    const source = body || {};
    if (!vendor || !vendor._id) return { error: 'Vendor is required' };
    if (!category) return { error: 'Category is required' };
    if (category.kind !== 'vendor') return { error: 'Choose a vendor category' };
    const amountError = positiveAmountError(source.amount);
    if (amountError) return { error: amountError };
    const currency = normalizeCurrency(source.currency || 'INR');
    if (!currency) return { error: 'Currency must be INR or USD' };
    const fileError = attachmentError(source.attachment);
    if (fileError) return { error: fileError };
    const recurrence = source.recurrence || 'none';
    if (!RECURRENCE.includes(recurrence)) return { error: 'Recurrence is not valid' };
    if (!String(source.description || '').trim()) return { error: 'Description is required' };
    if (!source.dueDate) return { error: 'Due date is required' };
    const billed = readDate(source.billDate, 'Bill date');
    if (billed.error) return { error: billed.error };
    const due = readDate(source.dueDate, 'Due date');
    if (due.error) return { error: due.error };
    return {
        amount: round2(source.amount),
        currency,
        recurrence,
        billDate: billed.date,
        dueDate: due.date,
        description: String(source.description).trim().slice(0, 300),
        notes: String(source.notes || '').slice(0, 1000),
        reference: String(source.reference || source.vendorRef || '').slice(0, 120),
        vendorRef: String(source.vendorRef || '').slice(0, 120),
        categoryName: category.name,
        vendorName: vendor.name || '',
        vendorId: vendor._id,
        attachment: cleanAttachment(source.attachment),
        nextRunAt: recurrence === 'none' ? undefined : nextRecurrence(billed.date, recurrence),
    };
}

function planObligationPayment({ kind, document, amount, account, vendorId }) {
    if (!document || document.status === 'void') return { error: 'This record is not open' };
    if (kind === 'vendor_payment' && !sameParty(document.vendorId, vendorId)) {
        return { error: 'This payment cannot be applied to another vendor' };
    }
    if (kind === 'expense_payment' && document.vendorId && vendorId && !sameParty(document.vendorId, vendorId)) {
        return { error: 'This payment cannot be applied to another vendor' };
    }
    const amountError = positiveAmountError(amount);
    if (amountError) return { error: amountError };
    const accountError = activeAccountError(account);
    if (accountError) return { error: accountError };
    const currency = document.currency || 'INR';
    if (account.currency !== currency) return { error: 'Currency does not match the account' };
    const balance = round2(document.balanceDue != null ? document.balanceDue : document.amount);
    if (exceedsBalance(amount, balance)) return { error: 'Payment exceeds the balance due' };
    const rounded = round2(amount);
    const ledger = {
        kind,
        direction: 'out',
        amount: rounded,
        currency,
        accountId: account._id,
        vendorId: document.vendorId,
        partyName: document.vendorName || '',
        affectsIncome: false,
        affectsExpense: true,
        cashEffect: true,
        status: 'posted',
    };
    if (kind === 'expense_payment') ledger.expenseId = document._id;
    if (kind === 'vendor_payment') ledger.vendorBillId = document._id;
    return { amount: rounded, ledger };
}

function planHistoricalLedger(payments, existingPaymentIds, invoiceCurrencies = {}) {
    const existing = new Set((existingPaymentIds || []).map((id) => String(id)));
    return (payments || [])
        .filter((payment) => payment && payment._id)
        .filter((payment) => payment.status === 'recorded')
        .filter((payment) => (payment.source || 'invoice') !== 'advance_allocation')
        .filter((payment) => !existing.has(String(payment._id)))
        .map((payment) => ({
            kind: 'client_receipt',
            direction: 'in',
            amount: round2(payment.amount),
            currency: invoiceCurrencies[payment.invoiceId] || payment.currency || 'INR',
            accountId: payment.accountId || undefined,
            clientId: payment.clientId,
            invoiceNumber: payment.invoiceId,
            paymentId: payment._id,
            partyName: payment.partyName || '',
            postedAt: payment.paymentDate,
            method: payment.paymentMethod,
            reference: payment.transactionReference || '',
            notes: payment.notes || 'Invoice payment',
            affectsIncome: true,
            affectsExpense: false,
            cashEffect: true,
            status: 'posted',
            idempotencyKey: `payment:${payment._id}`,
        }));
}

function planClientReceipt(payment) {
    const [entry] = planHistoricalLedger(payment ? [payment] : [], []);
    return entry || null;
}

function buildReversal(entry, postedAt = new Date()) {
    if (!entry) return { error: 'Entry not found' };
    if (entry.kind === 'reversal') return { error: 'A reversal cannot be reversed' };
    if (entry.reversedBy) return { error: 'This entry is already reversed' };
    const direction = entry.direction === 'in' ? 'out' : entry.direction === 'out' ? 'in' : 'transfer';
    const swapped = entry.direction === 'transfer';
    return {
        reversal: {
            kind: 'reversal',
            direction,
            amount: round2(entry.amount),
            currency: entry.currency || 'INR',
            accountId: swapped ? entry.counterAccountId : entry.accountId,
            counterAccountId: swapped ? entry.accountId : entry.counterAccountId,
            clientId: entry.clientId,
            vendorId: entry.vendorId,
            invoiceNumber: entry.invoiceNumber,
            expenseId: entry.expenseId,
            vendorBillId: entry.vendorBillId,
            paymentId: entry.paymentId,
            partyName: entry.partyName || '',
            method: entry.method,
            reference: entry.reference || '',
            notes: 'Reversal',
            postedAt,
            affectsIncome: false,
            affectsExpense: false,
            cashEffect: entry.cashEffect !== false,
            reversalOf: entry._id,
            status: 'posted',
        },
    };
}

function accountBalance(entries, accountId) {
    const id = String(accountId);
    let cents = 0;
    (entries || []).forEach((entry) => {
        if (!entry || entry.cashEffect === false) return;
        const amount = toCents(entry.amount);
        if (String(entry.accountId || '') === id) {
            if (entry.direction === 'in') cents += amount;
            else if (entry.direction === 'out' || entry.direction === 'transfer') cents -= amount;
        }
        if (entry.direction === 'transfer' && String(entry.counterAccountId || '') === id) cents += amount;
    });
    return fromCents(cents);
}

function inRange(value, from, to) {
    if (!from && !to) return true;
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return false;
    if (from && time < rangeStart(from).getTime()) return false;
    if (to && time > rangeEnd(to).getTime()) return false;
    return true;
}

function rangeStart(value) {
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00.000Z`);
    return new Date(text);
}

function rangeEnd(value) {
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T23:59:59.999Z`);
    return new Date(text);
}

function dateBounds(from, to) {
    if (from && Number.isNaN(rangeStart(from).getTime())) return { error: 'From date is not valid' };
    if (to && Number.isNaN(rangeEnd(to).getTime())) return { error: 'To date is not valid' };
    return { from: from ? rangeStart(from) : null, to: to ? rangeEnd(to) : null };
}

function addMonths(date, count) {
    const next = new Date(date);
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + count);
    const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, last));
    return next;
}

function addYears(date, count) {
    const next = new Date(date);
    const day = next.getDate();
    next.setDate(1);
    next.setFullYear(next.getFullYear() + count);
    const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, last));
    return next;
}

function nextRecurrence(date, recurrence) {
    const current = new Date(date);
    if (Number.isNaN(current.getTime())) return null;
    if (recurrence === 'weekly') {
        const next = new Date(current);
        next.setDate(next.getDate() + 7);
        return next;
    }
    if (recurrence === 'monthly') return addMonths(current, 1);
    if (recurrence === 'yearly') return addYears(current, 1);
    return null;
}

function childFromSeries(doc, now = new Date(), kind = 'expense') {
    if (!doc || doc.status === 'void') return { error: 'A void record cannot recur' };
    if (!doc.recurrence || doc.recurrence === 'none' || !doc.nextRunAt) return { error: 'This record is not recurring' };
    const runAt = new Date(doc.nextRunAt);
    if (Number.isNaN(runAt.getTime())) return { error: 'The next occurrence date is not valid' };
    if (runAt > new Date(now)) return { error: 'The next occurrence is not due' };
    const following = nextRecurrence(runAt, doc.recurrence);
    const child = {
        amount: round2(doc.amount),
        currency: doc.currency || 'INR',
        description: doc.description,
        notes: doc.notes || '',
        reference: doc.reference || '',
        categoryId: doc.categoryId,
        categoryName: doc.categoryName,
        vendorId: doc.vendorId,
        vendorName: doc.vendorName,
        recurrence: 'none',
        seriesId: doc.seriesId || doc._id,
        amountPaid: 0,
        balanceDue: round2(doc.amount),
        status: 'open',
        idempotencyKey: `recur:${doc._id}:${runAt.toISOString().slice(0, 10)}`,
    };
    if (kind === 'vendor_bill') {
        child.billDate = runAt;
        child.dueDate = runAt;
        child.vendorRef = doc.vendorRef || '';
    } else {
        child.expenseDate = runAt;
        child.dueDate = runAt;
        if (doc.paymentSource) {
            child.paymentSource = doc.paymentSource;
            child.paidByUserId = doc.paidByUserId;
            child.paidByName = doc.paidByName || '';
            child.reimbursedAmount = 0;
            child.createdBy = doc.createdBy || '';
            if (doc.paymentSource === 'partner_personal') {
                child.amountPaid = round2(doc.amount);
                child.balanceDue = 0;
                child.status = 'paid';
            }
        }
    }
    return { following, child };
}

function duplicateSupplierName(vendors, name) {
    const wanted = String(name || '').trim().toLowerCase();
    if (!wanted) return false;
    return (vendors || []).some((vendor) => String(vendor.name || '').trim().toLowerCase() === wanted);
}

function categoryTotals(expenses) {
    const rows = new Map();
    (expenses || []).forEach((expense) => {
        if (!expense || expense.status === 'void') return;
        const category = expense.categoryName || 'Uncategorised';
        const currency = expense.currency === 'USD' ? 'USD' : 'INR';
        const key = `${category}|${currency}`;
        const current = rows.get(key) || { category, currency, amount: 0, count: 0 };
        current.amount = addMoney(current.amount, expense.amount);
        current.count += 1;
        rows.set(key, current);
    });
    return [...rows.values()];
}

function cashMovementRows(ledger) {
    const received = emptyMoney();
    const spent = emptyMoney();
    const transfers = emptyMoney();
    const reimbursements = emptyMoney();
    (ledger || []).forEach((entry) => {
        if (!entry || entry.reversedBy || entry.kind === 'reversal') return;
        if (entry.kind === 'transfer') addBucket(transfers, entry.currency, entry.amount);
        else if (entry.kind === 'partner_reimbursement') addBucket(reimbursements, entry.currency, entry.amount);
        else if (entry.kind === 'client_receipt' || entry.kind === 'advance') addBucket(received, entry.currency, entry.amount);
        else if (entry.kind === 'expense_payment' || entry.kind === 'vendor_payment') addBucket(spent, entry.currency, entry.amount);
    });
    return [
        { movement: 'Received', INR: received.INR, USD: received.USD },
        { movement: 'Spent', INR: spent.INR, USD: spent.USD },
        { movement: 'Partner reimbursements', INR: reimbursements.INR, USD: reimbursements.USD },
        { movement: 'Transfers', INR: transfers.INR, USD: transfers.USD },
    ];
}

function postOnce(records, key, build) {
    if (key) {
        const existing = (records || []).find((record) => record.idempotencyKey === key);
        if (existing) return { duplicate: true, record: existing, records: records || [] };
    }
    const record = build();
    if (key) record.idempotencyKey = key;
    return { duplicate: false, record, records: (records || []).concat(record) };
}

function financeSummary({
    invoices, payments, ledger, expenses, vendorBills, accounts, now = new Date(), from, to, horizonDays = 30,
}) {
    const openInvoices = (invoices || []).filter((invoice) => isOpenInvoice(invoice));
    const receivables = emptyMoney();
    const overdue = emptyMoney();
    let overdueCount = 0;
    openInvoices.forEach((invoice) => {
        addBucket(receivables, invoice.currency, invoice.balanceDue);
        if (isOverdueInvoice(invoice, now)) {
            addBucket(overdue, invoice.currency, invoice.balanceDue);
            overdueCount += 1;
        }
    });

    const moneyReceived = emptyMoney();
    (payments || []).forEach((payment) => {
        if (payment.status !== 'recorded') return;
        if ((payment.source || 'invoice') === 'advance_allocation') return;
        if (!inRange(payment.paymentDate, from, to)) return;
        addBucket(moneyReceived, payment.currency || 'INR', payment.amount);
    });
    (ledger || []).forEach((entry) => {
        if (entry.kind !== 'advance' || entry.reversedBy) return;
        if (!inRange(entry.postedAt, from, to)) return;
        addBucket(moneyReceived, entry.currency, entry.amount);
    });

    const vendorPayables = emptyMoney();
    const unpaidExpenses = emptyMoney();
    const upcomingTotal = emptyMoney();
    const upcoming = [];
    const horizon = new Date(now).getTime() + (horizonDays * 24 * 60 * 60 * 1000);

    (vendorBills || []).forEach((bill) => {
        if (bill.status === 'void' || toCents(bill.balanceDue) <= 0) return;
        addBucket(vendorPayables, bill.currency, bill.balanceDue);
        const due = bill.dueDate ? new Date(bill.dueDate).getTime() : NaN;
        if (!Number.isNaN(due) && due >= new Date(now).getTime() && due <= horizon) {
            addBucket(upcomingTotal, bill.currency, bill.balanceDue);
            upcoming.push({
                id: String(bill._id || bill.billNumber || ''),
                kind: 'vendor_bill',
                label: bill.billNumber || bill.description || 'Vendor bill',
                partyName: bill.vendorName || '',
                dueDate: bill.dueDate,
                amount: bill.balanceDue,
                currency: bill.currency || 'INR',
            });
        }
    });

    (expenses || []).forEach((expense) => {
        if (expense.status === 'void' || toCents(expense.balanceDue) <= 0) return;
        addBucket(unpaidExpenses, expense.currency, expense.balanceDue);
        const due = expense.dueDate ? new Date(expense.dueDate).getTime() : NaN;
        if (!Number.isNaN(due) && due >= new Date(now).getTime() && due <= horizon) {
            addBucket(upcomingTotal, expense.currency, expense.balanceDue);
            upcoming.push({
                id: String(expense._id || expense.expenseNumber || ''),
                kind: 'expense',
                label: expense.expenseNumber || expense.description || 'Expense',
                partyName: expense.vendorName || '',
                dueDate: expense.dueDate,
                amount: expense.balanceDue,
                currency: expense.currency || 'INR',
            });
        }
    });

    upcoming.sort((left, right) => new Date(left.dueDate) - new Date(right.dueDate));

    const linkedAccounts = new Set((ledger || [])
        .filter((entry) => entry.paymentId && entry.accountId && entry.kind === 'client_receipt')
        .map((entry) => String(entry.paymentId)));
    const unassignedReceipts = (payments || []).filter((payment) => {
        if (payment.status !== 'recorded') return false;
        if ((payment.source || 'invoice') === 'advance_allocation') return false;
        if (payment.accountId) return false;
        return !linkedAccounts.has(String(payment._id));
    }).length + (ledger || []).filter((entry) => entry.kind === 'advance' && !entry.reversedBy && !entry.accountId).length;

    return {
        receivables,
        overdue,
        overdueCount,
        moneyReceived,
        vendorPayables,
        unpaidExpenses,
        upcomingTotal,
        upcoming,
        unassignedReceipts,
        accounts: (accounts || []).map((account) => ({
            _id: account._id,
            name: account.name,
            type: account.type,
            currency: account.currency,
            isActive: account.isActive !== false,
            balance: accountBalance(ledger, account._id),
        })),
    };
}

function transactionRows({ ledger, payments }) {
    const linked = new Set((ledger || []).filter((entry) => entry.paymentId).map((entry) => String(entry.paymentId)));
    const rows = (ledger || []).map((entry) => ({
        date: entry.postedAt,
        kind: entry.kind,
        amount: entry.amount,
        currency: entry.currency || 'INR',
        direction: entry.direction,
        income: entry.kind !== 'transfer' && entry.kind !== 'reversal' && Boolean(entry.affectsIncome) && !entry.reversedBy,
        expense: entry.kind !== 'transfer' && entry.kind !== 'reversal' && Boolean(entry.affectsExpense) && !entry.reversedBy,
        reference: entry.reference || entry.entryNumber || '',
        party: entry.partyName || '',
        accountId: entry.accountId ? String(entry.accountId) : '',
        sourceId: entry.paymentId ? String(entry.paymentId) : String(entry._id || ''),
        reversed: Boolean(entry.reversedBy),
    }));
    (payments || []).forEach((payment) => {
        if (linked.has(String(payment._id))) return;
        if (payment.status !== 'recorded') return;
        if ((payment.source || 'invoice') === 'advance_allocation') return;
        rows.push({
            date: payment.paymentDate,
            kind: 'client_receipt',
            amount: payment.amount,
            currency: payment.currency || 'INR',
            direction: 'in',
            income: true,
            expense: false,
            reference: payment.transactionReference || '',
            party: payment.partyName || '',
            accountId: payment.accountId ? String(payment.accountId) : '',
            sourceId: String(payment._id),
            reversed: false,
        });
    });
    return rows.sort((left, right) => new Date(right.date) - new Date(left.date));
}

function outstandingRows(invoices, { from, to, now = new Date() } = {}) {
    return (invoices || []).filter((invoice) => {
        if (!isOpenInvoice(invoice)) return false;
        if (!from && !to) return true;
        return inRange(invoice.dueDate || invoice.issueDate, from, to);
    }).map((invoice) => ({
        invoiceNumber: invoice.invoiceNumber,
        clientId: invoice.clientId ? String(invoice.clientId) : '',
        party: invoiceParty(invoice),
        issueDate: invoice.issueDate || '',
        dueDate: invoice.dueDate || '',
        status: isOverdueInvoice(invoice, now) ? 'overdue' : invoice.status,
        currency: invoice.currency || 'INR',
        grandTotal: invoice.grandTotal,
        amountPaid: invoice.amountPaid,
        balanceDue: invoice.balanceDue,
    }));
}

function expenseReportRows({ expenses, vendorBills }) {
    const rows = (expenses || []).map((expense) => ({
        type: 'expense',
        number: expense.expenseNumber || '',
        date: expense.expenseDate,
        dueDate: expense.dueDate || '',
        party: expense.vendorName || '',
        category: expense.categoryName || '',
        description: expense.description || '',
        currency: expense.currency || 'INR',
        amount: expense.amount,
        amountPaid: expense.amountPaid || 0,
        balanceDue: expense.balanceDue,
        status: expense.status,
        reference: expense.reference || '',
    }));
    (vendorBills || []).forEach((bill) => {
        rows.push({
            type: 'vendor_bill',
            number: bill.billNumber || '',
            date: bill.billDate,
            dueDate: bill.dueDate || '',
            party: bill.vendorName || '',
            category: bill.categoryName || '',
            description: bill.description || '',
            currency: bill.currency || 'INR',
            amount: bill.amount,
            amountPaid: bill.amountPaid || 0,
            balanceDue: bill.balanceDue,
            status: bill.status,
            reference: bill.vendorRef || bill.reference || '',
        });
    });
    return rows.sort((left, right) => new Date(right.date) - new Date(left.date));
}

function csvCell(value) {
    const text = value instanceof Date ? value.toISOString() : value == null ? '' : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

function toCsv(rows) {
    if (!rows || rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];
    rows.forEach((row) => {
        lines.push(headers.map((header) => csvCell(row[header])).join(','));
    });
    return lines.join('\n');
}

module.exports = {
    PAYMENT_METHODS,
    RECURRENCE,
    toCents,
    fromCents,
    sumMoney,
    addMoney,
    subMoney,
    emptyMoney,
    addBucket,
    positiveAmountError,
    exceedsBalance,
    sameParty,
    normalizeCurrency,
    deriveInvoiceStatus,
    invoicePosition,
    deriveObligation,
    isOpenInvoice,
    isOverdueInvoice,
    unallocatedAmount,
    invoiceParty,
    matchClient,
    receivableRows,
    planAdvance,
    planAllocation,
    planTransfer,
    planAdjustment,
    planOpening,
    planExpenseDocument,
    planPartnerReimbursement,
    partnerPayableRows,
    spentInRange,
    spendBreakdown,
    statementFingerprint,
    matchStatementLine,
    duplicateSupplierName,
    categoryTotals,
    cashMovementRows,
    planVendorBill,
    planObligationPayment,
    planHistoricalLedger,
    planClientReceipt,
    buildReversal,
    accountBalance,
    inRange,
    rangeStart,
    rangeEnd,
    dateBounds,
    nextRecurrence,
    childFromSeries,
    postOnce,
    financeSummary,
    transactionRows,
    outstandingRows,
    expenseReportRows,
    attachmentError,
    toCsv,
};
