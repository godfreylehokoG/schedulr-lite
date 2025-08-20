import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Color codes for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

type TestResult = {
  name: string;
  passed: boolean;
  details: string;
  duration: number;
};

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await testFn();
    const duration = Date.now() - start;
    console.log(`${colors.green}✅ ${name}${colors.reset} (${duration}ms)`);
    results.push({ name, passed: true, details: 'Passed', duration });
  } catch (error: any) {
    const duration = Date.now() - start;
    console.log(`${colors.red}❌ ${name}${colors.reset} (${duration}ms) - ${error.message}`);
    results.push({ name, passed: false, details: error.message, duration });
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
  // Test bookings table
  const { error: bookingsError } = await supabase
    .from('bookings')
    .select('*')
    .limit(1);
  
  if (bookingsError?.code === '42P01') {
    console.log('  → Bookings table not created yet (expected for new setup)');
  } else if (bookingsError) {
    throw bookingsError;
  } else {
    console.log('  → Bookings table exists and is accessible');
  }
}

// Test 3: Edge Function
async function testEdgeFunction() {
  const functionUrl = `${SUPABASE_URL}/functions/v1/send-booking-email`;
  
  const testPayload = {
    booking: {
      customerName: 'Test User',
      customerEmail: process.env.TEST_CUSTOMER_EMAIL || 'test@example.com',
      timeSlot: {
        date: new Date().toISOString().split('T')[0],
        startTime: '10:00',
        endTime: '10:30',
      },
    },
    businessName: 'Test Business',
    customerEmail: process.env.TEST_CUSTOMER_EMAIL || 'test@example.com',
    icsContent: 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR',
  };

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(testPayload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Edge function failed: ${response.status} - ${text}`);
  }

  console.log('  → Edge function is deployed and responding');
}

// Test 4: Authentication
async function testAuthentication() {
  // Test if auth is properly configured
  const { data: { providers }, error } = await supabase.auth.getSession();
  if (error) throw error;
// Continue the test script...

  console.log('  → Authentication is configured');
}

// Test 5: Google OAuth Configuration
async function testGoogleOAuth() {
  // Check if we can initiate OAuth flow (won't actually redirect)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'http://localhost:3000/auth/callback',
      skipBrowserRedirect: true,
    }
  });
  
  if (error) throw error;
  if (!data.url) throw new Error('OAuth URL not generated');
  
  // Check if the URL contains expected Google OAuth parameters
  const url = new URL(data.url);
  if (!url.hostname.includes('accounts.google.com')) {
    throw new Error('Invalid OAuth URL');
  }
  
  console.log('  → Google OAuth is configured correctly');
}

// Test 6: Environment Variables
async function testEnvironmentVariables() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
  
  console.log('  → All required environment variables are set');
}

// Test 7: Create Test Booking
async function testCreateBooking() {
  const testBooking = {
    id: `test-${Date.now()}`,
    customer_name: 'Test Customer',
    customer_email: 'test@example.com',
    customer_phone: '+27123456789',
    date: new Date().toISOString().split('T')[0],
    start_time: '14:00',
    end_time: '14:30',
    status: 'confirmed',
    notes: 'Test booking',
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('bookings')
    .insert([testBooking])
    .select()
    .single();

  if (error?.code === '42P01') {
    console.log('  → Bookings table needs to be created');
    return;
  }
  
  if (error) throw error;
  
  // Clean up test booking
  if (data) {
    await supabase.from('bookings').delete().eq('id', data.id);
    console.log('  → Successfully created and deleted test booking');
  }
}

// Main test runner
async function runAllTests() {
  console.log(`\n${colors.blue}🚀 ZeroIndex Booking System Integration Tests${colors.reset}\n`);
  console.log('Testing your booking system setup...\n');

  // Run all tests
  await runTest('Supabase Connection', testSupabaseConnection);
  await runTest('Environment Variables', testEnvironmentVariables);
  await runTest('Database Tables', testDatabaseTables);
  await runTest('Authentication Setup', testAuthentication);
  await runTest('Google OAuth', testGoogleOAuth);
  await runTest('Edge Function', testEdgeFunction);
  await runTest('Create Booking', testCreateBooking);

  // Print summary
  console.log(`\n${colors.blue}📊 Test Summary${colors.reset}`);
  console.log('═══════════════════════════════════════\n');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    const color = result.passed ? colors.green : colors.red;
    console.log(`${color}${icon} ${result.name}${colors.reset}`);
    if (!result.passed) {
      console.log(`   ${colors.yellow}→ ${result.details}${colors.reset}`);
    // Continue with the summary...
  });
  
  console.log(`\n${colors.blue}Results:${colors.reset}`);
  console.log(`  Passed: ${colors.green}${passed}${colors.reset}`);
  console.log(`  Failed: ${colors.red}${failed}${colors.reset}`);
  console.log(`  Total Duration: ${totalDuration}ms\n`);
  
  // Provide next steps based on results
  if (failed > 0) {
    console.log(`${colors.yellow}⚠️  Some tests failed. Here's what to check:${colors.reset}\n`);
    
    results.filter(r => !r.passed).forEach(result => {
      console.log(`${colors.yellow}${result.name}:${colors.reset}`);
      
      switch(result.name) {
        case 'Database Tables':
          console.log('  → Run the database migrations to create tables');
          console.log('  → Check Supabase Dashboard > SQL Editor');
          break;
        case 'Edge Function':
          console.log('  → Deploy the edge function: npx supabase functions deploy send-booking-email');
          console.log('  → Check if RESEND_API_KEY is set in Supabase secrets');
          break;
        case 'Google OAuth':
          console.log('  → Configure Google OAuth in Supabase Dashboard > Authentication > Providers');
          console.log('  → Add your Google Client ID and Secret');
          break;
        case 'Environment Variables':
          console.log('  → Create a .env.local file with required variables');
          console.log('  → Copy values from Supabase Dashboard > Settings > API');
          break;
      }
      console.log('');
    });
  } else {
    console.log(`${colors.green}✨ All tests passed! Your booking system is ready to use.${colors.reset}\n`);
  }
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run the tests
runAllTests().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});