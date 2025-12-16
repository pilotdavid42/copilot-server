// ============================================================
// PILOT TRADERS AI COPILOT - Auth Middleware
// ============================================================
// JWT authentication middleware for protecting routes
// ============================================================

const jwt = require('jsonwebtoken');
const { findUserById } = require('../database');

// JWT secret - should be in environment variable in production
const JWT_SECRET = process.env.JWT_SECRET || 'pilot-traders-copilot-secret-key-2024';
const JWT_EXPIRES_IN = '7d'; // Token expires in 7 days

/**
 * Generate JWT token for user
 */
function generateToken(user) {
    const payload = {
        userId: user.id,
        email: user.email,
        isAdmin: user.is_admin === 1
    };

    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

/**
 * Authentication middleware - requires valid token
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'No token provided'
        });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }

    // Get fresh user data
    const user = findUserById(decoded.userId);
    if (!user) {
        return res.status(401).json({
            success: false,
            error: 'User not found'
        });
    }

    // Check if user is still active
    if (user.status !== 'active') {
        return res.status(403).json({
            success: false,
            error: `Account is ${user.status}. Please contact admin.`
        });
    }

    // Attach user to request
    req.user = user;
    req.token = decoded;
    next();
}

/**
 * Admin middleware - requires admin privileges
 */
function requireAdmin(req, res, next) {
    // First run normal auth
    requireAuth(req, res, () => {
        if (!req.user || req.user.is_admin !== 1) {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }
        next();
    });
}

/**
 * Optional auth middleware - attaches user if token present, but doesn't require it
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = verifyToken(token);

        if (decoded) {
            const user = findUserById(decoded.userId);
            if (user) {
                req.user = user;
                req.token = decoded;
            }
        }
    }

    next();
}

module.exports = {
    JWT_SECRET,
    generateToken,
    verifyToken,
    requireAuth,
    requireAdmin,
    optionalAuth
};
