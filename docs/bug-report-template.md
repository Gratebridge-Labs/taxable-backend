# WhatsApp Bot Bug Report Template

## 🐛 Bug Report

### Basic Information
- **Date & Time**: [When did the issue occur?]
- **Tester Name**: [Your name]
- **Phone Number**: [Test phone number]
- **Environment**: [Production/Staging/Development]

### Issue Description
**Title**: [Brief, descriptive title]

**Description**:
[Clear description of what happened]

**Expected Behavior**:
[What should have happened]

**Actual Behavior**:
[What actually happened]

### Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]
4. [Step 4]

### Screenshots/Logs
```
[Paste relevant conversation logs here]
```

Or attach screenshots of the conversation.

### Technical Details
- **Bot State**: [What was the bot's last known state?]
- **User Input**: [What did you type?]
- **Bot Response**: [What did the bot reply?]
- **Error Messages**: [Any error messages shown?]

### Severity
- [ ] **Critical**: Bot crashes, cannot proceed
- [ ] **High**: Major functionality broken
- [ ] **Medium**: Minor issue, workaround exists
- [ ] **Low**: Cosmetic or minor issue

### Frequency
- [ ] **Always**: Happens every time
- [ ] **Often**: Happens frequently
- [ ] **Sometimes**: Happens occasionally
- [ ] **Rarely**: Happens infrequently
- [ ] **Once**: Only happened once

### Additional Context
[Any other relevant information]

---

## 📋 Test Scenario Template

### Scenario: [Scenario Name]
**Objective**: [What are we testing?]

**Preconditions**:
- [Prerequisite 1]
- [Prerequisite 2]

**Test Steps**:
1. [Step 1 with expected result]
2. [Step 2 with expected result]
3. [Step 3 with expected result]

**Test Data**:
- Phone: [Test phone number]
- Email: [Test email]
- Other: [Other test data]

**Pass Criteria**:
- [ ] All steps completed successfully
- [ ] Expected results match actual results
- [ ] No errors encountered

**Notes**:
[Any observations or comments]

---

## 🔍 Common Test Scenarios

### 1. New User Registration
**Objective**: Test complete registration flow

**Steps**:
1. Send "Hi Taxable" to bot
2. Select "Create my account" (option 1)
3. Confirm account creation (option 1)
4. Enter full name
5. Enter email address
6. Confirm phone number (option 1)
7. Create password
8. Confirm password
9. Complete registration

**Expected**: User receives welcome message and can access main menu

### 2. Existing User Login
**Objective**: Test login with existing account

**Steps**:
1. Send "Hi Taxable" to bot
2. Select "Login" (option 2)
3. Enter registered email
4. Enter password

**Expected**: User successfully logs in and sees main menu

### 3. Quick Tax Estimation
**Objective**: Test quickstart without registration

**Steps**:
1. Send "Hi Taxable" to bot
2. Select "Quickstart" (option 3)
3. Enter annual income
4. Enter state of residence
5. Confirm residency status
6. Enter monthly rent
7. Enter health insurance amount
8. Enter pension contribution

**Expected**: Bot provides tax estimation

### 4. Menu Navigation
**Objective**: Test all main menu options

**Steps**:
1. Complete registration or login
2. Navigate through all menu options:
   - Create tax profile
   - View existing profiles
   - Connect bank account
   - Subscription plans
   - Help & support
   - Account settings

**Expected**: All menu options work correctly

### 5. Error Handling
**Objective**: Test invalid inputs

**Steps**:
1. Send invalid commands
2. Send unexpected inputs at each step
3. Test boundary conditions
4. Test special characters

**Expected**: Bot provides helpful error messages and recovers gracefully

---

## 📊 Test Results Log

| Date | Scenario | Result | Issues | Tester |
|------|----------|--------|--------|--------|
| [Date] | [Scenario] | ✅ Pass / ❌ Fail | [Issues] | [Tester] |
| [Date] | [Scenario] | ✅ Pass / ❌ Fail | [Issues] | [Tester] |
| [Date] | [Scenario] | ✅ Pass / ❌ Fail | [Issues] | [Tester] |

---

## 🎯 Feedback Categories

### User Experience
- [ ] Conversation flow is intuitive
- [ ] Instructions are clear
- [ ] Response time is acceptable
- [ ] Error messages are helpful

### Functionality
- [ ] All features work as expected
- [ ] Data is saved correctly
- [ ] Navigation works smoothly
- [ ] Edge cases are handled well

### Performance
- [ ] Bot responds quickly
- [ ] No timeouts or delays
- [ ] Handles multiple messages well
- [ ] Stable connection

### Suggestions
[Any suggestions for improvement]

---

*Template version: 1.0*
*Last updated: March 25, 2026*