import { supabaseClient } from './config.js';

export async function getProfile(userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function upsertProfile({ id, displayName, role }) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .upsert({ id, display_name: displayName, role })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getAllProfiles() {
  const { data, error } = await supabaseClient.from('profiles').select('*');
  if (error) throw error;
  return data;
}

export async function getLoans(userId) {
  const { data, error } = await supabaseClient
    .from('loans')
    .select('*, forgiveness_clause(*)')
    .or(`lender_id.eq.${userId},borrower_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createLoan({ lenderId, borrowerId, principal, startDate, interestMode, note }) {
  const { data, error } = await supabaseClient
    .from('loans')
    .insert({
      lender_id: lenderId,
      borrower_id: borrowerId,
      principal,
      start_date: startDate,
      interest_mode: interestMode,
      note,
    })
    .select()
    .single();
  if (error) throw error;

  // Every loan gets the marriage-forgiveness clause attached automatically
  const { error: clauseError } = await supabaseClient.from('forgiveness_clause').insert({
    loan_id: data.id,
    condition: 'fitsum_married_within_10_years',
  });
  if (clauseError) throw clauseError;

  return data;
}

export async function triggerForgiveness(loanId, dateMarried) {
  const { data, error } = await supabaseClient
    .from('forgiveness_clause')
    .update({ triggered: true, triggered_date: dateMarried })
    .eq('loan_id', loanId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markRepaid(loanId, repaidDate) {
  const { data, error } = await supabaseClient
    .from('loans')
    .update({ repaid: true, repaid_date: repaidDate })
    .eq('id', loanId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createLoanRequest({ borrowerId, lenderId, amount, reason }) {
  const { data, error } = await supabaseClient
    .from('loan_requests')
    .insert({ borrower_id: borrowerId, lender_id: lenderId, amount, reason })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getLoanRequests(userId) {
  const { data, error } = await supabaseClient
    .from('loan_requests')
    .select('*')
    .or(`borrower_id.eq.${userId},lender_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function respondToRequest(requestId, status) {
  const { data, error } = await supabaseClient
    .from('loan_requests')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', requestId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
