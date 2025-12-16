// ============================================================
// PILOT TRADERS AI COPILOT - Auth Routes
// ============================================================
// Login, register, and user info endpoints
// ============================================================

const express = require('express');
const router = express.Router();
const {
    createUser,
    findUserByEmail,
    verifyPassword,
    getTodayUsageCount
} = require('../database');
const { generateToken, requireAuth } = require('../middleware/auth');

/**
 * POST /auth/login
 * Login with email and password
 */
router.post('/login', (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password required'
            });
        }

        const user = findUserByEmail(email.toLowerCase().trim());
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        if (!verifyPassword(user, password)) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Check user status
        if (user.status === 'pending') {
            return res.status(403).json({
                success: false,
                error: 'Account pending approval. Please wait for admin activation.'
            });
        }

        if (user.status === 'deactivated') {
            return res.status(403).json({
                success: false,
                error: 'Account has been deactivated. Please contact admin.'
            });
        }

        if (user.status === 'paused') {
            return res.status(403).json({
                success: false,
                error: 'Account is paused. Please contact admin.'
            });
        }

        // Generate token
        const token = generateToken(user);
        const todayUsage = getTodayUsageCount(user.id);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                isAdmin: user.is_admin === 1,
                isPaid: user.is_paid === 1,
                dailyLimit: user.daily_limit,
                todayUsage: todayUsage,
                remaining: user.daily_limit - todayUsage
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during login'
        });
    }
});

/**
 * POST /auth/register
 * Register new user (will be pending until admin approves)
 */
router.post('/register', (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({
                success: false,
                error: 'Email, password, and name required'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 6 characters'
            });
        }

        const result = createUser(
            email.toLowerCase().trim(),
            password,
            name.trim()
        );

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }

        res.json({
            success: true,
            message: 'Registration successful! Please wait for admin approval.',
            userId: result.userId
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during registration'
        });
    }
});

/**
 * GET /auth/me
 * Get current user info
 */
router.get('/me', requireAuth, (req, res) => {
    try {
        const todayUsage = getTodayUsageCount(req.user.id);

        res.json({
            success: true,
            user: {
                id: req.user.id,
                email: req.user.email,
                name: req.user.name,
                isAdmin: req.user.is_admin === 1,
                isPaid: req.user.is_paid === 1,
                status: req.user.status,
                dailyLimit: req.user.daily_limit,
                todayUsage: todayUsage,
                remaining: req.user.daily_limit - todayUsage
            }
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
});

/**
 * POST /auth/verify
 * Verify if token is still valid
 */
router.post('/verify', requireAuth, (req, res) => {
    res.json({
        success: true,
        valid: true,
        user: {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            isAdmin: req.user.is_admin === 1
        }
    });
});

module.exports = router;
