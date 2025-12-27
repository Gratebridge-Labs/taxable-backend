const express = require('express');
const router = express.Router();
const { 
  getBaseQuestions, 
  answerQuestion, 
  getNextQuestions, 
  getResponses,
  getQuestionProgress
} = require('../controllers/questionController');
const { authenticate } = require('../middleware/auth');
const { checkEmailVerified } = require('../middleware/profileAuth');

// All routes require authentication and email verification
router.get('/:profileId/base-questions', authenticate, checkEmailVerified, getBaseQuestions);
router.post('/:profileId/answer', authenticate, checkEmailVerified, answerQuestion);
router.get('/:profileId/next-questions', authenticate, checkEmailVerified, getNextQuestions);
router.get('/:profileId/responses', authenticate, checkEmailVerified, getResponses);
router.get('/:profileId/progress', authenticate, checkEmailVerified, getQuestionProgress);

module.exports = router;

