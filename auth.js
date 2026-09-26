import { supabaseClient } from './config.js';

export async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signUp(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) throw error;
  // data.session is null if the project requires email confirmation.
  return { user: data.user, session: data.session };
}

export async function signOut() {
  await supabaseClient.auth.signOut();
}

export async function getCurrentUser() {
  const { data } = await supabaseClient.auth.getUser();
  return data.user || null;
}

export function onAuthChange(callback) {
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    callback(session ? session.user : null);
  });
}
