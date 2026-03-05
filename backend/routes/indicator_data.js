const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const dataFilePath = path.join(__dirname, '../data/saved_indicators.json');

// Ensure data directory and file exists
if (!fs.existsSync(path.dirname(dataFilePath))) {
    fs.mkdirSync(path.dirname(dataFilePath), { recursive: true });
}
if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, JSON.stringify([]));
}

// GET all saved indicators
router.get('/', (req, res) => {
    try {
        const data = fs.readFileSync(dataFilePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error("Error reading saved indicators:", error);
        res.status(500).json({ error: 'Failed to read saved indicators' });
    }
});

// POST a new indicator
router.post('/', (req, res) => {
    try {
        const { name, code } = req.body;

        if (!name || !code) {
            return res.status(400).json({ error: 'Name and code are required' });
        }

        const data = fs.readFileSync(dataFilePath, 'utf8');
        const indicators = JSON.parse(data);

        const newIndicator = {
            id: Date.now().toString(),
            name,
            code,
            createdAt: new Date().toISOString()
        };

        indicators.push(newIndicator);

        fs.writeFileSync(dataFilePath, JSON.stringify(indicators, null, 2));

        res.status(201).json(newIndicator);
    } catch (error) {
        console.error("Error saving indicator:", error);
        res.status(500).json({ error: 'Failed to save indicator' });
    }
});

// DELETE an indicator
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const data = fs.readFileSync(dataFilePath, 'utf8');
        let indicators = JSON.parse(data);

        const initialLength = indicators.length;
        indicators = indicators.filter(ind => ind.id !== id);

        if (indicators.length === initialLength) {
            return res.status(404).json({ error: 'Indicator not found' });
        }

        fs.writeFileSync(dataFilePath, JSON.stringify(indicators, null, 2));
        res.json({ message: 'Indicator deleted successfully' });

    } catch (error) {
        console.error("Error deleting indicator:", error);
        res.status(500).json({ error: 'Failed to delete indicator' });
    }
});

module.exports = router;
