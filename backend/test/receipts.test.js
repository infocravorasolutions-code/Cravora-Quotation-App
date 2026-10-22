const test = require('node:test');
const assert = require('node:assert/strict');
const { round2 } = require('../utils/totals');

function calculateReceiptValues({ payment, invoice, allPayments }) {
    const thisPayment = round2(payment.amount || 0);
    const invoiceTotal = round2(invoice.grandTotal || 0);
    const validPayments = (allPayments || []).filter(
        (p) => p.status === 'recorded' && p.invoiceId === invoice.invoiceNumber
    );
    const totalPaid = round2(validPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0));
    const balanceDue = round2(Math.max(0, invoiceTotal - totalPaid));
    return {
        invoiceTotal,
        thisPayment,
        amountPaid: totalPaid,
        balanceDue,
    };
}

test('calculates correct receipt figures for current user scenario (INV-2026-001, RCP-2026-001)', () => {
    const invoice = {
        invoiceNumber: 'INV-2026-001',
        grandTotal: 30000,
        currency: 'INR',
    };
    const payment = {
        _id: 'pay-1',
        invoiceId: 'INV-2026-001',
        amount: 20000,
        status: 'recorded',
    };
    const allPayments = [payment];

    const result = calculateReceiptValues({ payment, invoice, allPayments });

    assert.equal(result.invoiceTotal, 30000);
    assert.equal(result.thisPayment, 20000);
    assert.equal(result.amountPaid, 20000);
    assert.equal(result.balanceDue, 10000);
});

test('multi-payment scenario includes all previous transactions exactly once without duplicate counting', () => {
    const invoice = {
        invoiceNumber: 'INV-2026-001',
        grandTotal: 30000,
        currency: 'INR',
    };
    const payment1 = {
        _id: 'pay-1',
        invoiceId: 'INV-2026-001',
        amount: 10000,
        status: 'recorded',
    };
    const payment2 = {
        _id: 'pay-2',
        invoiceId: 'INV-2026-001',
        amount: 10000,
        status: 'recorded',
    };
    const allPayments = [payment1, payment2];

    const receipt1 = calculateReceiptValues({ payment: payment1, invoice, allPayments });
    assert.equal(receipt1.invoiceTotal, 30000);
    assert.equal(receipt1.thisPayment, 10000); // This specific payment
    assert.equal(receipt1.amountPaid, 20000);  // Cumulative received across all successful transactions
    assert.equal(receipt1.balanceDue, 10000);  // invoiceTotal - amountPaid

    const receipt2 = calculateReceiptValues({ payment: payment2, invoice, allPayments });
    assert.equal(receipt2.invoiceTotal, 30000);
    assert.equal(receipt2.thisPayment, 10000); // This specific payment
    assert.equal(receipt2.amountPaid, 20000);  // Cumulative received
    assert.equal(receipt2.balanceDue, 10000);
});

test('excludes reversed or cancelled payments from cumulative total paid', () => {
    const invoice = {
        invoiceNumber: 'INV-2026-001',
        grandTotal: 30000,
        currency: 'INR',
    };
    const payment1 = {
        _id: 'pay-1',
        invoiceId: 'INV-2026-001',
        amount: 20000,
        status: 'recorded',
    };
    const reversedPayment = {
        _id: 'pay-reversed',
        invoiceId: 'INV-2026-001',
        amount: 10000,
        status: 'reversed',
    };
    const allPayments = [payment1, reversedPayment];

    const result = calculateReceiptValues({ payment: payment1, invoice, allPayments });
    assert.equal(result.thisPayment, 20000);
    assert.equal(result.amountPaid, 20000);
    assert.equal(result.balanceDue, 10000);
});

test('balance due cannot be negative even if payments exceed grand total', () => {
    const invoice = {
        invoiceNumber: 'INV-2026-001',
        grandTotal: 30000,
        currency: 'INR',
    };
    const payment = {
        _id: 'pay-1',
        invoiceId: 'INV-2026-001',
        amount: 35000,
        status: 'recorded',
    };
    const allPayments = [payment];

    const result = calculateReceiptValues({ payment, invoice, allPayments });
    assert.equal(result.invoiceTotal, 30000);
    assert.equal(result.thisPayment, 35000);
    assert.equal(result.amountPaid, 35000);
    assert.equal(result.balanceDue, 0); // Not negative
});
