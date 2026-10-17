const mongoose = require('mongoose');

let supportsTransactions;

async function transactionsSupported() {
    if (supportsTransactions != null) return supportsTransactions;
    try {
        const hello = await mongoose.connection.db.admin().command({ hello: 1 });
        supportsTransactions = Boolean(hello.setName || hello.msg === 'isdbgrid');
    } catch (error) {
        supportsTransactions = false;
    }
    return supportsTransactions;
}

function transactionUnavailable(error) {
    const message = String((error && error.message) || '');
    return /replica set|Transaction numbers are only allowed|mongos/i.test(message);
}

async function runTransaction(work) {
    const session = await mongoose.startSession();
    try {
        if (!(await transactionsSupported())) return await work(session);
        let value;
        await session.withTransaction(async () => {
            value = await work(session);
        });
        return value;
    } catch (error) {
        if (transactionUnavailable(error)) {
            supportsTransactions = false;
            const wrapped = new Error('Account changes need a MongoDB replica set so the books stay in balance');
            wrapped.status = 503;
            throw wrapped;
        }
        throw error;
    } finally {
        await session.endSession();
    }
}

module.exports = { runTransaction, transactionsSupported };
