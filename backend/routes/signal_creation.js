const express = require('express');
const router = express.Router();
const { executePythonScript } = require('../services/pyodideService');

router.post('/create-signal', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'No code provided' });
    }

    try {
        const result = await executePythonScript(code, 'signal');
        res.json(result);
    } catch (error) {
        console.error("Pyodide Execution Error:", error);
        res.status(500).json({
            error: 'Execution Failed',
            details: error.message
        });
    }
});

module.exports = router;
