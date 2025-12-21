const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, updateTIN } = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.patch('/tin', updateTIN);

module.exports = router;

