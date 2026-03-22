/**
 * NIN Verification Controller
 * Stub endpoints for NIN verification since no external NIN service is integrated
 */

/**
 * Verify NIN (stub endpoint)
 * POST /taxableprofile/web/nin/verify
 * Body: { nin: string, firstName: string, lastName: string, dateOfBirth: string }
 */
const verifyNIN = async (req, res) => {
  try {
    const { nin, firstName, lastName, dateOfBirth } = req.body;

    // Basic validation
    if (!nin) {
      return res.status(400).json({
        success: false,
        message: 'NIN is required'
      });
    }

    // Validate NIN format (11 digits)
    const ninRegex = /^[0-9]{11}$/;
    if (!ninRegex.test(nin)) {
      return res.status(400).json({
        success: false,
        message: 'NIN must be exactly 11 digits'
      });
    }

    // This is a stub implementation since no external NIN service is integrated
    // In a real implementation, you would call an external NIN verification API here
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock verification response
    // For demo purposes, we'll accept any valid format NIN
    const isVerified = true;
    const verificationId = `VER${Date.now()}${Math.floor(Math.random() * 1000)}`;

    res.status(200).json({
      success: true,
      message: 'NIN verification initiated (stub)',
      data: {
        nin,
        verificationId,
        status: 'pending',
        estimatedCompletion: '2-5 minutes',
        note: 'This is a stub endpoint. In production, this would call an external NIN verification service.'
      }
    });
  } catch (error) {
    console.error('Verify NIN error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during NIN verification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Check NIN verification status (stub endpoint)
 * GET /taxableprofile/web/nin/status/:nin
 */
const getNINStatus = async (req, res) => {
  try {
    const { nin } = req.params;

    // Validate NIN format
    const ninRegex = /^[0-9]{11}$/;
    if (!ninRegex.test(nin)) {
      return res.status(400).json({
        success: false,
        message: 'NIN must be exactly 11 digits'
      });
    }

    // This is a stub implementation
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock status response
    // For demo purposes, we'll return a verified status for any valid NIN
    const statuses = ['pending', 'verified', 'failed'];
    const mockStatus = 'verified'; // Always return verified for stub
    
    const response = {
      success: true,
      data: {
        nin,
        status: mockStatus,
        verifiedAt: mockStatus === 'verified' ? new Date().toISOString() : null,
        details: mockStatus === 'verified' ? {
          firstName: 'John',
          lastName: 'Doe',
          middleName: 'A.',
          dateOfBirth: '1985-05-15',
          gender: 'male',
          stateOfOrigin: 'Lagos',
          phoneNumber: '08012345678',
          address: '123 Sample Street, Lagos'
        } : null,
        note: 'This is a stub endpoint. In production, this would return real verification status from an external service.'
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Get NIN status error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while checking NIN status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Bulk verify NINs (stub endpoint)
 * POST /taxableprofile/web/nin/verify-bulk
 * Body: { nins: Array<{ nin: string, firstName: string, lastName: string }> }
 */
const verifyNINBulk = async (req, res) => {
  try {
    const { nins } = req.body;

    if (!Array.isArray(nins) || nins.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'nins array is required and must not be empty'
      });
    }

    if (nins.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 100 NINs allowed per bulk request'
      });
    }

    // Validate each NIN
    const invalidNINs = [];
    nins.forEach((item, index) => {
      if (!item.nin || !/^[0-9]{11}$/.test(item.nin)) {
        invalidNINs.push({
          index,
          nin: item.nin,
          error: 'NIN must be exactly 11 digits'
        });
      }
    });

    if (invalidNINs.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Some NINs are invalid',
        data: { invalidNINs }
      });
    }

    // This is a stub implementation
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock bulk verification response
    const results = nins.map((item, index) => {
      const verificationId = `BULK${Date.now()}${index}${Math.floor(Math.random() * 1000)}`;
      const status = 'verified'; // Always return verified for stub
      
      return {
        nin: item.nin,
        verificationId,
        status,
        verifiedAt: status === 'verified' ? new Date().toISOString() : null,
        details: status === 'verified' ? {
          firstName: item.firstName || 'John',
          lastName: item.lastName || 'Doe',
          match: item.firstName && item.lastName ? 'partial' : 'not_verified'
        } : null
      };
    });

    res.status(200).json({
      success: true,
      message: 'Bulk NIN verification initiated (stub)',
      data: {
        total: nins.length,
        processed: nins.length,
        results,
        note: 'This is a stub endpoint. In production, this would call an external NIN verification service.'
      }
    });
  } catch (error) {
    console.error('Verify NIN bulk error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during bulk NIN verification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  verifyNIN,
  getNINStatus,
  verifyNINBulk
};