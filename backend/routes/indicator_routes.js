const express = require('express');
const router = express.Router();
const { executePythonScript } = require('../services/pyodideService');

router.post('/preview', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'No code provided' });
    }

    try {
        const result = await executePythonScript(code, 'indicator');
        res.json(result);
    } catch (error) {
        console.error("Pyodide Execution Error (Indicator):", error);
        res.status(500).json({
            error: 'Execution Failed',
            details: error.message
        });
    }
});

router.post('/save', async (req, res) => {
    const { code, name } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'No code provided' });
    }

    try {
        const result = await executePythonScript(code, 'save_indicator', name);
        res.json(result);
    } catch (error) {
        console.error("Pyodide Execution Error (Save Indicator):", error);
        res.status(500).json({
            error: 'Execution Failed',
            details: error.message
        });
    }
});

module.exports = router;
