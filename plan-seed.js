// One-time setup script. Run in the browser console (on your deployed site,
// signed in as either user) once both auth accounts exist, to create their
// profile rows. Replace the UUIDs with the real auth.users ids (Authentication
// > Users in the Supabase dashboard).

import { supabaseClient } from './config.js';

export async function seedProfiles() {
  const { error } = await supabaseClient.from('profiles').upsert([
    {
      id: 'PHILEMON-AUTH-UUID-HERE',
      display_name: 'Philemon',
      role: 'lender',
    },
    {
      id: 'FITSUM-AUTH-UUID-HERE',
      display_name: 'Fitsum',
      role: 'borrower',
    },
  ]);
  if (error) throw error;
  console.log('Profiles seeded.');
}

// To run: open the console on your deployed app and call:
//   import('./plan-seed.js').then(m => m.seedProfiles())
