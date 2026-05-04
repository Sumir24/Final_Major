const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config();

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

        console.log(`Login attempt for username: "${username}"`);
        
        // Find user in MongoDB
        const user = await User.findOne({ username: username.trim() });
        
        if (!user) {
            console.log(`User not found: "${username}"`);
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Verify password using the method defined in the User model
        const isMatch = await user.comparePassword(password.trim());
        console.log(`Checking password for "${username}": ${isMatch ? 'Match' : 'No Match'}`);
        
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
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
 * Registers a new user and saves to MongoDB
 */
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Check if user already exists in MongoDB
        const existingUser = await User.findOne({ username: username.trim() });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Create new user object
        // The password will be automatically hashed by the pre-save hook in User.js
        const newUser = new User({
            username: username.trim(),
            password: password.trim(),
            role: 'user'
        });

        // Save to MongoDB
        await newUser.save();

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                id: newUser._id,
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
