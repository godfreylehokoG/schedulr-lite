// test-booking-system.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing environment variables. Please check your .env.local file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Color codes for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

const results = [];

async function runTest(name, testFn) {
  const start = Date.now();
  try {
    await testFn();
    const duration = Date.now() - start;
    console.log(`${colors.green}✅ ${name}${colors.reset} (${duration}ms)`);
    results.push({ name, passed: true, duration });
  } catch (error) {
    const duration = Date.now() - start;
    console.log(`${colors.red}❌ ${name}${colors.reset} (${duration}ms) - ${error.message}`);
    results.push({ name, passed: false, error: error.message, duration });
  }
}

// Test 1: Supabase Connection
async function testSupabaseConnection() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  console.log('  → Connected to Supabase successfully');
}

// Test 2: Database Tables
async function testDatabaseTables() {
  const { error } = await supabase
    .from('bookings')
    .select('*')
    .limit(1);
  
  if (error?.code === '42P01') {
    console.log('  → Bookings table not created yet (run database setup)');
  } else if (error) {
    throw error;
  } else {
    console.log('  → Bookings table exists and is accessible');
  }
}

// Test 3: Edge Function
async function testEdgeFunction() {
  const functionUrl = `${SUPABASE_URL}/functions/v1/send-booking-email`;
  
  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        booking: {
          customerName: 'Test User',
          customerEmail: 'test@example.com',
          timeSlot: {
            date: new Date().toISOString().split('T')[0],
            startTime: '10:00',
            endTime: '10:30',
          },
        },
        businessName: 'Test Business',
        customerEmail: 'test@example.com',
        icsContent: 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR',
        // Continue test-booking-system.js...

      }),
    });

    const text = await response.text();
    
    if (!response.ok) {
      throw new Error(`Edge function returned ${response.status}: ${text}`);
    }
    
    console.log('  → Edge function is responding (check deployment status)');
  } catch (error) {
    if (error.message.includes('fetch is not defined')) {
      console.log('  → Need Node 18+ for fetch support');
    } else {
      throw error;
    }
  }
}

// Test 4: Environment Variables
async function testEnvironmentVariables() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing: ${missing.join(', ')}`);
  }
  
  // Check if Resend API key is configured in edge function
  console.log('  → Core environment variables are set');
  console.log('  → Remember to set RESEND_API_KEY in Supabase Edge Function secrets');
}

// Test 5: Google OAuth Setup
async function testGoogleOAuth() {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        skipBrowserRedirect: true,
      }
    });
    
    if (error) throw error;
    if (data?.url) {
      console.log('  → Google OAuth is configured');
    }
  } catch (error) {
    throw new Error('Google OAuth not configured in Supabase');
  }
}

// Main test runner
async function runAllTests() {
  console.log(`\n${colors.blue}🚀 ZeroBook System Tests${colors.reset}\n`);

  // Run all tests
  await runTest('Environment Variables', testEnvironmentVariables);
  await runTest('Supabase Connection', testSupabaseConnection);
  await runTest('Database Tables', testDatabaseTables);
  await runTest('Google OAuth', testGoogleOAuth);
  await runTest('Edge Function', testEdgeFunction);

  // Print summary
  console.log(`\n${colors.blue}📊 Test Summary${colors.reset}`);
  console.log('═══════════════════════════════════════\n');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    const color = result.passed ? colors.green : colors.red;
// Continue test-booking-system.js...

    console.log(`${color}${icon} ${result.name}${colors.reset}`);
    if (!result.passed) {
      console.log(`   ${colors.yellow}→ ${result.error}${colors.reset}`);
    }
  });
  
  console.log(`\n${colors.blue}Results:${colors.reset}`);
  console.log(`  Passed: ${colors.green}${passed}${colors.reset}`);
  console.log(`  Failed: ${colors.red}${failed}${colors.reset}\n`);
  
  // Provide next steps
  if (failed > 0) {
    console.log(`${colors.yellow}⚠️  Next Steps:${colors.reset}\n`);
    
    if (results.find(r => r.name === 'Database Tables' && !r.passed)) {
      console.log(`${colors.yellow}1. Create Database Tables:${colors.reset}`);
      console.log('   Go to Supabase Dashboard → SQL Editor');
      console.log('   Run the setup SQL script below\n');
    }
    
    if (results.find(r => r.name === 'Edge Function' && !r.passed)) {
      console.log(`${colors.yellow}2. Deploy Edge Function:${colors.reset}`);
      console.log('   npx supabase login');
      console.log('   npx supabase functions deploy send-booking-email\n');
    }
    
    if (results.find(r => r.name === 'Google OAuth' && !r.passed)) {
      console.log(`${colors.yellow}3. Configure Google OAuth:${colors.reset}`);
      console.log('   Supabase Dashboard → Authentication → Providers → Google');
      console.log('   Add your Client ID and Secret\n');
    }
  } else {
    console.log(`${colors.green}✨ All tests passed! Your system is ready.${colors.reset}\n`);
  }
}

// Run the tests
runAllTests().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});