const express = require('express');
const auth = require('./routes/auth');
const http = require('http');

const app = express();
app.use(express.json());
app.use('/api/auth', auth);

const server = app.listen(5001, () => {
    console.log("Test server running on port 5001...");
    
    const postData = JSON.stringify({
        username: 'admin',
        password: 'password'
    });

    const options = {
        hostname: '127.0.0.1',
        port: 5001,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length
        }
    };

    const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
            const data = JSON.parse(responseData);
            if (res.statusCode === 200 && data.token) {
                console.log("VERIFICATION SUCCESS: Token generated successfully.");
                server.close();
                process.exit(0);
            } else {
                console.error("VERIFICATION FAILED: Status " + res.statusCode, data);
                server.close();
                process.exit(1);
            }
        });
    });

    req.on('error', (e) => {
        console.error("Test Request Error:", e);
        server.close();
        process.exit(1);
    });

    req.write(postData);
    req.end();
});
