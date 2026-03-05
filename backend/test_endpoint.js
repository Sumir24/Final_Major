const fs = require('fs');
const http = require('http');

const payload = JSON.stringify({
    code: `
import pandas as pd
import numpy as np
import sys

# 1. Prepare Data
df['Datetime'] = pd.to_datetime(df['Date'].astype(str), format='%Y%m%d%H%M%S')

print("First few Volumes:", df['Volume'].head().tolist())

# 2. Calculate Custom Indicator
volume_period = 20
df['Vol_SMA'] = df['Volume'].rolling(volume_period).mean()
print("First few Vol_SMA:", df['Vol_SMA'].iloc[20:25].tolist())

df['Vol_Strength'] = df['Volume'] / df['Vol_SMA']
print("First few Vol_Strength:", df['Vol_Strength'].iloc[20:25].tolist())

indicators = []
`
});

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/indicators/preview',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length
    }
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log(data);
    });
});

req.on('error', (e) => {
    console.error(e);
});

req.write(payload);
req.end();
