const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');

router.post('/', async (req, res) => {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid messages format' });
    }

    const lastMessage = messages[messages.length - 1];
    const prompt = lastMessage.content;

    try {
        console.log(`Executing Python STRAT.py with prompt: ${prompt}`);

        const pythonProcess = spawn('python', [
            path.join(__dirname, '..', 'STRAT.py'),
            '--json',
            prompt
        ]);

        let outputData = '';
        let errorData = '';

        pythonProcess.stdout.on('data', (data) => {
            outputData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            errorData += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`Python process exited with code ${code}`);
                return res.status(500).json({
                    error: 'Strategy Generation Failed',
                    details: errorData || `Process exited with code ${code}`
                });
            }

            try {
                // Remove any leading/trailing non-json characters if any
                const firstBrace = outputData.indexOf('{');
                const lastBrace = outputData.lastIndexOf('}');
                if (firstBrace === -1 || lastBrace === -1) {
                    throw new Error("No JSON found in output");
                }
                const jsonStr = outputData.substring(firstBrace, lastBrace + 1);
                const result = JSON.parse(jsonStr);

                // Construct a response (compatible with chat UI)
                let content = '';

                if (result.terminal_log) {
                    content += `### STRATEGY LOG (Diagnostics)\n\`\`\`text\n${result.terminal_log}\n\`\`\`\n\n`;
                }

                if (result.error && !result.code) {
                     content += `### ERROR\n${result.error}`;
                } else if (result.code) {
                    content += `### GENERATED STRATEGY CODE\n\`\`\`python\n${result.code}\n\`\`\``;
                } else if (result.spec) {
                    content += `### STRATEGY SPECIFICATION\n${result.spec}`;
                } else {
                    content += `### NO OUTPUT\nThe generator did not return a strategy.`;
                }

                const response = {
                    choices: [
                        {
                            message: {
                                role: 'assistant',
                                content: content
                            }
                        }
                    ]
                };

                res.json(response);
            } catch (parseError) {
                console.error("Failed to parse Python output:", parseError);
                console.error("Raw Output:", outputData);
                res.status(500).json({
                    error: 'Data Parsing Error',
                    details: 'The strategy builder returned an invalid response format.',
                    raw: outputData
                });
            }
        });

    } catch (error) {
        console.error("Spawn Error:", error.message);
        res.status(500).json({
            error: 'Server Error',
            details: error.message
        });
    }
});

module.exports = router;
