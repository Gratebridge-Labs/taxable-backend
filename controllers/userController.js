const User = require('../models/User');

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching profile'
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, tin, dateOfBirth, employmentStatus } = req.body;

    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (tin !== undefined) updateData.tin = tin;
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth;
    if (employmentStatus !== undefined) updateData.employmentStatus = employmentStatus;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating profile'
    });
  }
};

// @desc    Update TIN
// @route   PATCH /api/users/tin
// @access  Private
const updateTIN = async (req, res) => {
  try {
    const { tin } = req.body;

    if (!tin) {
      return res.status(400).json({
        success: false,
        message: 'TIN is required'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { tin: tin.toUpperCase() },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'TIN updated successfully',
      data: { user }
    });
  } catch (error) {
    console.error('Update TIN error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating TIN'
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  updateTIN
};

