const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { spawn } = require('child_process');
const path = require('path');
const { initPyodide } = require('./services/pyodideService');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Eagerly load pyodide in the background on startup
initPyodide().catch(err => console.error("Failed to eagerly load Pyodide:", err));

// --- Start Python Execution Server Child Process ---
console.log("Starting Python execution server...");
const pythonServer = spawn('python', ['execution_server.py'], {
    cwd: path.join(__dirname), // Ensure it runs in the backend directory
    stdio: 'inherit' // Pipe python's stdout/stderr directly to this Node console
});

pythonServer.on('error', (err) => {
    console.error('Failed to start python execution server. Is python in your PATH?', err);
});

pythonServer.on('close', (code) => {
    console.log(`Python execution server has exited with code ${code}`);
});

// Ensure Python child is killed when Node exits
process.on('SIGINT', () => {
    console.log('\nShutting down Node server and Python execution server...');
    if (pythonServer) pythonServer.kill('SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down Node server and Python execution server...');
    if (pythonServer) pythonServer.kill('SIGTERM');
    process.exit(0);
});
// ----------------------------------------------------

app.use('/api/signals', require('./routes/signal_creation'));
app.use('/api/indicators', require('./routes/indicator_routes'));
app.use('/api/indicator-data', require('./routes/indicator_data'));
app.use('/api/analytics', require('./routes/analytics'));

app.get('/', (req, res) => {
    res.send('Backend is running!');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
