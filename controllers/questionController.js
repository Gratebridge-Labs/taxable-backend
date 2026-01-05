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
 * Returns ALL base questions at once (ordered by their order field)
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

    // Get existing responses to show which are already answered
    const existingResponses = await QuestionResponse.find({ 
      profileId: profile._id 
    });

    // Return ALL base questions, sorted by order
    const baseQuestions = questions.baseQuestions.questions
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(q => {
        const existingResponse = existingResponses.find(r => r.questionId === q.questionId);
        return {
          ...q,
          answered: !!existingResponse,
          existingResponse: existingResponse ? existingResponse.response : null
        };
      });

    res.status(200).json({
      success: true,
      message: 'Base questions retrieved successfully',
      data: {
        profileId: profile.profileId,
        profileType: profile.profileType,
        year: profile.year,
        questions: baseQuestions,
        totalQuestions: baseQuestions.length,
        answeredQuestions: existingResponses.filter(r => 
          baseQuestions.some(q => q.questionId === r.questionId)
        ).length,
        isComplete: existingResponses.filter(r => 
          baseQuestions.some(q => q.questionId === r.questionId)
        ).length === baseQuestions.length
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
 * Answer all base questions at once
 */
const answerBaseQuestions = async (req, res) => {
  try {
    const { profileId } = req.params;
    const { answers } = req.body; // Array of { questionId, response }

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Answers array is required and must not be empty'
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

    // Load questions to validate
    const questions = loadQuestions(profile.profileType);
    if (!questions) {
      return res.status(500).json({
        success: false,
        message: 'Error loading questions'
      });
    }

    const baseQuestions = questions.baseQuestions.questions;
    const allQuestions = [
      ...baseQuestions,
      ...Object.values(questions.detailedQuestions.questionSets).flatMap(set => set.questions || [])
    ];

    // Validate all answers
    const savedResponses = [];
    const errors = [];

    for (const answer of answers) {
      const { questionId, response } = answer;

      if (!questionId || response === undefined) {
        errors.push({
          questionId: questionId || 'unknown',
          error: 'Question ID and response are required'
        });
        continue;
      }

      // Check if it's a base question
      const questionDef = allQuestions.find(q => q.questionId === questionId);
      if (!questionDef) {
        errors.push({
          questionId,
          error: 'Question not found'
        });
        continue;
      }

      // Check if it's actually a base question
      const isBaseQuestion = baseQuestions.some(q => q.questionId === questionId);
      if (!isBaseQuestion) {
        errors.push({
          questionId,
          error: 'This is not a base question. Base questions must be answered first.'
        });
        continue;
      }

      // Validate response
      const validationError = validateResponse(response, questionDef);
      if (validationError) {
        errors.push({
          questionId,
          error: validationError
        });
        continue;
      }

      // Save response
      try {
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
        savedResponses.push({
          questionId,
          responseId: questionResponse._id
        });
      } catch (saveError) {
        errors.push({
          questionId,
          error: saveError.message
        });
      }
    }

    // Determine next questions based on all answers
    const nextQuestions = [];
    for (const answer of answers) {
      const questionDef = allQuestions.find(q => q.questionId === answer.questionId);
      if (questionDef && questionDef.conditionalQuestions) {
        const conditionalQuestions = getNextQuestionsFromAnswer(questionDef, answer.response, questions);
        nextQuestions.push(...conditionalQuestions);
      }
    }

    // Remove duplicates
    const uniqueNextQuestions = nextQuestions.filter((q, index, self) => 
      index === self.findIndex(t => t.questionId === q.questionId)
    );

    // Check if all required base questions have been answered
    // Get all question IDs from the answers array (including those that failed validation)
    const answeredQuestionIds = answers.map(a => a.questionId);
    const requiredBaseQuestionIds = baseQuestions
      .filter(q => q.required)
      .map(q => q.questionId);
    
    const allRequiredBaseQuestionsAnswered = requiredBaseQuestionIds.every(
      qId => answeredQuestionIds.includes(qId)
    );

    // If all base questions were answered successfully (no errors) and all required questions are answered, mark baseQuestionsAnswered as true
    if (errors.length === 0 && allRequiredBaseQuestionsAnswered) {
      await TaxableProfile.findByIdAndUpdate(
        profile._id,
        { baseQuestionsAnswered: true },
        { new: true }
      );
    }

    res.status(200).json({
      success: errors.length === 0,
      message: errors.length === 0 
        ? 'All base questions answered successfully' 
        : 'Some questions failed to save',
      data: {
        savedResponses: savedResponses,
        errors: errors.length > 0 ? errors : undefined,
        nextQuestions: uniqueNextQuestions,
        hasMoreQuestions: uniqueNextQuestions.length > 0,
        baseQuestionsComplete: errors.length === 0
      }
    });

  } catch (error) {
    console.error('Answer base questions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving base question responses',
      error: error.message
    });
  }
};

/**
 * Answer a single question (for detailed questions after base questions)
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

    // Extract period, month, year from request body for income questions
    const { period, month, year } = req.body;
    
    // Build query - for monthly income, include period, month, year in query
    const query = { 
      profileId: profile._id,
      questionId: questionId
    };
    
    // For monthly income, add period, month, year to query for uniqueness
    if (period === 'monthly' && month && year) {
      query.period = 'monthly';
      query.month = month;
      query.year = year;
    } else if (period === 'annually') {
      query.period = 'annually';
    }
    
    // Build update object
    const updateData = {
      profileId: profile._id,
      questionId: questionId,
      questionType: questionDef.questionType,
      response: response,
      tableData: questionDef.questionType === 'table' ? response : undefined,
      updatedAt: Date.now()
    };
    
    // Add period info for income questions
    if (period) {
      updateData.period = period;
      if (period === 'monthly' && month && year) {
        updateData.month = month;
        updateData.year = year;
      }
    }
    
    // Save or update response
    const questionResponse = await QuestionResponse.findOneAndUpdate(
      query,
      updateData,
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

  // Validate multiple choice with allowMultiple
  if (questionDef.questionType === 'multiple_choice') {
    if (questionDef.allowMultiple) {
      // When allowMultiple is true, response must be an array
      if (!Array.isArray(response)) {
        return `${questionDef.questionText} requires multiple selections. Please provide an array of selected options.`;
      }
      // Validate that all selected options are valid
      if (response.length === 0 && questionDef.required) {
        return `${questionDef.questionText} is required. Please select at least one option.`;
      }
      // Check if all selected options exist in the question's options
      const invalidOptions = response.filter(opt => !questionDef.options.includes(opt));
      if (invalidOptions.length > 0) {
        return `Invalid option(s): ${invalidOptions.join(', ')}. Please select from the available options.`;
      }
    } else {
      // When allowMultiple is false, response should be a single value
      if (Array.isArray(response)) {
        return `${questionDef.questionText} only allows a single selection. Please provide one option.`;
      }
      // Validate that the selected option exists in the question's options
      if (response && !questionDef.options.includes(response)) {
        return `Invalid option: ${response}. Please select from the available options.`;
      }
    }
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

/**
 * Get all detailed questions grouped by category
 * Returns questions organized by categoryKey with answered status
 */
const getAllDetailedQuestions = async (req, res) => {
  try {
    const { profileId } = req.params;
    const { period } = req.query; // 'monthly' or 'annually' for income questions

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

    // Check if base questions are answered
    if (!profile.baseQuestionsAnswered) {
      return res.status(400).json({
        success: false,
        message: 'Base questions must be answered first before accessing detailed questions'
      });
    }

    // Load questions
    const questions = loadQuestions(profile.profileType);
    if (!questions) {
      return res.status(500).json({
        success: false,
        message: 'Error loading questions'
      });
    }

    // Get all existing responses
    // For income questions, we need to check both monthly and annual responses
    const existingResponses = await QuestionResponse.find({ 
      profileId: profile._id 
    });
    const responseMap = new Map();
    const monthlyResponseMap = new Map(); // For monthly income data
    
    existingResponses.forEach(r => {
      // For monthly responses, store with month/year key
      if (r.period === 'monthly' && r.month && r.year) {
        const key = `${r.questionId}_${r.month}_${r.year}`;
        monthlyResponseMap.set(key, r);
      }
      // For annual or default, use questionId
      if (r.period === 'annually' || !r.period) {
        responseMap.set(r.questionId, r);
      }
    });

    // Flatten all detailed questions from all questionSets
    // Handle both flat questionSets and nested questionSets (like deductions)
    const allDetailedQuestions = [];
    
    const flattenQuestionSets = (sets) => {
      Object.values(sets).forEach(set => {
        // If set has questions directly, add them
        if (set.questions && Array.isArray(set.questions)) {
          allDetailedQuestions.push(...set.questions);
        } else if (typeof set === 'object' && set !== null) {
          // If set is nested (like deductions with nhf, nhis, etc.), iterate through nested sets
          Object.values(set).forEach(nestedSet => {
            if (nestedSet && nestedSet.questions && Array.isArray(nestedSet.questions)) {
              allDetailedQuestions.push(...nestedSet.questions);
            } else if (nestedSet && typeof nestedSet === 'object' && nestedSet !== null) {
              // Handle deeper nesting if needed
              Object.values(nestedSet).forEach(deepNested => {
                if (deepNested && deepNested.questions && Array.isArray(deepNested.questions)) {
                  allDetailedQuestions.push(...deepNested.questions);
                }
              });
            }
          });
        }
      });
    };
    
    flattenQuestionSets(questions.detailedQuestions.questionSets);

    // Group questions by categoryKey
    const questionsByCategory = {};
    
    allDetailedQuestions.forEach(question => {
      // Get categoryKey from question (default to 'other' if not specified)
      const categoryKey = question.categoryKey || 'other';
      
      if (!questionsByCategory[categoryKey]) {
        questionsByCategory[categoryKey] = {
          categoryKey: categoryKey,
          categoryName: getCategoryName(categoryKey),
          questions: []
        };
      }

      // Check if question is answered and get income data
      let existingResponse = null;
      let isAnswered = false;
      let monthlyData = null;
      let annualTotal = null;
      let allMonthsComplete = false;
      
      // For income questions, handle monthly/annual data
      if (categoryKey === 'incomeanddeductions') {
        // Get monthly responses for this question
        const monthlyResponses = existingResponses.filter(r => 
          r.questionId === question.questionId && 
          r.period === 'monthly' && 
          r.year === profile.year
        ).sort((a, b) => (a.month || 0) - (b.month || 0));
        
        // Get annual response
        const annualResponse = existingResponses.find(r => 
          r.questionId === question.questionId && 
          (r.period === 'annually' || !r.period)
        );
        
        // Check if answered (either monthly or annual)
        isAnswered = monthlyResponses.length > 0 || !!annualResponse;
        
        // If period is monthly, include monthly data
        if (period === 'monthly' && monthlyResponses.length > 0) {
          monthlyData = {};
          monthlyResponses.forEach(r => {
            if (r.month) {
              monthlyData[r.month] = {
                month: r.month,
                year: r.year,
                response: r.response,
                updatedAt: r.updatedAt
              };
            }
          });
          
          // Calculate annual total if all 12 months exist
          if (Object.keys(monthlyData).length === 12) {
            allMonthsComplete = true;
            annualTotal = Object.values(monthlyData).reduce((sum, data) => {
              const value = typeof data.response === 'number' ? data.response : parseFloat(data.response) || 0;
              return sum + value;
            }, 0);
          }
          
          existingResponse = monthlyResponses[0]; // Use first monthly response for answeredAt
        } else {
          // For annual or default, use annual response
          existingResponse = annualResponse;
        }
      } else {
        // For non-income questions, use simple lookup
        existingResponse = responseMap.get(question.questionId);
        isAnswered = !!existingResponse;
      }

      // For income questions, handle monthly/annual period
      let questionData = { ...question };
      
      // If it's an income question, add period context
      if (categoryKey === 'incomeanddeductions') {
        questionData.period = period || 'annually';
        questionData.supportsMonthly = true;
        questionData.supportsAnnually = true;
        
        // Add monthly data if available
        if (monthlyData) {
          questionData.monthlyData = monthlyData;
          questionData.annualTotal = annualTotal;
          questionData.allMonthsComplete = allMonthsComplete;
        }
      }

      questionsByCategory[categoryKey].questions.push({
        ...questionData,
        answered: isAnswered,
        existingResponse: existingResponse ? existingResponse.response : null,
        answeredAt: existingResponse ? existingResponse.updatedAt : null
      });
    });

    // Convert to array and sort by category order
    const categoryOrder = [
      'personalinformation',
      'employerinformation',
      'healthcare',
      'otherdeductions',
      'incomeanddeductions'
    ];

    const categories = categoryOrder
      .filter(key => questionsByCategory[key])
      .map(key => questionsByCategory[key])
      .concat(
        Object.keys(questionsByCategory)
          .filter(key => !categoryOrder.includes(key))
          .map(key => questionsByCategory[key])
      );

    // Calculate statistics
    const totalQuestions = allDetailedQuestions.length;
    const answeredQuestions = existingResponses.filter(r => 
      allDetailedQuestions.some(q => q.questionId === r.questionId)
    ).length;

    res.status(200).json({
      success: true,
      message: 'Detailed questions retrieved successfully',
      data: {
        profileId: profile.profileId,
        profileType: profile.profileType,
        year: profile.year,
        period: period || 'annually', // Default to annually
        categories: categories,
        statistics: {
          totalQuestions: totalQuestions,
          answeredQuestions: answeredQuestions,
          unansweredQuestions: totalQuestions - answeredQuestions,
          completionPercentage: totalQuestions > 0 
            ? Math.round((answeredQuestions / totalQuestions) * 100) 
            : 0
        }
      }
    });

  } catch (error) {
    console.error('Get all detailed questions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving detailed questions',
      error: error.message
    });
  }
};

// Helper function to get category display name
function getCategoryName(categoryKey) {
  const categoryNames = {
    'personalinformation': 'Personal Information',
    'employerinformation': 'Employer Information',
    'healthcare': 'Healthcare',
    'otherdeductions': 'Other Deductions',
    'incomeanddeductions': 'Income and Deductions'
  };
  return categoryNames[categoryKey] || categoryKey;
}

/**
 * Save income data with monthly/annual period support and auto-save
 * This endpoint is specifically for income questions that support monthly/annual periods
 */
const saveIncomeData = async (req, res) => {
  try {
    const { profileId } = req.params;
    const { questionId, response, period, month, year, autoSave } = req.body;

    if (!questionId || response === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Question ID and response are required'
      });
    }

    // Validate period
    if (period && !['monthly', 'annually'].includes(period)) {
      return res.status(400).json({
        success: false,
        message: 'Period must be either "monthly" or "annually"'
      });
    }

    // For monthly, month and year are required
    if (period === 'monthly') {
      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: 'Month and year are required for monthly period'
        });
      }
      if (month < 1 || month > 12) {
        return res.status(400).json({
          success: false,
          message: 'Month must be between 1 and 12'
        });
      }
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

    // Load questions to validate
    const questions = loadQuestions(profile.profileType);
    if (!questions) {
      return res.status(500).json({
        success: false,
        message: 'Error loading questions'
      });
    }

    // Flatten all questions to find the question definition
    const allDetailedQuestions = [];
    Object.values(questions.detailedQuestions.questionSets).forEach(set => {
      if (set.questions && Array.isArray(set.questions)) {
        allDetailedQuestions.push(...set.questions);
      } else {
        Object.values(set).forEach(nestedSet => {
          if (nestedSet && nestedSet.questions && Array.isArray(nestedSet.questions)) {
            allDetailedQuestions.push(...nestedSet.questions);
          }
        });
      }
    });

    const questionDef = allDetailedQuestions.find(q => q.questionId === questionId);

    if (!questionDef) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // Check if question is in incomeanddeductions category
    if (questionDef.categoryKey !== 'incomeanddeductions') {
      return res.status(400).json({
        success: false,
        message: 'This endpoint is only for income questions. Use /answer endpoint for other questions.'
      });
    }

    // Validate response
    const validationError = validateResponse(response, questionDef);
    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError
      });
    }

    // Build query for finding existing response
    const query = { 
      profileId: profile._id,
      questionId: questionId
    };

    if (period === 'monthly' && month && year) {
      query.period = 'monthly';
      query.month = month;
      query.year = year;
    } else {
      // For annually or default, use annually
      query.period = period || 'annually';
    }

    // Build update data
    const updateData = {
      profileId: profile._id,
      questionId: questionId,
      questionType: questionDef.questionType,
      response: response,
      tableData: questionDef.questionType === 'table' ? response : undefined,
      period: period || 'annually',
      updatedAt: Date.now()
    };

    if (period === 'monthly' && month && year) {
      updateData.month = month;
      updateData.year = year;
    } else if (period === 'annually' || !period) {
      updateData.year = profile.year; // Use profile year for annual
    }

    // Save or update response
    const questionResponse = await QuestionResponse.findOneAndUpdate(
      query,
      updateData,
      { 
        upsert: true, 
        new: true 
      }
    );

    // If monthly, calculate annual total if all months are filled
    let annualTotal = null;
    if (period === 'monthly' && questionDef.questionType === 'number') {
      const monthlyResponses = await QuestionResponse.find({
        profileId: profile._id,
        questionId: questionId,
        period: 'monthly',
        year: year
      });
      
      if (monthlyResponses.length === 12) {
        annualTotal = monthlyResponses.reduce((sum, r) => {
          const value = typeof r.response === 'number' ? r.response : parseFloat(r.response) || 0;
          return sum + value;
        }, 0);
      }
    }

    res.status(200).json({
      success: true,
      message: autoSave ? 'Income data auto-saved successfully' : 'Income data saved successfully',
      data: {
        responseId: questionResponse._id,
        questionId: questionId,
        response: response,
        period: period || 'annually',
        month: month || null,
        year: year || profile.year,
        annualTotal: annualTotal,
        savedAt: questionResponse.updatedAt
      }
    });

  } catch (error) {
    console.error('Save income data error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving income data',
      error: error.message
    });
  }
};


module.exports = {
  getBaseQuestions,
  answerBaseQuestions,
  answerQuestion,
  getNextQuestions: getNextQuestionsEndpoint,
  getResponses,
  getQuestionProgress,
  getAllDetailedQuestions,
  saveIncomeData
};

