// ============================================================
// PILOT TRADERS AI COPILOT - Admin Routes
// ============================================================
// User management endpoints for admin
// ============================================================

const express = require('express');
const router = express.Router();
const {
    getAllUsers,
    findUserById,
    createUser,
    updateUser,
    updateUserPassword,
    deleteUser,
    getUserUsageStats,
    getAllUsageStats,
    getTodayUsageCount
} = require('../database');
const { requireAdmin } = require('../middleware/auth');

// All admin routes require admin authentication
router.use(requireAdmin);

/**
 * GET /admin/users
 * Get all users
 */
router.get('/users', (req, res) => {
    try {
        const users = getAllUsers();

        // Add today's usage to each user
        const usersWithUsage = users.map(user => ({
            ...user,
            todayUsage: getTodayUsageCount(user.id),
            isAdmin: user.is_admin === 1,
            isPaid: user.is_paid === 1
        }));

        res.json({
            success: true,
            users: usersWithUsage
        });

    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get users'
        });
    }
});

/**
 * GET /admin/users/:id
 * Get single user details
 */
router.get('/users/:id', (req, res) => {
    try {
        const user = findUserById(parseInt(req.params.id));

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const todayUsage = getTodayUsageCount(user.id);
        const usageStats = getUserUsageStats(user.id, 30);

        res.json({
            success: true,
            user: {
                ...user,
                password_hash: undefined, // Don't send password
                todayUsage,
                isAdmin: user.is_admin === 1,
                isPaid: user.is_paid === 1
            },
            usageStats
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user'
        });
    }
});

/**
 * POST /admin/users
 * Create new user (admin can create active users directly)
 */
router.post('/users', (req, res) => {
    try {
        const { email, password, name, dailyLimit, status, isPaid } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({
                success: false,
                error: 'Email, password, and name required'
            });
        }

        // Create user
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

        // Update with admin-specified settings
        updateUser(result.userId, {
            status: status || 'active',
            daily_limit: dailyLimit || 10,
            is_paid: isPaid ? 1 : 0
        });

        res.json({
            success: true,
            message: 'User created successfully',
            userId: result.userId
        });

    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create user'
        });
    }
});

/**
 * PUT /admin/users/:id
 * Update user
 */
router.put('/users/:id', (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { name, status, dailyLimit, isPaid, password } = req.body;

        const user = findUserById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Prevent modifying own admin status
        if (userId === req.user.id && req.body.isAdmin === false) {
            return res.status(400).json({
                success: false,
                error: 'Cannot remove your own admin status'
            });
        }

        // Build update object
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (status !== undefined) updates.status = status;
        if (dailyLimit !== undefined) updates.daily_limit = parseInt(dailyLimit);
        if (isPaid !== undefined) updates.is_paid = isPaid ? 1 : 0;

        const result = updateUser(userId, updates);

        // Update password if provided
        if (password) {
            updateUserPassword(userId, password);
        }

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }

        res.json({
            success: true,
            message: 'User updated successfully'
        });

    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user'
        });
    }
});

/**
 * PUT /admin/users/:id/status
 * Quick status update (activate, pause, deactivate)
 */
router.put('/users/:id/status', (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { status } = req.body;

        if (!['active', 'paused', 'deactivated', 'pending'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status. Use: active, paused, deactivated, or pending'
            });
        }

        const user = findUserById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Prevent deactivating yourself
        if (userId === req.user.id && status === 'deactivated') {
            return res.status(400).json({
                success: false,
                error: 'Cannot deactivate your own account'
            });
        }

        const result = updateUser(userId, { status });

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }

        res.json({
            success: true,
            message: `User ${status} successfully`
        });

    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user status'
        });
    }
});

/**
 * DELETE /admin/users/:id
 * Delete user
 */
router.delete('/users/:id', (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        if (userId === req.user.id) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete your own account'
            });
        }

        const user = findUserById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (user.is_admin === 1) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete admin accounts'
            });
        }

        const result = deleteUser(userId);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error
            });
        }

        res.json({
            success: true,
            message: 'User deleted successfully'
        });

    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete user'
        });
    }
});

/**
 * GET /admin/stats
 * Get overall usage statistics
 */
router.get('/stats', (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const stats = getAllUsageStats(days);

        const users = getAllUsers();
        const summary = {
            totalUsers: users.length,
            activeUsers: users.filter(u => u.status === 'active').length,
            pendingUsers: users.filter(u => u.status === 'pending').length,
            pausedUsers: users.filter(u => u.status === 'paused').length,
            deactivatedUsers: users.filter(u => u.status === 'deactivated').length,
            paidUsers: users.filter(u => u.is_paid === 1).length
        };

        res.json({
            success: true,
            summary,
            userStats: stats
        });

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get stats'
        });
    }
});

module.exports = router;
