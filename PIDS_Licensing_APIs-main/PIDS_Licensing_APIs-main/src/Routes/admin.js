const express = require('express');
const { createUser } = require('../Controllers/userController.js');
const { authenticateToken, requireAdmin } = require('../middleware/auth.js');

// Create an instance of the Express Router
const routers = express.Router();

// All admin routes require authentication and admin role
routers.use(authenticateToken);
routers.use(requireAdmin);

//Route for creating new users (admin only)
routers.post('/createUser', async (req, res) => {
    try{
        const data = await createUser(req.body);
        res.status(data.code).json(data);
    }catch (error) {
        console.error(error)
        res.status(500).json({ success: false, message: error.message });
    }
});

// Export the router
module.exports = routers;
