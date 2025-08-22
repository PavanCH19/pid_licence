const express = require('express');
const {
    renewToken,
    signIn,
    sendCode,
    validateCode,
    changePassword,
    logout
} = require('../Controllers/userController.js');
const { getBlacklistedTokens } = require('../Supporters/tokenBlacklist.js');
const { activateLicense } = require('../Controllers/licenseController.js');
const { authenticateToken } = require('../middleware/auth.js');

// Create an instance of the Express Router
const routers = express.Router();


//Route for Sign-in.
routers.post('/signin', async (req, res) => {
    try{
        let resp = await signIn(req.body);
        res.status(resp.code).json(resp);
    }catch (error) {
        console.error(error)
        res.status(500).json({ success: false, message: error.message });
    }
});

//Route for renewing tokens
routers.post('/renewToken', async (req, res) => {
    try{        
        let data = await renewToken(req);
        res.status(data.code).json(data);
    }catch (error) {
        console.error(error)
        res.status(500).json({ success: false, message: error.message });
    }

});

//Route for logout
routers.post('/logout', authenticateToken, async (req, res) => {
    try{
        const authHeader = req.headers['authorization'];
        let accessToken = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            accessToken = authHeader.substring(7);
        } else if (authHeader) {
            accessToken = authHeader;
        }
        
        // Get refresh token from request body if provided
        const refreshToken = req.body.refreshToken;
        
        const data = await logout(accessToken, refreshToken);
        res.status(data.code).json(data);
    }catch (error) {
        console.error(error)
        res.status(500).json({ success: false, message: error.message });
    }
});


//Route for changing password (requires authentication)
routers.put('/changePassword', authenticateToken, async (req, res) => {
    try{
        const data = await changePassword(req.body);
        res.status(data.code).json(data);
    }catch (error) {
        console.error(error)
        res.status(500).json({ success: false, message: error.message });
    }
});

// Debug route to check blacklisted tokens (remove in production)
routers.get('/debug/blacklist', (req, res) => {
    try {
        const blacklistedTokens = getBlacklistedTokens();
        res.json({
            success: true,
            count: blacklistedTokens.length,
            tokens: blacklistedTokens.map(token => token.substring(0, 20) + '...')
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Export the router
module.exports = routers;
