// ============================================================
// PILOT TRADERS AI COPILOT - API Proxy Routes
// ============================================================
// Proxied Claude API calls with usage tracking
// ============================================================

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { requireAuth } = require('../middleware/auth');
const { canUserAnalyze, logUsage, getTodayUsageCount } = require('../database');

// Get API key from environment or config
function getApiKey() {
    // Try environment variable first (for production)
    if (process.env.ANTHROPIC_API_KEY) {
        return process.env.ANTHROPIC_API_KEY;
    }

    // Fall back to config file (for local development)
    try {
        const path = require('path');
        const fs = require('fs');
        const configPath = path.join(__dirname, '..', '..', 'config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return config.anthropic_api_key;
    } catch (error) {
        console.error('Could not load API key from config:', error.message);
        return null;
    }
}

/**
 * POST /api/analyze
 * Proxied analysis request to Claude
 */
router.post('/analyze', requireAuth, async (req, res) => {
    try {
        const { imageBase64, mediaType, prompt } = req.body;

        if (!imageBase64) {
            return res.status(400).json({
                success: false,
                error: 'Image data required'
            });
        }

        // Check if user can analyze
        const canAnalyze = canUserAnalyze(req.user.id);
        if (!canAnalyze.allowed) {
            return res.status(403).json({
                success: false,
                error: canAnalyze.reason,
                used: canAnalyze.used,
                limit: canAnalyze.limit
            });
        }

        // Get API key
        const apiKey = getApiKey();
        if (!apiKey) {
            return res.status(500).json({
                success: false,
                error: 'Server API key not configured'
            });
        }

        // Initialize Anthropic client
        const anthropic = new Anthropic({ apiKey });

        // Make the API call
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mediaType || 'image/png',
                                data: imageBase64
                            }
                        },
                        {
                            type: 'text',
                            text: prompt
                        }
                    ]
                }
            ]
        });

        // Log the usage
        logUsage(req.user.id, 'analysis');

        // Get updated usage count
        const todayUsage = getTodayUsageCount(req.user.id);

        // Return the response
        res.json({
            success: true,
            response: response.content[0].text,
            usage: {
                used: todayUsage,
                limit: req.user.daily_limit,
                remaining: req.user.daily_limit - todayUsage
            }
        });

    } catch (error) {
        console.error('Analysis API error:', error);

        // Handle specific error types
        if (error.status === 401) {
            return res.status(500).json({
                success: false,
                error: 'Server API key invalid'
            });
        }

        if (error.status === 429) {
            return res.status(429).json({
                success: false,
                error: 'Rate limit exceeded. Please wait a moment.'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Analysis failed: ' + error.message
        });
    }
});

/**
 * GET /api/usage
 * Get current user's usage stats
 */
router.get('/usage', requireAuth, (req, res) => {
    try {
        const todayUsage = getTodayUsageCount(req.user.id);

        res.json({
            success: true,
            usage: {
                used: todayUsage,
                limit: req.user.daily_limit,
                remaining: req.user.daily_limit - todayUsage
            }
        });

    } catch (error) {
        console.error('Usage check error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get usage'
        });
    }
});

/**
 * GET /api/status
 * Check if API is operational
 */
router.get('/status', (req, res) => {
    const apiKey = getApiKey();
    res.json({
        success: true,
        status: 'operational',
        apiConfigured: !!apiKey,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
