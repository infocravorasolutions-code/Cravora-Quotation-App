const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const quotationsRouter = require('./routes/quotations');
const clientsRouter = require('./routes/clients');
const publicQuotationsRouter = require('./routes/publicQuotations');
const invoicesRouter = require('./routes/invoices');
const paymentsRouter = require('./routes/payments');
const receiptsRouter = require('./routes/receipts');
const auditLogsRouter = require('./routes/auditLogs');
const reportsRouter = require('./routes/reports');
const authRouter = require('./routes/auth');
const settingsRouter = require('./routes/settings');
const financeRouter = require('./routes/finance');
const { requireAuth } = require('./utils/auth');
const { safeMessage } = require('./utils/http');

const app = express();
const PORT = process.env.PORT || 5001;
const corsOriginEnv = process.env.CORS_ORIGIN;
const corsOrigin = !corsOriginEnv || corsOriginEnv === 'true'
    ? true
    : corsOriginEnv.split(',').map((value) => value.trim().replace(/\/+$/, ''));

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '25mb' }));

app.use('/api/auth', authRouter);
app.use('/api/public/quotations', publicQuotationsRouter);
app.use('/api/quotations', requireAuth, quotationsRouter);
app.use('/api/clients', requireAuth, clientsRouter);
app.use('/api/invoices', requireAuth, invoicesRouter);
app.use('/api/payments', requireAuth, paymentsRouter);
app.use('/api/receipts', requireAuth, receiptsRouter);
app.use('/api/audit-logs', requireAuth, auditLogsRouter);
app.use('/api/reports', requireAuth, reportsRouter);
app.use('/api/finance', requireAuth, financeRouter);
app.use('/api/settings', requireAuth, settingsRouter);

app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ message: safeMessage(err) });
});

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cravora_quotations';

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('MongoDB connection error:', err);
    });
