#!/bin/bash

echo "🔍 Checking ZeroIndex Booking System Setup..."
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "❌ .env.local file not found"
  echo "→ Create one with your Supabase credentials"
  exit 1
fi

# Load environment variables
export $(cat .env.local | grep -v '^#' | xargs)

# Run the test script
npx ts-node scripts/test-booking-full.ts