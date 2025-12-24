const Account = require('../models/Account');
const User = require('../models/User');

// @desc    Get all accounts for current user
// @route   GET /api/accounts
// @access  Private
const getAccounts = async (req, res) => {
  try {
    const { accountType } = req.query;

    const query = { user: req.user._id, isActive: true };
    if (accountType) {
      query.accountType = accountType;
    }

    const accounts = await Account.find(query).sort({ isDefault: -1, createdAt: -1 });

    res.json({
      success: true,
      data: { accounts }
    });
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching accounts'
    });
  }
};

// @desc    Get single account by ID
// @route   GET /api/accounts/:id
// @access  Private
const getAccount = async (req, res) => {
  try {
    const { id } = req.params;

    const account = await Account.findOne({
      _id: id,
      user: req.user._id
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    res.json({
      success: true,
      data: { account }
    });
  } catch (error) {
    console.error('Get account error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching account'
    });
  }
};

// @desc    Create a new account
// @route   POST /api/accounts
// @access  Private
const createAccount = async (req, res) => {
  try {
    const {
      accountType,
      name,
      businessName,
      businessType,
      businessTIN,
      registrationNumber,
      businessAddress,
      tin,
      dateOfBirth,
      employmentStatus,
      phone,
      email
    } = req.body;

    if (!accountType || !name) {
      return res.status(400).json({
        success: false,
        message: 'Account type and name are required'
      });
    }

    if (!['individual', 'business'].includes(accountType)) {
      return res.status(400).json({
        success: false,
        message: 'Account type must be "individual" or "business"'
      });
    }

    // Validate business account fields
    if (accountType === 'business') {
      if (!businessName) {
        return res.status(400).json({
          success: false,
          message: 'Business name is required for business accounts'
        });
      }
    }

    // Check if this is the first account of this type
    const existingAccounts = await Account.countDocuments({
      user: req.user._id,
      accountType,
      isActive: true
    });

    const isDefault = existingAccounts === 0;

    // Create account
    const accountData = {
      user: req.user._id,
      accountType,
      name,
      isDefault,
      isActive: true
    };

    if (accountType === 'individual') {
      if (tin) accountData.tin = tin;
      if (dateOfBirth) accountData.dateOfBirth = dateOfBirth;
      if (employmentStatus) accountData.employmentStatus = employmentStatus;
    } else {
      accountData.businessName = businessName;
      if (businessType) accountData.businessType = businessType;
      if (businessTIN) accountData.businessTIN = businessTIN;
      if (registrationNumber) accountData.registrationNumber = registrationNumber;
      if (businessAddress) accountData.businessAddress = businessAddress;
    }

    if (phone) accountData.phone = phone;
    if (email) accountData.email = email;

    const account = await Account.create(accountData);

    // Update user's default individual account if this is the first individual account
    if (accountType === 'individual' && isDefault) {
      await User.findByIdAndUpdate(req.user._id, {
        defaultIndividualAccount: account._id
      });
    }

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: { account }
    });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating account'
    });
  }
};

// @desc    Update an account
// @route   PUT /api/accounts/:id
// @access  Private
const updateAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const account = await Account.findOne({
      _id: id,
      user: req.user._id
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Update allowed fields
    const allowedFields = [
      'name',
      'businessName',
      'businessType',
      'businessTIN',
      'registrationNumber',
      'businessAddress',
      'tin',
      'dateOfBirth',
      'employmentStatus',
      'phone',
      'email',
      'isDefault',
      'isActive',
      'metadata'
    ];

    const updates = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        updates[field] = updateData[field];
      }
    });

    // Handle isDefault update
    if (updates.isDefault && updates.isDefault !== account.isDefault) {
      // This will trigger the pre-save hook to unset other defaults
    }

    const updatedAccount = await Account.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Account updated successfully',
      data: { account: updatedAccount }
    });
  } catch (error) {
    console.error('Update account error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating account'
    });
  }
};

// @desc    Delete an account (soft delete)
// @route   DELETE /api/accounts/:id
// @access  Private
const deleteAccount = async (req, res) => {
  try {
    const { id } = req.params;

    const account = await Account.findOne({
      _id: id,
      user: req.user._id
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Check if this is the default account
    if (account.isDefault) {
      // Find another account of the same type to make default
      const alternativeAccount = await Account.findOne({
        user: req.user._id,
        accountType: account.accountType,
        _id: { $ne: id },
        isActive: true
      });

      if (alternativeAccount) {
        alternativeAccount.isDefault = true;
        await alternativeAccount.save();
      }
    }

    // Soft delete
    account.isActive = false;
    await account.save();

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error deleting account'
    });
  }
};

// @desc    Set default account
// @route   PATCH /api/accounts/:id/set-default
// @access  Private
const setDefaultAccount = async (req, res) => {
  try {
    const { id } = req.params;

    const account = await Account.findOne({
      _id: id,
      user: req.user._id,
      isActive: true
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    account.isDefault = true;
    await account.save();

    res.json({
      success: true,
      message: 'Default account set successfully',
      data: { account }
    });
  } catch (error) {
    console.error('Set default account error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error setting default account'
    });
  }
};

module.exports = {
  getAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  setDefaultAccount
};

