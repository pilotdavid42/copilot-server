// ============================================================
// PILOT TRADERS AI COPILOT - Backend Server
// ============================================================
// Main server entry point for user management and API proxy
// ============================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Import database functions
const { initDatabase, ensureMasterAdmin } = require('./database');

// Create Express app
const app = express();

// ============================================================
// MIDDLEWARE
// ============================================================

// CORS - allow requests from Electron app
app.use(cors({
    origin: true, // Allow all origins (Electron uses file://)
    credentials: true
}));

// Parse JSON bodies (with larger limit for image data)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        success: false,
        error: 'Too many requests, please try again later.'
    }
});
app.use(limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts per 15 min
    message: {
        success: false,
        error: 'Too many login attempts, please try again later.'
    }
});

// ============================================================
// ROUTES
// ============================================================

// Health check
app.get('/', (req, res) => {
    res.json({
        app: 'Pilot Traders Copilot Server',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// ============================================================
// SERVER STARTUP
// ============================================================

const PORT = process.env.PORT || 3456;

// Create master admin on first run
// Change these credentials for your deployment!
const MASTER_EMAIL = process.env.MASTER_EMAIL || 'admin@pilottraders.com';
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'changeme123';
const MASTER_NAME = process.env.MASTER_NAME || 'Master Admin';

// Initialize database and start server
async function startServer() {
    try {
        // Initialize database first
        console.log('Initializing database...');
        await initDatabase();

        // Now import routes (they depend on database being initialized)
        const authRoutes = require('./routes/auth');
        const adminRoutes = require('./routes/admin');
        const apiRoutes = require('./routes/api');

        // Set up routes BEFORE error handlers
        app.use('/auth', authLimiter, authRoutes);
        app.use('/admin', adminRoutes);
        app.use('/api', apiRoutes);

        // 404 handler - MUST come AFTER routes
        app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found'
            });
        });

        // Error handler - MUST come LAST
        app.use((err, req, res, next) => {
            console.error('Server error:', err);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        });

        // Ensure master admin exists
        ensureMasterAdmin(MASTER_EMAIL, MASTER_PASSWORD, MASTER_NAME);

        // Start server
        app.listen(PORT, '0.0.0.0', () => {
            console.log('');
            console.log('============================================================');
            console.log('   PILOT TRADERS COPILOT - User Management Server');
            console.log('============================================================');
            console.log(`   Server running on port ${PORT}`);
            console.log(`   URL: http://localhost:${PORT}`);
            console.log('');
            console.log('   Endpoints:');
            console.log('   - POST /auth/login     - User login');
            console.log('   - POST /auth/register  - User registration');
            console.log('   - GET  /auth/me        - Get current user');
            console.log('   - GET  /admin/users    - List users (admin)');
            console.log('   - POST /api/analyze    - AI analysis (authenticated)');
            console.log('');
            console.log(`   Master Admin: ${MASTER_EMAIL}`);
            console.log('   (Change password after first login!)');
            console.log('============================================================');
            console.log('');
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();

module.exports = app;
