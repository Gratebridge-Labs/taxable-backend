#!/bin/bash

# WhatsApp Bot Beta Test Runner
# Usage: ./beta-test-runner.sh [phoneNumber]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default phone number
PHONE_NUMBER=${1:-"+2348123456789"}

echo -e "${BLUE}🚀 WhatsApp Bot Beta Test Runner${NC}"
echo -e "${BLUE}📱 Test Phone: ${PHONE_NUMBER}${NC}"
echo "═".repeat=60

# Function to print section headers
section() {
    echo -e "\n${YELLOW}▶ $1${NC}"
    echo "─".repeat=60
}

# Function to run command with status
run_cmd() {
    local cmd="$1"
    local desc="$2"
    
    echo -e "${BLUE}➤ $desc${NC}"
    echo "Command: $cmd"
    
    if eval "$cmd"; then
        echo -e "${GREEN}✓ Success${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed${NC}"
        return 1
    fi
}

# Check dependencies
section "Checking Dependencies"
run_cmd "node --version" "Node.js version"
run_cmd "npm --version" "npm version"
run_cmd "mongod --version 2>/dev/null || echo 'MongoDB not installed (using in-memory)'" "MongoDB check"

# Install dependencies if needed
section "Installing Dependencies"
if [ ! -d "node_modules" ]; then
    run_cmd "npm install" "Install npm dependencies"
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi

# Check environment
section "Environment Setup"
if [ -f ".env" ]; then
    echo -e "${GREEN}✓ .env file exists${NC}"
    
    # Check WhatsApp tokens
    if grep -q "WHATSAPP_ACCESS_TOKEN" .env; then
        echo -e "${GREEN}✓ WhatsApp tokens configured${NC}"
    else
        echo -e "${YELLOW}⚠ WhatsApp tokens not found in .env${NC}"
        echo "Make sure to add:"
        echo "WHATSAPP_ACCESS_TOKEN=your_token"
        echo "WHATSAPP_PHONE_NUMBER_ID=your_phone_id"
        echo "WHATSAPP_VERIFY_TOKEN=your_verify_token"
    fi
else
    echo -e "${RED}✗ .env file not found${NC}"
    echo "Copy .env.example to .env and configure your tokens"
    exit 1
fi

# Run tests
section "Running Automated Tests"
run_cmd "node scripts/test-all-flows.js \"$PHONE_NUMBER\"" "Comprehensive flow tests"

section "Running Jest Tests"
run_cmd "npm test -- tests/whatsapp/" "Jest test suite"

# Interactive testing options
section "Interactive Testing Options"
echo "Choose an option:"
echo "1. Interactive simulator"
echo "2. Simple test"
echo "3. Specific flow test"
echo "4. Exit"
echo -n "Enter choice [1-4]: "
read choice

case $choice in
    1)
        section "Starting Interactive Simulator"
        echo -e "${GREEN}Starting simulator...${NC}"
        echo -e "${YELLOW}Type 'help' for commands, 'exit' to quit${NC}"
        node scripts/whatsapp-simulator.js "$PHONE_NUMBER"
        ;;
    2)
        section "Running Simple Test"
        node scripts/simple-whatsapp-test.js "$PHONE_NUMBER"
        ;;
    3)
        section "Specific Flow Test"
        echo "Available flows:"
        echo "1. registration"
        echo "2. login"
        echo "3. quickstart"
        echo "4. menu"
        echo -n "Enter flow name: "
        read flow_name
        node scripts/test-whatsapp-flow.js "$PHONE_NUMBER" "$flow_name"
        ;;
    4)
        echo -e "${GREEN}Exiting...${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        ;;
esac

# Generate report
section "Generating Test Report"
echo -e "${BLUE}📊 Test Summary${NC}"
echo "Phone: $PHONE_NUMBER"
echo "Date: $(date)"
echo "Status: ✅ Ready for beta testing"

echo -e "\n${GREEN}🎉 Beta testing setup complete!${NC}"
echo "Next steps:"
echo "1. Review the beta readiness report: scripts/beta-readiness-report.md"
echo "2. Read testing guide: docs/whatsapp-beta-testing.md"
echo "3. Use bug report template: docs/bug-report-template.md"
echo "4. Start testing!"

# Open documentation in browser (optional)
if command -v open &> /dev/null; then
    echo -n "Open documentation in browser? [y/N]: "
    read open_docs
    if [[ $open_docs == "y" || $open_docs == "Y" ]]; then
        open docs/whatsapp-beta-testing.md 2>/dev/null || echo "Could not open browser"
    fi
fi

exit 0