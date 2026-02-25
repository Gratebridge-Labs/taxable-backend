const ProfileReview = require('../models/ProfileReview');
const TaxableProfile = require('../models/TaxableProfile');
const { validationResult } = require('express-validator');

/**
 * Request profile review (user creates review request)
 */
const requestProfileReview = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user?.userId;
    const { profileId } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Taxable profile not found'
      });
    }

    // Check if review already exists for this profile
    const existingReview = await ProfileReview.findOne({
      profileId: profile._id,
      status: { $in: ['pending', 'in_review'] }
    });

    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: 'A review request already exists for this profile',
        data: {
          reviewId: existingReview._id,
          status: existingReview.status
        }
      });
    }

    // Create review request
    const review = await ProfileReview.create({
      profileId: profile._id,
      requestedBy: userId,
      status: 'pending'
    });

    // Populate for response
    await review.populate('profileId', 'profileId profileType year status');
    await review.populate('requestedBy', 'firstName lastName email');

    res.status(201).json({
      success: true,
      message: 'Profile review requested successfully',
      data: {
        review: {
          id: review._id,
          profileId: review.profileId.profileId,
          status: review.status,
          requestedAt: review.requestedAt
        }
      }
    });

  } catch (error) {
    console.error('Request profile review error:', error);
    res.status(500).json({
      success: false,
      message: 'Error requesting profile review',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get user's review requests
 */
const getMyReviews = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const reviews = await ProfileReview.find({ requestedBy: userId })
      .populate('profileId', 'profileId profileType year status')
      .populate('reviewedBy', 'fullName email role')
      .sort({ requestedAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Review requests retrieved successfully',
      data: {
        reviews,
        count: reviews.length
      }
    });

  } catch (error) {
    console.error('Get my reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving review requests',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get a specific review
 */
const getReviewById = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?.userId;
    const isAdmin = req.admin?.adminId;

    const review = await ProfileReview.findById(reviewId)
      .populate('profileId', 'profileId profileType year status')
      .populate('requestedBy', 'firstName lastName email')
      .populate('reviewedBy', 'fullName email role');

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Users can only see their own reviews, admins can see all
    if (!isAdmin && review.requestedBy._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this review'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Review retrieved successfully',
      data: {
        review
      }
    });

  } catch (error) {
    console.error('Get review by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving review',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update review status (admin only)
 */
const updateReviewStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const adminId = req.admin?.adminId;
    const { reviewId } = req.params;
    const { status, reviewNotes } = req.body;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Admin access required'
      });
    }

    const review = await ProfileReview.findById(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Update review
    review.status = status;
    if (reviewNotes) {
      review.reviewNotes = reviewNotes;
    }
    review.reviewedBy = adminId;
    review.reviewedAt = Date.now();
    await review.save();

    // Populate for response
    await review.populate('profileId', 'profileId profileType year status');
    await review.populate('requestedBy', 'firstName lastName email');
    await review.populate('reviewedBy', 'fullName email role');

    res.status(200).json({
      success: true,
      message: 'Review status updated successfully',
      data: {
        review
      }
    });

  } catch (error) {
    console.error('Update review status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating review status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete review (admin only)
 */
const deleteReview = async (req, res) => {
  try {
    const adminId = req.admin?.adminId;
    const { reviewId } = req.params;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Admin access required'
      });
    }

    const review = await ProfileReview.findById(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    await ProfileReview.findByIdAndDelete(reviewId);

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully'
    });

  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting review',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  requestProfileReview,
  getMyReviews,
  getReviewById,
  updateReviewStatus,
  deleteReview
};

