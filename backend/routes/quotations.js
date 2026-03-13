const express = require('express');
const router = express.Router();
const Quotation = require('../models/Quotation');

// GET all quotations
router.get('/', async (req, res) => {
    try {
        const quotations = await Quotation.find().sort({ updatedAt: -1 });
        res.json(quotations);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET one quotation
router.get('/:id', async (req, res) => {
    try {
        const quotation = await Quotation.findOne({ quotationId: req.params.id });
        if (!quotation) {
            // Try by internal _id if quotationId fails, maybe
            const byMongoId = await Quotation.findById(req.params.id).catch(() => null);
            if (byMongoId) return res.json(byMongoId);

            return res.status(404).json({ message: 'Quotation not found' });
        }
        res.json(quotation);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// CREATE a quotation
router.post('/', async (req, res) => {
    // Check if quotationId is provided, if not generate one or return error
    const quotationInfo = req.body;

    if (!quotationInfo.quotationId) {
        return res.status(400).json({ message: 'quotationId is required' });
    }

    // Check if replacing an existing draft or creating new
    try {
        const existing = await Quotation.findOne({ quotationId: quotationInfo.quotationId });
        if (existing) {
            return res.status(400).json({ message: 'Quotation ID already exists (use PUT to update)' });
        }

        const quotation = new Quotation(quotationInfo);
        const savedQuotation = await quotation.save();
        res.status(201).json(savedQuotation);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// UPDATE a quotation
router.put('/:id', async (req, res) => {
    try {
        const updatedQuotation = await Quotation.findOneAndUpdate(
            { quotationId: req.params.id },
            req.body,
            { new: true, runValidators: true }
        );

        if (!updatedQuotation) {
            return res.status(404).json({ message: 'Quotation not found' });
        }

        res.json(updatedQuotation);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// DELETE a quotation
router.delete('/:id', async (req, res) => {
    try {
        const deletedQuotation = await Quotation.findOneAndDelete({ quotationId: req.params.id });
        if (!deletedQuotation) {
            return res.status(404).json({ message: 'Quotation not found' });
        }
        res.json({ message: 'Quotation deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
