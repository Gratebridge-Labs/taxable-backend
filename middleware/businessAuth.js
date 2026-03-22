/**
 * Middleware to verify business profile ownership and type.
 * Attaches req.businessProfile if valid.
 */
const TaxableProfile = require('../models/TaxableProfile');

const requireBusinessProfile = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!profileId) {
      return res.status(400).json({ success: false, message: 'profileId is required' });
    }

    const profile = await TaxableProfile.findOne({ _id: profileId, user: userId });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Tax profile not found or access denied' });
    }
    if (profile.profileType !== 'Business') {
      return res.status(400).json({ success: false, message: 'This endpoint is only available for Business profiles' });
    }

    req.businessProfile = profile;
    next();
  } catch (error) {
    console.error('[BusinessAuth] requireBusinessProfile error:', error);
    return res.status(500).json({ success: false, message: 'Error verifying business profile' });
  }
};

module.exports = { requireBusinessProfile };
