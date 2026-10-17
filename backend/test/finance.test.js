const test = require('node:test');
const assert = require('node:assert/strict');
const finance = require('../utils/finance');
const { canPostFinance, requireFinance } = require('../utils/auth');

const now = new Date('2026-10-14T12:00:00.000Z');

function response() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

test('sums money in cents', () => {
    assert.equal(finance.sumMoney([0.1, 0.2]), 0.3);
    assert.equal(finance.addMoney(10.05, 0.1), 10.15);
    assert.equal(finance.exceedsBalance(finance.sumMoney([0.1, 0.2]), 0.3), false);
    assert.equal(finance.positiveAmountError(10.25), '');
    assert.equal(finance.positiveAmountError(1.005), 'Amount can have at most two decimal places');
    assert.equal(finance.positiveAmountError(0), 'Amount must be greater than zero');
});

test('partial payments, advances, and historical reconciliation stay consistent', () => {
    const invoice = {
        invoiceNumber: 'INV-2026-001',
        clientId: 'client-a',
        status: 'issued',
        grandTotal: 100,
        balanceDue: 100,
        amountPaid: 0,
        currency: 'INR',
        dueDate: '2026-10-20T00:00:00.000Z',
        issuedSnapshot: { grandTotal: 100 },
    };
    const payments = [
        { _id: 'p1', invoiceId: 'INV-2026-001', status: 'recorded', source: 'invoice', amount: 30, paymentDate: now, currency: 'INR' },
        { _id: 'p2', invoiceId: 'INV-2026-001', status: 'recorded', source: 'invoice', amount: 50, paymentDate: now, currency: 'INR' },
        { _id: 'p3', invoiceId: 'INV-2026-001', status: 'reversed', source: 'invoice', amount: 20, paymentDate: now, currency: 'INR' },
        { _id: 'p4', invoiceId: 'INV-2026-001', status: 'recorded', source: 'advance_allocation', amount: 10, paymentDate: now, currency: 'INR' },
    ];
    const settled = finance.invoicePosition(invoice, payments, now);
    assert.equal(settled.amountPaid, 90);
    assert.equal(settled.balanceDue, 10);
    assert.equal(settled.status, 'partially_paid');

    const overdue = finance.invoicePosition({ ...invoice, dueDate: '2026-10-13T00:00:00.000Z' }, [payments[0]], now);
    assert.equal(overdue.status, 'overdue');
    assert.equal(overdue.balanceDue, 70);

    const paid = finance.deriveInvoiceStatus({ status: 'issued', grandTotal: 100, amountPaid: 100, dueDate: invoice.dueDate, now });
    assert.deepEqual({ status: paid.status, balanceDue: paid.balanceDue }, { status: 'paid', balanceDue: 0 });
    const cancelled = finance.deriveInvoiceStatus({ status: 'cancelled', grandTotal: 100, amountPaid: 0, now });
    assert.equal(cancelled.status, 'cancelled');

    const ledgerPlan = finance.planHistoricalLedger(payments, []);
    assert.deepEqual(ledgerPlan.map((entry) => entry.paymentId), ['p1', 'p2']);
    assert.equal(finance.sumMoney(ledgerPlan.map((entry) => entry.amount)), 80);
    assert.equal(finance.planHistoricalLedger(payments, ['p1', 'p2']).length, 0);

    const advance = { _id: 'adv', kind: 'advance', amount: 40, clientId: 'client-a', currency: 'INR', reversedBy: null };
    const first = finance.planAllocation({
        advance,
        allocations: [],
        invoice: { ...invoice, balanceDue: 100, amountPaid: 0 },
        amount: 25,
    });
    assert.equal(first.error, undefined);
    assert.equal(first.payment.source, 'advance_allocation');
    assert.equal(first.ledger.affectsIncome, false);
    assert.equal(first.ledger.cashEffect, false);
    const second = finance.planAllocation({
        advance,
        allocations: [{ sourceEntryId: 'adv', status: 'posted', amount: 25 }],
        invoice: { ...invoice, balanceDue: 75, amountPaid: 25 },
        amount: 15,
    });
    assert.equal(second.error, undefined);
    const tooMuch = finance.planAllocation({
        advance,
        allocations: [{ sourceEntryId: 'adv', status: 'posted', amount: 25 }],
        invoice: { ...invoice, balanceDue: 75 },
        amount: 16,
    });
    assert.equal(tooMuch.error, 'Amount exceeds the unallocated advance');
    const reversedOnly = finance.planAllocation({
        advance,
        allocations: [{ sourceEntryId: 'adv', status: 'reversed', amount: 40 }],
        invoice,
        amount: 40,
    });
    assert.equal(reversedOnly.error, undefined);
});

test('rejects cross-client and cross-vendor allocation', () => {
    const advance = { _id: 'adv', kind: 'advance', amount: 50, clientId: 'client-a', currency: 'INR' };
    const other = finance.planAllocation({
        advance,
        allocations: [],
        invoice: {
            invoiceNumber: 'INV-1',
            clientId: 'client-b',
            status: 'issued',
            issuedSnapshot: {},
            balanceDue: 50,
            currency: 'INR',
        },
        amount: 10,
    });
    assert.equal(other.error, 'This receipt cannot be applied to another client');
    const unlinked = finance.planAllocation({
        advance,
        allocations: [],
        invoice: {
            invoiceNumber: 'INV-2',
            status: 'issued',
            issuedSnapshot: {},
            balanceDue: 50,
            currency: 'INR',
        },
        amount: 10,
    });
    assert.equal(unlinked.error, 'This receipt cannot be applied to another client');

    const bill = { _id: 'bill', vendorId: 'vendor-a', currency: 'INR', balanceDue: 80, amount: 80, status: 'open', vendorName: 'A' };
    const account = { _id: 'bank', currency: 'INR', isActive: true };
    const wrongVendor = finance.planObligationPayment({
        kind: 'vendor_payment',
        document: bill,
        amount: 30,
        account,
        vendorId: 'vendor-b',
    });
    assert.equal(wrongVendor.error, 'This payment cannot be applied to another vendor');
    const partial = finance.planObligationPayment({
        kind: 'vendor_payment',
        document: bill,
        amount: 30,
        account,
        vendorId: 'vendor-a',
    });
    assert.equal(partial.amount, 30);
    assert.equal(partial.ledger.affectsExpense, true);
    assert.equal(partial.ledger.affectsIncome, false);
    const position = finance.deriveObligation({ amount: 80, amountPaid: 30, voided: false });
    assert.equal(position.status, 'partially_paid');
    assert.equal(position.balanceDue, 50);
});

test('transfers and adjustments do not count as income or expense', () => {
    const cash = { _id: 'cash', name: 'Cash', type: 'cash', currency: 'INR', isActive: true };
    const bank = { _id: 'bank', name: 'Bank', type: 'bank', currency: 'INR', isActive: true };
    const opening = finance.planOpening({ amount: 500, account: cash });
    const transfer = finance.planTransfer({ amount: 200, fromAccount: cash, toAccount: bank });
    assert.equal(transfer.entry.affectsIncome, false);
    assert.equal(transfer.entry.affectsExpense, false);
    const reversal = finance.buildReversal({ ...transfer.entry, _id: 'tr' });
    const ledger = [
        { ...opening.entry, postedAt: now },
        { ...transfer.entry, _id: 'tr', postedAt: now, affectsIncome: true },
        reversal.reversal,
    ];
    assert.equal(finance.accountBalance(ledger, 'cash'), 500);
    assert.equal(finance.accountBalance(ledger, 'bank'), 0);

    const summary = finance.financeSummary({
        invoices: [{ status: 'issued', balanceDue: 100, currency: 'INR', dueDate: '2026-10-01', invoiceNumber: 'INV-1' }],
        payments: [{ _id: 'p1', status: 'recorded', source: 'invoice', amount: 30, currency: 'INR', paymentDate: now }],
        ledger: [
            ...ledger,
            { _id: 'adv', kind: 'advance', amount: 40, currency: 'INR', postedAt: now, affectsIncome: true, clientId: 'c' },
            { kind: 'advance', amount: 15, currency: 'INR', postedAt: now, reversedBy: 'x' },
        ],
        expenses: [
            { _id: 'e1', status: 'open', balanceDue: 20, amount: 20, currency: 'INR', dueDate: '2026-10-20', description: 'Hosting' },
            { _id: 'e2', status: 'open', balanceDue: 99, amount: 99, currency: 'INR', dueDate: '2026-12-01', description: 'Later' },
        ],
        vendorBills: [{ _id: 'b1', status: 'partially_paid', balanceDue: 30, amount: 80, currency: 'USD', dueDate: '2026-10-18', vendorName: 'Host', billNumber: 'VBL-1' }],
        accounts: [cash, bank],
        now,
        from: '2026-10-01',
        to: '2026-10-14',
    });
    assert.equal(summary.receivables.INR, 100);
    assert.equal(summary.overdue.INR, 100);
    assert.equal(summary.moneyReceived.INR, 70);
    assert.equal(summary.unpaidExpenses.INR, 119);
    assert.equal(summary.vendorPayables.USD, 30);
    assert.equal(summary.upcomingTotal.INR, 20);
    assert.equal(summary.upcomingTotal.USD, 30);
    assert.equal(summary.accounts.find((account) => account._id === 'cash').balance, 500);
});

test('duplicate submissions return the original record', () => {
    const first = finance.postOnce([], 'key-1', () => ({ amount: 25 }));
    const second = finance.postOnce(first.records, 'key-1', () => ({ amount: 80 }));
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.record.amount, 25);
    assert.equal(second.records.length, 1);
});

test('transaction report lists a historical payment once and excludes transfers from income', () => {
    const rows = finance.transactionRows({
        ledger: [
            { _id: 'led-1', paymentId: 'p1', kind: 'client_receipt', amount: 30, postedAt: now, direction: 'in', affectsIncome: true, currency: 'INR' },
            { _id: 'tr', kind: 'transfer', amount: 999, postedAt: now, direction: 'transfer', affectsIncome: true, affectsExpense: true, currency: 'INR', accountId: 'cash', counterAccountId: 'bank' },
            { _id: 'rev', kind: 'reversal', amount: 30, postedAt: now, direction: 'out', affectsIncome: false, reversalOf: 'led-2', currency: 'INR' },
        ],
        payments: [
            { _id: 'p1', status: 'recorded', amount: 30, paymentDate: now, currency: 'INR' },
            { _id: 'p2', status: 'recorded', amount: 12, paymentDate: '2026-10-10', currency: 'INR', transactionReference: 'UTR' },
            { _id: 'p3', status: 'recorded', source: 'advance_allocation', amount: 99, paymentDate: now, currency: 'INR' },
        ],
    });
    const income = finance.sumMoney(rows.filter((row) => row.income).map((row) => row.amount));
    assert.equal(income, 42);
    assert.equal(rows.filter((row) => row.sourceId === 'p1').length, 1);
    assert.equal(rows.some((row) => row.kind === 'transfer' && row.income), false);
    assert.equal(rows.some((row) => row.sourceId === 'p3'), false);
});

test('outstanding and expense reports ignore drafts, cancellations, and transfers', () => {
    const outstanding = finance.outstandingRows([
        { invoiceNumber: 'A', status: 'draft', balanceDue: 10, currency: 'INR' },
        { invoiceNumber: 'B', status: 'cancelled', balanceDue: 10, currency: 'INR' },
        { invoiceNumber: 'C', status: 'paid', balanceDue: 0, currency: 'INR' },
        { invoiceNumber: 'D', status: 'issued', balanceDue: 40, currency: 'INR', dueDate: '2026-10-01', clientSnapshot: { clientName: 'North' }, grandTotal: 40, amountPaid: 0 },
    ], { now });
    assert.deepEqual(outstanding.map((row) => row.invoiceNumber), ['D']);
    assert.equal(outstanding[0].status, 'overdue');
    assert.equal(outstanding[0].party, 'North');

    const expenses = finance.expenseReportRows({
        expenses: [{ expenseNumber: 'EXP-1', expenseDate: '2026-10-02', amount: 10, balanceDue: 10, status: 'open', currency: 'INR', description: 'Tea' }],
        vendorBills: [{ billNumber: 'VBL-1', billDate: '2026-10-03', amount: 20, balanceDue: 5, amountPaid: 15, status: 'partially_paid', currency: 'INR', description: 'Paper', vendorName: 'Shop' }],
    });
    assert.equal(expenses.length, 2);
    assert.equal(expenses.some((row) => row.type === 'transfer'), false);
});

test('recurring schedules move month-end dates forward once', () => {
    const next = finance.nextRecurrence(new Date('2026-01-31T00:00:00.000Z'), 'monthly');
    assert.equal(next.getMonth(), 1);
    assert.equal(next.getDate(), 28);
    const due = finance.childFromSeries({
        _id: 'exp-1',
        status: 'open',
        recurrence: 'monthly',
        nextRunAt: '2026-10-01T00:00:00.000Z',
        amount: 50,
        currency: 'INR',
        description: 'Rent',
    }, now, 'expense');
    assert.equal(due.child.balanceDue, 50);
    assert.equal(due.child.amountPaid, 0);
    assert.equal(due.child.recurrence, 'none');
    assert.equal(due.child.idempotencyKey, 'recur:exp-1:2026-10-01');
    const early = finance.childFromSeries({
        _id: 'exp-1',
        status: 'open',
        recurrence: 'monthly',
        nextRunAt: '2026-11-01T00:00:00.000Z',
        amount: 50,
    }, now);
    assert.equal(early.error, 'The next occurrence is not due');
});

test('date filters include the selected end date and csv escapes commas', () => {
    assert.equal(finance.inRange('2026-10-14T18:00:00.000Z', '2026-10-14', '2026-10-14'), true);
    assert.equal(finance.inRange('2026-10-15T00:00:00.000Z', '2026-10-14', '2026-10-14'), false);
    assert.equal(finance.toCsv([{ name: 'A, B', amount: 1 }]), 'name,amount\n"A, B",1');
});

test('receivables keep advances on the client and do not allocate across companies', () => {
    const rows = finance.receivableRows({
        invoices: [
            { invoiceNumber: 'INV-1', clientId: 'client-a', status: 'issued', balanceDue: 100, currency: 'INR', dueDate: '2026-10-01', issuedSnapshot: {} },
            { invoiceNumber: 'INV-2', status: 'issued', balanceDue: 15, currency: 'INR', clientSnapshot: { clientName: 'Loose', clientEmail: 'a@example.com' } },
        ],
        clients: [{ _id: 'client-a', companyName: 'Acme', email: 'a@example.com' }],
        advances: [{ _id: 'adv', kind: 'advance', clientId: 'client-a', amount: 25, currency: 'INR', partyName: 'Acme' }],
        allocations: [],
        now,
    });
    const acme = rows.find((row) => row.clientId === 'client-a');
    assert.equal(acme.outstanding.INR, 115);
    assert.equal(acme.advance.INR, 25);
    assert.equal(acme.allocatable, 1);
});

test('role permissions block viewers from posting', () => {
    assert.equal(financePost('admin'), true);
    assert.equal(financePost('accounts'), true);
    assert.equal(financePost('viewer'), false);
    assert.equal(canPostFinance('viewer'), false);

    const viewer = response();
    let called = false;
    requireFinance({ auth: { role: 'viewer' } }, viewer, () => { called = true; });
    assert.equal(viewer.statusCode, 403);
    assert.equal(called, false);

    const admin = response();
    let nextCalled = false;
    requireFinance({ auth: { role: 'admin' } }, admin, () => { nextCalled = true; });
    assert.equal(nextCalled, true);

    const accounts = response();
    let accountsCalled = false;
    requireFinance({ auth: { role: 'accounts' } }, accounts, () => { accountsCalled = true; });
    assert.equal(accountsCalled, true);
});

function financePost(role) {
    return canPostFinance(role);
}

test('supplier names reject a second copy with different letter case', () => {
    const vendors = [{ name: 'Kotak Supplies' }];
    assert.equal(finance.duplicateSupplierName(vendors, '  kotak supplies '), true);
    assert.equal(finance.duplicateSupplierName(vendors, 'Other Supplies'), false);
    assert.equal(finance.duplicateSupplierName(vendors, ''), false);
});

test('partner reimbursement leaves a remainder and is not a second expense', () => {
    const expense = {
        status: 'paid',
        paymentSource: 'partner_personal',
        amount: 100,
        reimbursedAmount: 40,
        currency: 'INR',
        _id: 'expense-1',
        paidByName: 'partner@example.com',
    };
    const account = { _id: 'account-1', currency: 'INR', isActive: true };
    const plan = finance.planPartnerReimbursement({ expense, amount: 30, account });
    assert.equal(plan.remaining, 30);
    assert.equal(plan.ledger.kind, 'partner_reimbursement');
    assert.equal(plan.ledger.affectsExpense, false);
    assert.equal(plan.ledger.cashEffect, true);
    const over = finance.planPartnerReimbursement({ expense, amount: 70, account });
    assert.equal(over.error, 'Reimbursement exceeds the amount owed to the partner');
    const rows = finance.partnerPayableRows([expense]);
    assert.equal(rows[0].INR, 60);
});

test('pdf statement text becomes debit and credit rows', () => {
    const { pdfTextToTable } = require('../utils/statementPdf');
    const slash = pdfTextToTable([
        'Account Statement',
        '01/10/2026 UPI/merchant/ABC123 1,000.00 49,000.00',
        '02/10/2026 NEFT CR ACME CORP UTR998877 5,000.00 54,000.00',
    ].join('\n'));
    assert.equal(slash[1][0], '01/10/2026');
    assert.equal(slash[1][3], '1000');
    assert.equal(slash[2][4], '5000');

    const kotak = pdfTextToTable([
        'Savings Account Transactions',
        '#DateDescriptionChq/Ref. No.Withdrawal (Dr.)Deposit (Cr.)Balance',
        '--Opening Balance---20.68',
        '112 Aug 2026UPI/Mr PANKAJ Payment from UPI-62242801972635.0055.68',
        '212 Aug 2026UPI/EVOLUTION ENGI UPI-62245194869450.00105.68',
        '313 Aug 2026Recd:IMPS/622616245219/ROPPENTRAN IMPS-62261617432871.04176.72',
        '414 Aug 2026NEFT AXODH22655242198 CRAVORA SOLUTIONS NEFTINW-168363491529,600.0029,776.72',
    ].join('\n'));
    assert.equal(kotak.length, 5);
    assert.equal(kotak[1][0], '12/08/2026');
    assert.equal(kotak[1][4], '35');
    assert.equal(kotak[1][5], '55.68');
    assert.equal(kotak[2][4], '50');
    assert.equal(kotak[3][4], '71.04');
    assert.equal(kotak[4][4], '29600');
    assert.equal(kotak[4][5], '29776.72');
    assert.ok(String(kotak[1][1]).includes('PANKAJ'));
});

test('statement lines match once and flag a second copy', () => {
    const line = { accountId: 'acc', postedAt: '2026-10-01', amount: 50, direction: 'out', reference: 'UTR1' };
    const entry = { _id: 'led-1', accountId: 'acc', postedAt: '2026-10-01T00:00:00.000Z', amount: 50, direction: 'out', reference: 'UTR1', cashEffect: true };
    assert.equal(finance.matchStatementLine(line, [entry]).status, 'matched');
    assert.equal(finance.matchStatementLine(line, [entry, { ...entry, _id: 'led-2' }]).status, 'potential_duplicate');
    assert.equal(finance.statementFingerprint(line), finance.statementFingerprint({ ...line, description: 'A different narration' }));
});

test('spend breakdown splits company and partner expenses', () => {
    const breakdown = finance.spendBreakdown([
        { status: 'paid', expenseDate: '2026-10-02', amount: 100, currency: 'INR', paymentSource: 'company_bank', categoryName: 'Rent' },
        { status: 'paid', expenseDate: '2026-10-05', amount: 40, currency: 'INR', paymentSource: 'partner_personal', paidByName: 'Asha', categoryName: 'Travel' },
        { status: 'paid', expenseDate: '2026-10-08', amount: 20, currency: 'INR', paymentSource: 'partner_personal', paidByName: 'Asha', categoryName: 'Travel' },
        { status: 'void', expenseDate: '2026-10-09', amount: 99, currency: 'INR', paymentSource: 'company_bank', categoryName: 'Rent' },
        { status: 'paid', expenseDate: '2026-09-01', amount: 500, currency: 'INR', paymentSource: 'company_bank', categoryName: 'Rent' },
    ], '2026-10-01', '2026-10-31');
    assert.equal(breakdown.company.INR, 100);
    assert.equal(breakdown.partner.INR, 60);
    assert.equal(breakdown.byPartner[0].name, 'Asha');
    assert.equal(breakdown.byPartner[0].INR, 60);
    assert.equal(breakdown.byMonth.length, 1);
    assert.equal(breakdown.byMonth[0].company.INR, 100);
});

test('spent totals exclude transfers and partner reimbursements', () => {
    const spent = finance.spentInRange([
        { kind: 'expense_payment', amount: 20, currency: 'INR', postedAt: '2026-10-02' },
        { kind: 'transfer', amount: 100, currency: 'INR', postedAt: '2026-10-02' },
        { kind: 'partner_reimbursement', amount: 15, currency: 'INR', postedAt: '2026-10-02' },
        { kind: 'vendor_payment', amount: 5, currency: 'USD', postedAt: '2026-10-03' },
        { kind: 'expense_payment', amount: 8, currency: 'INR', postedAt: '2026-10-04', reversedBy: 'rev-1' },
    ], '2026-10-01', '2026-10-31');
    assert.equal(spent.INR, 20);
    assert.equal(spent.USD, 5);
    const movement = finance.cashMovementRows([
        { kind: 'transfer', amount: 100, currency: 'INR', postedAt: '2026-10-02' },
        { kind: 'expense_payment', amount: 20, currency: 'INR', postedAt: '2026-10-02' },
    ]);
    assert.equal(movement.find((row) => row.movement === 'Transfers').INR, 100);
    assert.equal(movement.find((row) => row.movement === 'Spent').INR, 20);
});
