console.log('Script is running...');

// Check if dotenv works
require('dotenv').config();
console.log('Environment check:');
console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ Set' : '✗ Missing');
console.log('SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✓ Set' : '✗ Missing');

// Check if we can import Supabase
try {
  const { createClient } = require('@supabase/supabase-js');
  console.log('Supabase module: ✓ Loaded');
} catch (error) {
  console.log('Supabase module: ✗ Error:', error.message);
}

console.log('Debug test complete.');