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
        console.log(`Executing Python TLLM.py with prompt: ${prompt}`);

        const pythonProcess = spawn('python', [
            path.join(__dirname, '..', 'TLLM.py'),
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
                    error: 'AI Execution Failed',
                    details: errorData || `Process exited with code ${code}`
                });
            }

            try {
                const result = JSON.parse(outputData);

                // Construct the rich response including Terminal Logs
                let content = '';

                if (result.terminal_log) {
                    content += `### SYSTEM LOG (Diagnostics)\n\`\`\`text\n${result.terminal_log}\n\`\`\`\n\n`;
                }

                if (result.error && !result.code) {
                    content += `### ERROR\n${result.error}`;
                } else if (result.code) {
                    content += `### GENERATED CODE\n\`\`\`python\n${result.code}\n\`\`\``;
                } else {
                    content += `### SPECIFICATION\n${result.spec}`;
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
                res.status(500).json({
                    error: 'Data Parsing Error',
                    details: 'The AI returned an invalid response format.'
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
