// Fill these in from your Supabase project settings (Project Settings > API)
export const SUPABASE_URL = 'https://uzgeoezhktgvakqlthzb.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6Z2VvZXpoa3RndmFrcWx0aHpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MjY0OTQsImV4cCI6MjEwNjAwMjQ5NH0.EB3KK55TrTCgfn3HD7bmFXARfvE_1vBOkfVgyuzDxIk';

export const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
