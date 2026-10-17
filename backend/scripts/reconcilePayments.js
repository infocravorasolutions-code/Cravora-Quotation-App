/**
 * Inserts missing ledger rows for historical invoice payments.
 *
 * Dry-run is the default. It only reads. Pass --apply to insert ledger rows.
 * The script never updates or deletes invoices, payments, receipts, or quotations.
 *
 *   node scripts/reconcilePayments.js
 *   node scripts/reconcilePayments.js --apply
 *   node scripts/reconcilePayments.js --apply --account <accountId>
 */
const mongoose = require('mongoose');
require('dotenv').config();
const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const LedgerEntry = require('../models/LedgerEntry');
const Account = require('../models/Account');
const { planHistoricalLedger, sumMoney } = require('../utils/finance');
const { nextDocumentNumber } = require('../utils/numbers');

function databaseName(uri) {
    try {
        const cleaned = String(uri).replace(/\/\/[^/]*@/, '//');
        const url = new URL(cleaned);
        return url.pathname.replace(/^\//, '').split('?')[0] || '(default)';
    } catch (error) {
        return '(unknown)';
    }
}

async function main() {
    if (process.argv.some((arg) => /drop|delete|reset/i.test(arg))) {
        console.error('This script only inserts missing ledger rows.');
        process.exit(1);
    }
    const apply = process.argv.includes('--apply');
    const accountFlag = process.argv.indexOf('--account');
    const accountId = accountFlag >= 0 ? process.argv[accountFlag + 1] : '';
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cravora_quotations';
    await mongoose.connect(uri);
    console.log(`${apply ? 'Apply' : 'Dry-run'} on database ${databaseName(uri)}`);

    let forcedAccount;
    if (accountId) {
        forcedAccount = await Account.findById(accountId).lean();
        if (!forcedAccount) {
            console.error('Account was not found. No rows were written.');
            process.exitCode = 1;
            return;
        }
    }

    const payments = await Payment.find({}).lean();
    const existing = await LedgerEntry.find({ kind: 'client_receipt', paymentId: { $ne: null } }).select('paymentId').lean();
    const invoices = await Invoice.find({}).select('invoiceNumber currency clientSnapshot').lean();
    const currencies = {};
    const parties = {};
    invoices.forEach((invoice) => {
        currencies[invoice.invoiceNumber] = invoice.currency || 'INR';
        parties[invoice.invoiceNumber] = (invoice.clientSnapshot && invoice.clientSnapshot.clientName) || '';
    });
    const planned = planHistoricalLedger(
        payments.map((payment) => ({
            ...payment,
            accountId: forcedAccount ? forcedAccount._id : payment.accountId,
            partyName: parties[payment.invoiceId] || '',
            notes: payment.notes || 'Reconciled from payment history',
        })),
        existing.map((row) => row.paymentId),
        currencies
    );

    console.log(`Recorded payments to link: ${planned.length}`);
    console.log(`Amount: ${sumMoney(planned.map((entry) => entry.amount))}`);
    if (!apply) {
        console.log('Dry-run only. Re-run with --apply to insert ledger rows. No documents were modified.');
        return;
    }

    let inserted = 0;
    for (const entry of planned) {
        const clash = await LedgerEntry.findOne({ idempotencyKey: entry.idempotencyKey }).select('_id').lean();
        if (clash) continue;
        const entryNumber = await nextDocumentNumber('LED', LedgerEntry, 'entryNumber');
        try {
            await LedgerEntry.create({ ...entry, entryNumber });
            inserted += 1;
        } catch (error) {
            if (error && error.code === 11000) continue;
            throw error;
        }
    }
    console.log(`Inserted ledger rows: ${inserted}`);
    console.log('Invoices, payments, and receipts were not modified.');
}

main()
    .catch((error) => {
        console.error(error && error.message ? error.message : 'Reconcile failed');
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect().catch(() => {});
    });
