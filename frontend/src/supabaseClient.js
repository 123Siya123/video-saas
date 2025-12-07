import.meta.env
import { createClient } from '@supabase/supabase-js'

// REPLACE THESE WITH YOUR KEYS FROM SUPABASE WEBSITE
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)