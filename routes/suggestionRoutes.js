const express = require('express');
const router = express.Router();
const { getSuggestions } = require('../controllers/tipController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

router.get('/', getSuggestions);

module.exports = router;

