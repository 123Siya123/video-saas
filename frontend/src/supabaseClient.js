import { createClient } from '@supabase/supabase-js'

// REPLACE THESE WITH YOUR KEYS FROM SUPABASE WEBSITE
const supabaseUrl = 'https://zasbsaanmlsuytesxmsk.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphc2JzYWFubWxzdXl0ZXN4bXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwMTg5MTIsImV4cCI6MjA4MDU5NDkxMn0.54uZWk_BKzxOL_1CqdnhMkl6aw6qnB2SdJ5KPM7Y1rY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)