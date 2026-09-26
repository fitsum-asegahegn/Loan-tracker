import { supabaseClient } from './config.js';
import { signIn, signOut, getCurrentUser, onAuthChange } from './auth.js';
import { getProfile, getLoans, createLoan, triggerForgiveness } from './db.js';
import { t } from './i18n.js';

let lang = localStorage.getItem('lang') || 'en';
let currentUser = null;
let currentProfile = null;
let selectedRole = null; // 'lender' | 'borrower', chosen on the login screen

const $ = (sel) => document.querySelector(sel);

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const YEARS_10_MS = MS_PER_DAY * 365.25 * 10;

function daysBetween(a, b) {
  return (b.getTime() - a.getTime()) / MS_PER_DAY;
}

// Option A: 1% per day, compounding daily
function dailyCompoundBalance(principal, days) {
  return principal * Math.pow(1.01, Math.max(days, 0));
}

// Option B: 5% per year, compounding yearly (fractional years allowed)
function yearlyCompoundBalance(principal, days) {
  const years = days / 365.25;
  return principal * Math.pow(1.05, Math.max(years, 0));
}

function formatETB(n) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n) + ' ETB';
}

function render() {
  document.documentElement.lang = lang;
  if (!currentUser) {
    renderLogin();
  } else {
    renderDashboard();
  }
}

function renderLogin() {
  $('#app').innerHTML = `
    <div class="card login-card">
      <h1>${t(lang, 'title')}</h1>
      <p class="subtitle">${t(lang, 'subtitle')}</p>
      <form id="login-form">
        <div class="role-picker">
          <span class="role-label">${t(lang, 'roleLabel')}</span>
          <div class="role-buttons">
            <button type="button" class="role-btn ${selectedRole === 'lender' ? 'selected' : ''}" data-role="lender">${t(lang, 'roleLender')}</button>
            <button type="button" class="role-btn ${selectedRole === 'borrower' ? 'selected' : ''}" data-role="borrower">${t(lang, 'roleBorrower')}</button>
          </div>
        </div>
        <label>${t(lang, 'email')}<input type="email" id="email" required /></label>
        <label>${t(lang, 'password')}<input type="password" id="password" required /></label>
        <button type="submit">${t(lang, 'login')}</button>
        <p id="login-error" class="error"></p>
      </form>
      <button class="lang-toggle" id="lang-toggle">${t(lang, 'lang')}</button>
    </div>
  `;
  document.querySelectorAll('.role-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedRole = btn.dataset.role;
      document.querySelectorAll('.role-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim();
    const password = $('#password').value;
    $('#login-error').textContent = '';

    if (!selectedRole) {
      $('#login-error').textContent = t(lang, 'roleLabel');
      return;
    }

    try {
      const user = await signIn(email, password);
      const profile = await getProfile(user.id);
      if (profile.role !== selectedRole) {
        await signOut();
        $('#login-error').textContent = t(lang, 'roleMismatch');
        return;
      }
    } catch (err) {
      $('#login-error').textContent = err.message;
    }
  });
  $('#lang-toggle').addEventListener('click', () => {
    lang = lang === 'en' ? 'am' : 'en';
    localStorage.setItem('lang', lang);
    render();
  });
}

async function renderDashboard() {
  const loans = await getLoans(currentUser.id);
  const profiles = {};
  try {
    const { data } = await supabaseClient.from('profiles').select('*');
    (data || []).forEach((p) => (profiles[p.id] = p));
  } catch (_) {}

  const isLender = currentProfile?.role === 'lender';
  const now = new Date();

  const loanCards = loans.length
    ? loans
        .map((loan) => {
          const start = new Date(loan.start_date);
          const days = daysBetween(start, now);
          const daily = dailyCompoundBalance(Number(loan.principal), days);
          const yearly = yearlyCompoundBalance(Number(loan.principal), days);
          const clause = loan.forgiveness_clause?.[0];
          const forgiven = clause?.triggered;
          const deadline = new Date(start.getTime() + YEARS_10_MS);
          const clauseExpired = now > deadline && !forgiven;
          const lenderName = profiles[loan.lender_id]?.display_name || 'Lender';
          const borrowerName = profiles[loan.borrower_id]?.display_name || 'Borrower';

          return `
          <div class="card loan-card ${forgiven ? 'forgiven' : ''}">
            <div class="loan-header">
              <span>${lenderName} → ${borrowerName}</span>
              <span class="principal">${formatETB(loan.principal)}</span>
            </div>
            ${loan.note ? `<p class="note">${loan.note}</p>` : ''}
            <p class="meta">${t(lang, 'startDate')}: ${loan.start_date} · ${Math.max(
              0,
              Math.floor(days)
            )} ${t(lang, 'daysElapsed')}</p>

            <div class="balances">
              <div class="balance-box">
                <div class="mode-label">${t(lang, 'dailyMode')}</div>
                <div class="balance-amount">${formatETB(daily)}</div>
              </div>
              <div class="balance-box">
                <div class="mode-label">${t(lang, 'yearlyMode')}</div>
                <div class="balance-amount">${formatETB(yearly)}</div>
              </div>
            </div>

            <div class="clause ${forgiven ? 'clause-forgiven' : clauseExpired ? 'clause-expired' : ''}">
              <strong>${t(lang, 'marriageClause')}</strong>
              <p>${t(lang, 'marriageClauseDesc')}</p>
              <p class="deadline">${t(lang, 'deadline')}: ${deadline.toISOString().slice(0, 10)}</p>
              ${
                forgiven
                  ? `<p class="status">${t(lang, 'forgiven')} (${t(lang, 'forgivenOn')} ${clause.triggered_date})</p>`
                  : clauseExpired
                  ? `<p class="status">${t(lang, 'expired')}</p>`
                  : `<p class="status">${t(lang, 'active')}</p>`
              }
              ${
                !forgiven && !isLender && currentUser.id === loan.borrower_id
                  ? `<button class="marry-btn" data-loan-id="${loan.id}">${t(lang, 'iGotMarried')}</button>`
                  : ''
              }
            </div>
          </div>
        `;
        })
        .join('')
    : `<p class="empty">${t(lang, 'noLoans')}</p>`;

  const newLoanForm = isLender
    ? `
    <div class="card">
      <h2>${t(lang, 'newLoan')}</h2>
      <form id="loan-form">
        <label>${t(lang, 'principal')}<input type="number" id="loan-principal" min="1" step="0.01" required /></label>
        <label>${t(lang, 'startDate')}<input type="date" id="loan-date" required /></label>
        <label>${t(lang, 'note')}<input type="text" id="loan-note" /></label>
        <button type="submit">${t(lang, 'submit')}</button>
      </form>
    </div>
  `
    : '';

  $('#app').innerHTML = `
    <header class="topbar">
      <h1>${t(lang, 'title')}</h1>
      <div class="topbar-actions">
        <button class="lang-toggle" id="lang-toggle">${t(lang, 'lang')}</button>
        <button class="signout-btn" id="signout-btn">${t(lang, 'signOut')}</button>
      </div>
    </header>
    <main>
      ${newLoanForm}
      ${loanCards}
    </main>
  `;

  $('#signout-btn').addEventListener('click', async () => {
    await signOut();
  });
  $('#lang-toggle').addEventListener('click', () => {
    lang = lang === 'en' ? 'am' : 'en';
    localStorage.setItem('lang', lang);
    render();
  });

  const loanForm = $('#loan-form');
  if (loanForm) {
    loanForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const principal = Number($('#loan-principal').value);
      const startDate = $('#loan-date').value;
      const note = $('#loan-note').value.trim();
      const borrower = Object.values(profiles).find((p) => p.role === 'borrower');
      await createLoan({
        lenderId: currentUser.id,
        borrowerId: borrower.id,
        principal,
        startDate,
        interestMode: 'daily_1pct',
        note,
      });
      render();
    });
  }

  document.querySelectorAll('.marry-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const loanId = btn.dataset.loanId;
      const today = new Date().toISOString().slice(0, 10);
      await triggerForgiveness(loanId, today);
      render();
    });
  });
}

async function init() {
  currentUser = await getCurrentUser();
  if (currentUser) {
    currentProfile = await getProfile(currentUser.id);
  }
  render();

  onAuthChange(async (user) => {
    currentUser = user;
    currentProfile = user ? await getProfile(user.id) : null;
    render();
  });
}

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
