const QuestionResponse = require('../models/QuestionResponse');
const TaxableProfile = require('../models/TaxableProfile');
const fs = require('fs');
const path = require('path');

// Load question files
const loadQuestions = (profileType) => {
  const questionFiles = {
    'Individual': 'INDIVIDUAL_BASE_QUESTIONS.json',
    'Business': 'BUSINESS_BASE_QUESTIONS.json',
    'Joint_Spouse': 'JOINT_SPOUSE_QUESTIONS.json',
    'Joint_Business': 'JOINT_BUSINESS_QUESTIONS.json'
  };

  const detailedFiles = {
    'Individual': 'INDIVIDUAL_DETAILED_QUESTIONS.json',
    'Business': 'BUSINESS_DETAILED_QUESTIONS.json'
  };

  try {
    const baseFile = questionFiles[profileType];
    const detailedFile = detailedFiles[profileType] || detailedFiles['Individual'];
    
    const baseQuestionsPath = path.join(__dirname, '../docs/questions', baseFile);
    const detailedQuestionsPath = path.join(__dirname, '../docs/questions', detailedFile);

    const baseQuestions = JSON.parse(fs.readFileSync(baseQuestionsPath, 'utf8'));
    const detailedQuestions = JSON.parse(fs.readFileSync(detailedQuestionsPath, 'utf8'));

    return { baseQuestions, detailedQuestions };
  } catch (error) {
    console.error('Error loading questions:', error);
    return null;
  }
};

/**
 * Get base questions for a profile
 */
const getBaseQuestions = async (req, res) => {
  try {
    const { profileId } = req.params;

    const profile = await TaxableProfile.findOne({ 
      profileId,
      user: req.user.userId 
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    const questions = loadQuestions(profile.profileType);
    if (!questions) {
      return res.status(500).json({
        success: false,
        message: 'Error loading questions'
      });
    }

    // Get existing responses to determine which questions to show
    const existingResponses = await QuestionResponse.find({ 
      profileId: profile._id 
    });

    // Filter questions based on dependencies and existing responses
    const availableQuestions = questions.baseQuestions.questions.filter(q => {
      if (!q.dependsOn || q.dependsOn.length === 0) {
        return true;
      }
      
      // Check if all dependencies are answered
      return q.dependsOn.every(depId => {
        return existingResponses.some(resp => resp.questionId === depId);
      });
    });

    res.status(200).json({
      success: true,
      message: 'Base questions retrieved successfully',
      data: {
        profileId: profile.profileId,
        profileType: profile.profileType,
        year: profile.year,
        questions: availableQuestions,
        totalQuestions: questions.baseQuestions.questions.length,
        answeredQuestions: existingResponses.length
      }
    });

  } catch (error) {
    console.error('Get base questions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving base questions',
      error: error.message
    });
  }
};

/**
 * Answer a question
 */
const answerQuestion = async (req, res) => {
  try {
    const { profileId } = req.params;
    const { questionId, response } = req.body;

    if (!questionId || response === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Question ID and response are required'
      });
    }

    const profile = await TaxableProfile.findOne({ 
      profileId,
      user: req.user.userId 
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Load questions to get question type
    const questions = loadQuestions(profile.profileType);
    if (!questions) {
      return res.status(500).json({
        success: false,
        message: 'Error loading questions'
      });
    }

    // Find question definition
    const allQuestions = [
      ...questions.baseQuestions.questions,
      ...Object.values(questions.detailedQuestions.questionSets).flatMap(set => set.questions || [])
    ];
    const questionDef = allQuestions.find(q => q.questionId === questionId);

    if (!questionDef) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // Validate response based on question type
    const validationError = validateResponse(response, questionDef);
    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError
      });
    }

    // Save or update response
    const questionResponse = await QuestionResponse.findOneAndUpdate(
      { 
        profileId: profile._id,
        questionId: questionId
      },
      {
        profileId: profile._id,
        questionId: questionId,
        questionType: questionDef.questionType,
        response: response,
        tableData: questionDef.questionType === 'table' ? response : undefined,
        updatedAt: Date.now()
      },
      { 
        upsert: true, 
        new: true 
      }
    );

    // Determine next questions based on conditional logic
    const nextQuestions = getNextQuestionsFromAnswer(questionDef, response, questions);

    res.status(200).json({
      success: true,
      message: 'Question answered successfully',
      data: {
        responseId: questionResponse._id,
        questionId: questionId,
        response: response,
        nextQuestions: nextQuestions,
        hasMoreQuestions: nextQuestions.length > 0
      }
    });

  } catch (error) {
    console.error('Answer question error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving question response',
      error: error.message
    });
  }
};

/**
 * Get next questions based on current answers
 */
const getNextQuestionsEndpoint = async (req, res) => {
  try {
    const { profileId } = req.params;

    const profile = await TaxableProfile.findOne({ 
      profileId,
      user: req.user.userId 
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Get all responses
    const responses = await QuestionResponse.find({ 
      profileId: profile._id 
    });

    // Load questions
    const questions = loadQuestions(profile.profileType);
    if (!questions) {
      return res.status(500).json({
        success: false,
        message: 'Error loading questions'
      });
    }

    // Determine which questions should be shown next
    const allQuestions = [
      ...questions.baseQuestions.questions,
      ...Object.values(questions.detailedQuestions.questionSets).flatMap(set => set.questions || [])
    ];

    const answeredQuestionIds = responses.map(r => r.questionId);
    const nextQuestions = allQuestions.filter(q => {
      // Skip if already answered
      if (answeredQuestionIds.includes(q.questionId)) {
        return false;
      }

      // Check dependencies
      if (q.dependsOn && q.dependsOn.length > 0) {
        const allDependenciesAnswered = q.dependsOn.every(depId => 
          answeredQuestionIds.includes(depId)
        );
        if (!allDependenciesAnswered) {
          return false;
        }
      }

      // Check conditional questions based on previous answers
      for (const response of responses) {
        const questionDef = allQuestions.find(q => q.questionId === response.questionId);
        if (questionDef && questionDef.conditionalQuestions) {
          const conditionalIds = getConditionalQuestionIds(questionDef, response.response);
          if (conditionalIds.includes(q.questionId)) {
            return true;
          }
        }
      }

      // If no dependencies, show it
      if (!q.dependsOn || q.dependsOn.length === 0) {
        return true;
      }

      return false;
    });

    res.status(200).json({
      success: true,
      message: 'Next questions retrieved successfully',
      data: {
        profileId: profile.profileId,
        nextQuestions: nextQuestions,
        totalRemaining: nextQuestions.length,
        answeredCount: responses.length
      }
    });

  } catch (error) {
    console.error('Get next questions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving next questions',
      error: error.message
    });
  }
};

/**
 * Get all responses for a profile
 */
const getResponses = async (req, res) => {
  try {
    const { profileId } = req.params;

    const profile = await TaxableProfile.findOne({ 
      profileId,
      user: req.user.userId 
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    const responses = await QuestionResponse.find({ 
      profileId: profile._id 
    }).sort({ answeredAt: 1 });

    res.status(200).json({
      success: true,
      message: 'Responses retrieved successfully',
      data: {
        profileId: profile.profileId,
        totalResponses: responses.length,
        responses: responses.map(r => ({
          questionId: r.questionId,
          questionType: r.questionType,
          response: r.response,
          answeredAt: r.answeredAt
        }))
      }
    });

  } catch (error) {
    console.error('Get responses error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving responses',
      error: error.message
    });
  }
};

/**
 * Get question progress
 */
const getQuestionProgress = async (req, res) => {
  try {
    const { profileId } = req.params;

    const profile = await TaxableProfile.findOne({ 
      profileId,
      user: req.user.userId 
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    const questions = loadQuestions(profile.profileType);
    if (!questions) {
      return res.status(500).json({
        success: false,
        message: 'Error loading questions'
      });
    }

    const responses = await QuestionResponse.find({ 
      profileId: profile._id 
    });

    const allQuestions = [
      ...questions.baseQuestions.questions,
      ...Object.values(questions.detailedQuestions.questionSets).flatMap(set => set.questions || [])
    ];

    const baseQuestionsCount = questions.baseQuestions.questions.length;
    const answeredBaseQuestions = responses.filter(r => 
      questions.baseQuestions.questions.some(q => q.questionId === r.questionId)
    ).length;

    res.status(200).json({
      success: true,
      message: 'Question progress retrieved successfully',
      data: {
        profileId: profile.profileId,
        progress: {
          baseQuestions: {
            total: baseQuestionsCount,
            answered: answeredBaseQuestions,
            remaining: baseQuestionsCount - answeredBaseQuestions,
            percentage: Math.round((answeredBaseQuestions / baseQuestionsCount) * 100)
          },
          totalQuestions: {
            total: allQuestions.length,
            answered: responses.length,
            remaining: allQuestions.length - responses.length,
            percentage: Math.round((responses.length / allQuestions.length) * 100)
          }
        },
        isBaseQuestionsComplete: answeredBaseQuestions >= baseQuestionsCount
      }
    });

  } catch (error) {
    console.error('Get question progress error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving question progress',
      error: error.message
    });
  }
};

// Helper functions
function getNextQuestionsFromAnswer(questionDef, response, questions) {
  if (!questionDef.conditionalQuestions) {
    return [];
  }

  let nextQuestionIds = [];
  
  if (questionDef.questionType === 'yes_no') {
    nextQuestionIds = questionDef.conditionalQuestions[response ? 'yes' : 'no'] || [];
  } else if (questionDef.questionType === 'multiple_choice') {
    if (Array.isArray(response)) {
      // Multiple selection
      response.forEach(option => {
        if (questionDef.conditionalQuestions[option]) {
          nextQuestionIds.push(...questionDef.conditionalQuestions[option]);
        }
      });
    } else {
      // Single selection
      nextQuestionIds = questionDef.conditionalQuestions[response] || [];
    }
  }

  // Get question definitions
  const allQuestions = [
    ...questions.baseQuestions.questions,
    ...Object.values(questions.detailedQuestions.questionSets).flatMap(set => set.questions || [])
  ];

  return allQuestions.filter(q => nextQuestionIds.includes(q.questionId));
}

function validateResponse(response, questionDef) {
  if (questionDef.required && (response === null || response === undefined || response === '')) {
    return `${questionDef.questionText} is required`;
  }

  if (questionDef.questionType === 'number') {
    if (typeof response !== 'number' || isNaN(response)) {
      return 'Response must be a valid number';
    }
    if (questionDef.validation) {
      if (questionDef.validation.min !== undefined && response < questionDef.validation.min) {
        return `Value must be at least ${questionDef.validation.min}`;
      }
      if (questionDef.validation.max !== undefined && response > questionDef.validation.max) {
        return `Value must be at most ${questionDef.validation.max}`;
      }
    }
  }

  if (questionDef.questionType === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(response)) {
      return 'Invalid email format';
    }
  }

  if (questionDef.questionType === 'date') {
    if (isNaN(Date.parse(response))) {
      return 'Invalid date format';
    }
  }

  return null;
}

function getConditionalQuestionIds(questionDef, response) {
  if (!questionDef.conditionalQuestions) {
    return [];
  }

  if (questionDef.questionType === 'yes_no') {
    return questionDef.conditionalQuestions[response ? 'yes' : 'no'] || [];
  } else if (questionDef.questionType === 'multiple_choice') {
    if (Array.isArray(response)) {
      const ids = [];
      response.forEach(option => {
        if (questionDef.conditionalQuestions[option]) {
          ids.push(...questionDef.conditionalQuestions[option]);
        }
      });
      return ids;
    } else {
      return questionDef.conditionalQuestions[response] || [];
    }
  }

  return [];
}

module.exports = {
  getBaseQuestions,
  answerQuestion,
  getNextQuestions: getNextQuestionsEndpoint,
  getResponses,
  getQuestionProgress
};

