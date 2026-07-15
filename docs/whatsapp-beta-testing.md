# WhatsApp Bot Beta Testing Guide

## 🚀 Quick Start

### For Beta Testers
1. **Save the bot number**: [WhatsApp Business Number]
2. **Start conversation**: Send "Hi Taxable" to the bot
3. **Follow prompts**: The bot will guide you through options
4. **Test scenarios**: Try the predefined test scenarios below
5. **Report issues**: Use the bug report template

### For Developers/QA
```bash
# 1. Clone and setup
git clone [repository]
cd taxable-backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your WhatsApp tokens

# 3. Run tests
npm test  # Run all Jest tests
node scripts/test-all-flows.js +2348123456789  # Comprehensive test
node scripts/whatsapp-simulator.js +2348123456789  # Interactive testing
```

## 📱 Test Phone Numbers
Use these test numbers (or any valid WhatsApp number):

| Number | Purpose | Status |
|--------|---------|--------|
| `+2348123456789` | Primary testing | ✅ Active |
| `+2348098765432` | Secondary testing | ✅ Active |
| `+2348012345678` | Edge case testing | ✅ Active |

## 🔧 Testing Tools

### 1. Interactive Simulator
```bash
node scripts/whatsapp-simulator.js +2348123456789
```

**Features**:
- Real-time chat interface
- Color-coded messages
- Session state tracking
- Predefined test flows
- Command system

**Commands**:
- `help` - Show available commands
- `history` - Show conversation history
- `state` - Show current session state
- `reset` - Reset conversation
- `clear` - Clear screen
- `test [flow]` - Run predefined test flow
- `exit` - Exit simulator

### 2. Automated Test Runner
```bash
node scripts/test-all-flows.js +2348123456789
```

**Tests 5 flows**:
1. Welcome Flow
2. Full Registration
3. Login Flow
4. Main Menu Navigation
5. Quickstart Flow

### 3. Simple Test
```bash
node scripts/simple-whatsapp-test.js +2348123456789
```
Quick validation of basic functionality.

## 🎯 Test Scenarios

### Scenario 1: New User Journey
**Objective**: Complete onboarding as a new user

**Steps**:
1. Send "Hi Taxable" to bot
2. Choose "Create my account" (1)
3. Confirm (1)
4. Enter: `John Doe`
5. Enter: `john@test.com`
6. Confirm phone (1)
7. Enter password: `Password1`
8. Confirm password: `Password1`
9. Complete registration (1)

**Expected**: Welcome to main menu with 6 options

### Scenario 2: Returning User
**Objective**: Login and access features

**Steps**:
1. Send "Hi Taxable"
2. Choose "Login" (2)
3. Enter: `john@test.com`
4. Enter: `Password1`
5. Explore main menu options

**Expected**: Successful login and menu access

### Scenario 3: Quick Tax Estimate
**Objective**: Get tax estimate without registering

**Steps**:
1. Send "Hi Taxable"
2. Choose "Quickstart" (3)
3. Enter annual income: `5000000`
4. Enter state: `Lagos`
5. Confirm residency: `1` (Yes)
6. Enter monthly rent: `50000`
7. Enter health insurance: `100000`
8. Enter pension: `200000`

**Expected**: Tax estimate calculation

### Scenario 4: Error Handling
**Objective**: Test invalid inputs

**Steps**:
1. Send random text
2. Send numbers out of range
3. Send special characters
4. Send very long messages
5. Send empty messages

**Expected**: Helpful error messages and recovery

## 📊 What to Test

### Core Functionality
- [ ] Registration flow completion
- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Menu navigation
- [ ] Quickstart tax estimation
- [ ] Session persistence
- [ ] Conversation recovery

### User Experience
- [ ] Message clarity
- [ ] Response time (< 2 seconds)
- [ ] Error message helpfulness
- [ ] Flow intuitiveness
- [ ] Progress indication

### Technical Aspects
- [ ] Database persistence
- [ ] State management
- [ ] Input validation
- [ ] Error handling
- [ ] Performance under load

## 🐛 Bug Reporting

### When to Report
- Bot crashes or becomes unresponsive
- Incorrect calculations or data
- Missing or confusing instructions
- Broken navigation flows
- Data not saving correctly
- Performance issues

### How to Report
1. Use the bug report template
2. Include conversation logs
3. Note exact steps to reproduce
4. Specify severity and frequency
5. Attach screenshots if helpful

### Bug Report Location
```
docs/bug-report-template.md
```

## 📈 Success Metrics

### Quantitative
- **Response Time**: < 2 seconds average
- **Error Rate**: < 1% of messages
- **Completion Rate**: > 80% for key flows
- **Session Success**: > 95% session persistence

### Qualitative
- User understanding of prompts
- Ease of navigation
- Clarity of instructions
- Helpfulness of error messages

## 🔄 Testing Cycle

### Daily Testing (30 minutes)
1. Run automated test suite
2. Test 1-2 key scenarios manually
3. Check for regressions
4. Log any issues found

### Weekly Testing (2 hours)
1. Complete all test scenarios
2. Test edge cases
3. Review bug reports
4. Update test documentation

### Load Testing (Monthly)
1. Test with multiple concurrent users
2. Test database performance
3. Test API rate limits
4. Test recovery from failures

## 🛡️ Safety & Privacy

### Test Data Guidelines
- Use test email addresses (`@test.com`, `@example.com`)
- Use test phone numbers (provided above)
- Never use real personal information
- Clear test data after testing

### Data Handling
- Test data is isolated in test database
- No real user data is accessed
- All test data is deleted after tests
- No personal information is stored

## 📞 Support

### During Testing
- **Technical Issues**: Development team
- **Test Questions**: QA lead
- **Access Problems**: System administrator

### Communication Channels
- **Slack**: #whatsapp-beta-testing
- **Email**: beta-testing@taxable.ng
- **WhatsApp**: Beta testers group

### Escalation Path
1. Document issue in bug report
2. Post in Slack channel
3. Email if urgent (< 2 hour response)
4. Call if critical (< 30 minute response)

## 🎁 Incentives

### For Beta Testers
- Early access to features
- Recognition in release notes
- Priority support
- Beta tester badge

### For Finding Bugs
- Minor bugs: Recognition
- Major bugs: Special mention
- Critical bugs: Beta tester award

## 📅 Testing Timeline

### Week 1: Internal Testing
- Development team testing
- Automated test validation
- Documentation review

### Week 2: Limited Beta (5-10 testers)
- Trusted user testing
- Initial feedback collection
- Bug fixing iteration

### Week 3: Expanded Beta (20-50 testers)
- Broader user testing
- Performance testing
- Final validation

### Week 4: Production Readiness
- Final bug fixes
- Performance optimization
- Documentation finalization

## ✅ Checklist Before Production

### Technical
- [ ] All automated tests pass
- [ ] Performance benchmarks met
- [ ] Security review completed
- [ ] Backup systems tested

### User Experience
- [ ] All flows tested successfully
- [ ] Error handling validated
- [ ] Documentation complete
- [ ] Support processes ready

### Business
- [ ] Legal compliance verified
- [ ] Privacy policy updated
- [ ] Terms of service updated
- [ ] Marketing materials ready

---

## 🏁 Getting Started Now

1. **Set up your environment**
2. **Run the automated tests**
3. **Try the interactive simulator**
4. **Test at least 2 scenarios**
5. **File 1 bug report (even if minor)**

**Happy testing! 🎯**

*Last updated: March 25, 2026*
*Version: 1.0*