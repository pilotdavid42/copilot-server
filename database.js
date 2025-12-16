// ============================================================
// PILOT TRADERS AI COPILOT - Database Setup
// ============================================================
// SQLite database for user management and usage tracking
// Using sql.js (pure JavaScript, no native compilation needed)
// ============================================================

const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Database file path - use RAILWAY_VOLUME_MOUNT_PATH if available for persistence
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const dbPath = path.join(dataDir, 'database.sqlite');

// Global database instance
let db = null;

// Initialize database
async function initDatabase() {
    const SQL = await initSqlJs();

    // Load existing database or create new one
    try {
        if (fs.existsSync(dbPath)) {
            const fileBuffer = fs.readFileSync(dbPath);
            db = new SQL.Database(fileBuffer);
            console.log('Loaded existing database');
        } else {
            db = new SQL.Database();
            console.log('Created new database');
        }
    } catch (error) {
        console.log('Creating fresh database:', error.message);
        db = new SQL.Database();
    }

    // Create tables
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            daily_limit INTEGER DEFAULT 10,
            is_admin INTEGER DEFAULT 0,
            is_paid INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS usage_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Create index for faster usage queries
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_usage_user_timestamp
        ON usage_logs(user_id, timestamp)
    `);

    // Save database
    saveDatabase();

    console.log('Database initialized successfully');
    return db;
}

// Save database to file
function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }
}

// Helper to get single row
function getOne(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    stmt.free();
    return null;
}

// Helper to get all rows
function getAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

// Helper to run statement
function run(sql, params = []) {
    db.run(sql, params);
    saveDatabase();
}

// ============================================================
// USER OPERATIONS
// ============================================================

/**
 * Create a new user
 */
function createUser(email, password, name, isAdmin = false) {
    const passwordHash = bcrypt.hashSync(password, 10);
    const status = isAdmin ? 'active' : 'pending';

    try {
        run(
            `INSERT INTO users (email, password_hash, name, status, is_admin) VALUES (?, ?, ?, ?, ?)`,
            [email, passwordHash, name, status, isAdmin ? 1 : 0]
        );

        // Get the last inserted ID
        const result = getOne('SELECT last_insert_rowid() as id');
        return { success: true, userId: result.id };
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return { success: false, error: 'Email already exists' };
        }
        return { success: false, error: error.message };
    }
}

/**
 * Find user by email
 */
function findUserByEmail(email) {
    return getOne('SELECT * FROM users WHERE email = ?', [email]);
}

/**
 * Find user by ID
 */
function findUserById(id) {
    return getOne('SELECT * FROM users WHERE id = ?', [id]);
}

/**
 * Get all users (for admin)
 */
function getAllUsers() {
    return getAll(`
        SELECT id, email, name, status, daily_limit, is_admin, is_paid, created_at, updated_at
        FROM users
        ORDER BY created_at DESC
    `);
}

/**
 * Update user
 */
function updateUser(id, updates) {
    const allowedFields = ['name', 'status', 'daily_limit', 'is_paid'];
    const setClause = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
            setClause.push(`${key} = ?`);
            values.push(value);
        }
    }

    if (setClause.length === 0) {
        return { success: false, error: 'No valid fields to update' };
    }

    setClause.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    try {
        run(`UPDATE users SET ${setClause.join(', ')} WHERE id = ?`, values);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Update user password
 */
function updateUserPassword(id, newPassword) {
    const passwordHash = bcrypt.hashSync(newPassword, 10);
    try {
        run(
            `UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [passwordHash, id]
        );
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete user
 */
function deleteUser(id) {
    try {
        // Delete usage logs first
        run('DELETE FROM usage_logs WHERE user_id = ?', [id]);
        // Delete user
        run('DELETE FROM users WHERE id = ?', [id]);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Verify user password
 */
function verifyPassword(user, password) {
    return bcrypt.compareSync(password, user.password_hash);
}

// ============================================================
// USAGE TRACKING
// ============================================================

/**
 * Log a usage action
 */
function logUsage(userId, action) {
    try {
        run(`INSERT INTO usage_logs (user_id, action) VALUES (?, ?)`, [userId, action]);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get today's usage count for a user
 */
function getTodayUsageCount(userId) {
    const result = getOne(`
        SELECT COUNT(*) as count FROM usage_logs
        WHERE user_id = ?
        AND date(timestamp) = date('now')
        AND action = 'analysis'
    `, [userId]);
    return result ? result.count : 0;
}

/**
 * Check if user can perform analysis (within daily limit)
 * Admins and users with daily_limit = -1 get unlimited usage
 */
function canUserAnalyze(userId) {
    const user = findUserById(userId);
    if (!user) return { allowed: false, reason: 'User not found' };
    if (user.status !== 'active') return { allowed: false, reason: 'Account not active' };

    const todayCount = getTodayUsageCount(userId);

    // Admins get unlimited usage automatically
    // Users with daily_limit = -1 also get unlimited usage
    if (user.is_admin === 1 || user.daily_limit === -1) {
        return {
            allowed: true,
            used: todayCount,
            limit: -1,  // -1 indicates unlimited
            remaining: 'unlimited',
            unlimited: true
        };
    }

    if (todayCount >= user.daily_limit) {
        return {
            allowed: false,
            reason: 'Daily limit reached',
            used: todayCount,
            limit: user.daily_limit
        };
    }

    return {
        allowed: true,
        used: todayCount,
        limit: user.daily_limit,
        remaining: user.daily_limit - todayCount
    };
}

/**
 * Get usage stats for a user
 */
function getUserUsageStats(userId, days = 30) {
    return getAll(`
        SELECT date(timestamp) as date, COUNT(*) as count
        FROM usage_logs
        WHERE user_id = ? AND action = 'analysis'
        AND timestamp >= datetime('now', '-' || ? || ' days')
        GROUP BY date(timestamp)
        ORDER BY date DESC
    `, [userId, days]);
}

/**
 * Get all usage stats (for admin)
 */
function getAllUsageStats(days = 7) {
    return getAll(`
        SELECT
            u.id, u.email, u.name,
            COUNT(ul.id) as total_uses,
            u.daily_limit
        FROM users u
        LEFT JOIN usage_logs ul ON u.id = ul.user_id
            AND ul.timestamp >= datetime('now', '-' || ? || ' days')
            AND ul.action = 'analysis'
        GROUP BY u.id
        ORDER BY total_uses DESC
    `, [days]);
}

// ============================================================
// ADMIN SETUP
// ============================================================

/**
 * Create master admin if doesn't exist
 */
function ensureMasterAdmin(email, password, name) {
    const existing = findUserByEmail(email);
    if (existing) {
        console.log('Master admin already exists');
        return { success: true, existing: true, userId: existing.id };
    }

    const result = createUser(email, password, name, true);
    if (result.success) {
        // Make sure admin is active with unlimited usage (-1 = unlimited)
        updateUser(result.userId, { status: 'active', daily_limit: -1, is_paid: 1 });
        console.log('Master admin created successfully with unlimited usage');
    }
    return result;
}

/**
 * Get database instance (for advanced operations)
 */
function getDb() {
    return db;
}

module.exports = {
    initDatabase,
    getDb,
    createUser,
    findUserByEmail,
    findUserById,
    getAllUsers,
    updateUser,
    updateUserPassword,
    deleteUser,
    verifyPassword,
    logUsage,
    getTodayUsageCount,
    canUserAnalyze,
    getUserUsageStats,
    getAllUsageStats,
    ensureMasterAdmin
};
