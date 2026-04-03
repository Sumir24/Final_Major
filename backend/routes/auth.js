const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const usersFilePath = path.join(__dirname, '../data/users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key_123';

/**
 * POST /api/auth/login
 * Verifies user credentials and returns a JWT
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Read users from local data store
        if (!fs.existsSync(usersFilePath)) {
            return res.status(500).json({ error: 'User data store is missing.' });
        }

        const data = fs.readFileSync(usersFilePath, 'utf8');
        const users = JSON.parse(data);

        // Find user
        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Verify password
        const isMatch = (password === user.password); // In production, use bcrypt.compare(password, user.password)
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Auth Login Error:", error);
        res.status(500).json({ error: 'Internal server failure during login' });
    }
});

/**
 * POST /api/auth/register
 * Registers a new user and saves to local data store
 */
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Read existing users
        let users = [];
        if (fs.existsSync(usersFilePath)) {
            const data = fs.readFileSync(usersFilePath, 'utf8');
            users = JSON.parse(data);
        }

        // Check if user already exists
        const existingUser = users.find(u => u.username === username);
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Create new user object
        const newUser = {
            id: (users.length + 1).toString(),
            username,
            password, // Storing as plain text per user request
            role: 'user'
        };

        // Add to list and save
        users.push(newUser);
        fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: newUser.id,
                username: newUser.username,
                role: newUser.role
            }
        });

    } catch (error) {
        console.error("Auth Register Error:", error);
        res.status(500).json({ error: 'Internal server failure during registration' });
    }
});

module.exports = router;
