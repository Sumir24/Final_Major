const axios = require('axios');

/**
 * Execute a Python script by sending it to the local Python microservice.
 * @param {string} code - The Python script sent from frontend
 * @param {string} executionType - 'signal' | 'indicator' | 'save_indicator'
 * @param {string} fileName - Optional custom filename for exports
 * @returns {object} JSON structured result of trades/indicators
 */
async function executePythonScript(code, executionType, fileName = null) {
    try {
        const response = await axios.post('http://127.0.0.1:8000/execute', {
            code: code,
            executionType: executionType,
            fileName: fileName
        });

        const data = response.data;

        // The python server returns a JSON dictionary. 
        // If an explicit Error object comes back, throw it
        if (data.error) {
            throw new Error(data.error);
        }

        return data;
    } catch (error) {
        // If the python server is down or throws a 500 error, handle it cleanly
        if (error.response) {
            throw new Error("Python Server Error: " + JSON.stringify(error.response.data));
        } else if (error.request) {
            throw new Error("Could not connect to the Python execution microservice. Ensure it is running on port 8000.");
        } else {
            throw error;
        }
    }
}

// Ensure backward compatibility of the exports object in case it was used elsewhere
module.exports = { executePythonScript, initPyodide: async () => { } };
