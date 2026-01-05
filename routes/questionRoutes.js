const express = require('express');
const router = express.Router();
const { 
  getBaseQuestions, 
  answerBaseQuestions,
  answerQuestion, 
  getNextQuestions, 
  getResponses,
  getQuestionProgress,
  getAllDetailedQuestions,
  saveIncomeData
} = require('../controllers/questionController');
const { authenticate } = require('../middleware/auth');
const { checkEmailVerified } = require('../middleware/profileAuth');

// All routes require authentication and email verification
router.get('/:profileId/base-questions', authenticate, checkEmailVerified, getBaseQuestions);
router.post('/:profileId/answer-base-questions', authenticate, checkEmailVerified, answerBaseQuestions);
router.get('/:profileId/detailed-questions', authenticate, checkEmailVerified, getAllDetailedQuestions); // Get all detailed questions grouped by category (includes income data)
router.post('/:profileId/answer', authenticate, checkEmailVerified, answerQuestion); // For detailed questions
router.post('/:profileId/income', authenticate, checkEmailVerified, saveIncomeData); // Save income data with monthly/annual support and auto-save
router.get('/:profileId/next-questions', authenticate, checkEmailVerified, getNextQuestions);
router.get('/:profileId/responses', authenticate, checkEmailVerified, getResponses);
router.get('/:profileId/progress', authenticate, checkEmailVerified, getQuestionProgress);

module.exports = router;

