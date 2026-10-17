const mongoose = require('mongoose');

const ExpenseCategorySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, unique: true },
    kind: { type: String, enum: ['operating', 'vendor'], required: true },
}, { timestamps: true });

module.exports = mongoose.model('ExpenseCategory', ExpenseCategorySchema);
