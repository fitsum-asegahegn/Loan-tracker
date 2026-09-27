import { supabaseClient } from './config.js';
import { signIn, signUp, signOut, getCurrentUser, onAuthChange } from './auth.js';
import { getProfile, upsertProfile, getLoans, createLoan, triggerForgiveness, markRepaid, createLoanRequest, getLoanRequests, respondToRequest } from './db.js';
import { t } from './i18n.js';

let lang = localStorage.getItem('lang') || 'en';
let currentUser = null;
let currentProfile = null;
let selectedRole = null; // 'lender' | 'borrower', chosen on the login/signup screen
let authMode = 'signin'; // 'signin' | 'signup'

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

function getFlavorKey(daysRemaining) {
  if (daysRemaining > 365 * 7) return 'flavorChill';
  if (daysRemaining > 365 * 3) return 'flavorRunway';
  if (daysRemaining > 365) return 'flavorTicking';
  if (daysRemaining > 30) return 'flavorEmergency';
  return 'flavorFinal';
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
  const isSignup = authMode === 'signup';
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
        ${
          isSignup
            ? `<label>${t(lang, 'displayName')}<input type="text" id="display-name" required /></label>`
            : ''
        }
        <label>${t(lang, 'email')}<input type="email" id="email" required /></label>
        <label>${t(lang, 'password')}<input type="password" id="password" required minlength="6" /></label>
        <button type="submit">${t(lang, isSignup ? 'signup' : 'login')}</button>
        <p id="login-error" class="error"></p>
        <p id="login-info" class="info"></p>
      </form>
      <button class="link-btn" id="mode-toggle">${t(lang, isSignup ? 'haveAccount' : 'noAccount')}</button>
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

  $('#mode-toggle').addEventListener('click', () => {
    authMode = isSignup ? 'signin' : 'signup';
    render();
  });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim();
    const password = $('#password').value;
    $('#login-error').textContent = '';
    $('#login-info').textContent = '';

    if (!selectedRole) {
      $('#login-error').textContent = t(lang, 'roleLabel');
      return;
    }

    try {
      if (isSignup) {
        const displayName = $('#display-name').value.trim();
        const { user, session } = await signUp(email, password);
        if (session) {
          await upsertProfile({ id: user.id, displayName, role: selectedRole });
          // onAuthChange will pick up the new session and render the dashboard.
        } else {
          $('#login-info').textContent = t(lang, 'checkEmail');
        }
      } else {
        const user = await signIn(email, password);
        let profile;
        try {
          profile = await getProfile(user.id);
        } catch (_) {
          // First sign-in with no profile row yet (e.g. email-confirm signup
          // flow) — create one now from the picked role.
          profile = await upsertProfile({
            id: user.id,
            displayName: selectedRole === 'lender' ? 'Philemon' : 'Fitsum',
            role: selectedRole,
          });
        }
        if (profile.role !== selectedRole) {
          await signOut();
          $('#login-error').textContent = t(lang, 'roleMismatch');
          return;
        }
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

  let requests = [];
  try {
    requests = await getLoanRequests(currentUser.id);
  } catch (_) {}

  const isLender = currentProfile?.role === 'lender';
  const now = new Date();

  const loanCards = loans.length
    ? loans
        .map((loan) => {
          const repaid = loan.repaid;
          const clause = loan.forgiveness_clause?.[0];
          const forgiven = clause?.triggered;
          const settled = repaid || forgiven;
          const start = new Date(loan.start_date);
          // Once settled, freeze the growing balance at the settlement date
          // instead of letting it keep compounding forever.
          const effectiveDate = repaid
            ? new Date(loan.repaid_date)
            : forgiven
            ? new Date(clause.triggered_date)
            : now;
          const days = daysBetween(start, effectiveDate);
          const daily = dailyCompoundBalance(Number(loan.principal), days);
          const yearly = yearlyCompoundBalance(Number(loan.principal), days);
          const deadline = new Date(start.getTime() + YEARS_10_MS);
          const clauseExpired = now > deadline && !settled;
          const msRemaining = deadline.getTime() - now.getTime();
          const daysRemaining = Math.max(0, Math.floor(msRemaining / MS_PER_DAY));
          const hoursRemaining = Math.max(
            0,
            Math.floor((msRemaining % MS_PER_DAY) / (1000 * 60 * 60))
          );
          const flavorKey = getFlavorKey(daysRemaining);
          const lenderName = profiles[loan.lender_id]?.display_name || 'Lender';
          const borrowerName = profiles[loan.borrower_id]?.display_name || 'Borrower';

          return `
          <div class="card loan-card ${settled ? 'forgiven' : ''}">
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

            ${
              repaid
                ? `<div class="clause clause-forgiven">
                    <p class="status">${t(lang, 'repaidStatus')} (${t(lang, 'repaidOn')} ${loan.repaid_date})</p>
                  </div>`
                : `<div class="clause ${forgiven ? 'clause-forgiven' : clauseExpired ? 'clause-expired' : ''}">
                    <strong>${t(lang, 'marriageClause')}</strong>
                    <p>${t(lang, 'marriageClauseDesc')}</p>
                    <p class="deadline">${t(lang, 'deadline')}: ${deadline.toISOString().slice(0, 10)}</p>
                    ${
                      !forgiven && !clauseExpired
                        ? `<div class="countdown-box">
                            <div class="countdown-number">${daysRemaining}<span class="countdown-unit">d</span> ${hoursRemaining}<span class="countdown-unit">h</span></div>
                            <div class="countdown-flavor">${t(lang, flavorKey)}</div>
                          </div>`
                        : ''
                    }
                    ${
                      forgiven
                        ? `<p class="status">${t(lang, 'forgiven')} (${t(lang, 'forgivenOn')} ${clause.triggered_date})</p>`
                        : clauseExpired
                        ? `<p class="status">${t(lang, 'expired')}</p>`
                        : ''
                    }
                    ${
                      !forgiven && !isLender && currentUser.id === loan.borrower_id
                        ? `<button class="marry-btn" data-loan-id="${loan.id}">${t(lang, 'iGotMarried')}</button>`
                        : ''
                    }
                  </div>`
            }
            ${
              isLender && !settled
                ? `<button class="repay-btn" data-loan-id="${loan.id}">${t(lang, 'markRepaid')}</button>`
                : ''
            }
          </div>
        `;
        })
        .join('')
    : `<p class="empty">${t(lang, 'noLoans')}</p>`;

  const borrowers = Object.values(profiles).filter((p) => p.role === 'borrower');
  const newLoanOpen = localStorage.getItem('newLoanOpen') !== 'false';
  const newLoanForm = isLender
    ? `
    <div class="card">
      <button type="button" class="collapsible-header" id="new-loan-toggle">
        <h2>${t(lang, 'newLoan')}</h2>
        <span class="chevron ${newLoanOpen ? 'open' : ''}">▾</span>
      </button>
      <div class="collapsible-body" id="new-loan-body" style="${newLoanOpen ? '' : 'display:none'}">
        ${
          borrowers.length > 1
            ? `<p class="error">${t(lang, 'duplicateBorrowers')}</p>`
            : ''
        }
        <form id="loan-form">
          <label>${t(lang, 'principal')}<input type="number" id="loan-principal" min="1" step="0.01" required /></label>
          <label>${t(lang, 'startDate')}<input type="date" id="loan-date" required /></label>
          <label>${t(lang, 'note')}<input type="text" id="loan-note" /></label>
          <button type="submit">${t(lang, 'submit')}</button>
          <p id="loan-error" class="error"></p>
        </form>
      </div>
    </div>
  `
    : '';

  const pendingRequests = requests.filter(
    (r) => r.status === 'pending' && r.lender_id === currentUser.id
  );
  const pendingSection =
    isLender && pendingRequests.length
      ? `
    <div class="card">
      <h2>${t(lang, 'pendingRequests')}</h2>
      ${pendingRequests
        .map((r) => {
          const borrowerName = profiles[r.borrower_id]?.display_name || 'Fitsum';
          return `
          <div class="request-card">
            <p class="request-line">😩 <strong>${borrowerName}</strong> ${t(lang, 'isBegging')} <span class="request-amount">${formatETB(r.amount)}</span></p>
            ${r.reason ? `<p class="note">"${r.reason}"</p>` : ''}
            <div class="request-actions">
              <button class="approve-btn" data-request-id="${r.id}" data-amount="${r.amount}" data-reason="${(r.reason || '').replace(/"/g, '&quot;')}" data-borrower-id="${r.borrower_id}">${t(lang, 'approve')}</button>
              <button class="decline-btn" data-request-id="${r.id}">${t(lang, 'decline')}</button>
            </div>
          </div>
        `;
        })
        .join('')}
    </div>
  `
      : '';

  const requestOpen = localStorage.getItem('requestOpen') !== 'false';
  const myRequests = requests.filter((r) => r.borrower_id === currentUser.id);
  const requestHistory = myRequests
    .map((r) => {
      const statusKey =
        r.status === 'pending'
          ? 'statusPending'
          : r.status === 'approved'
          ? 'statusApproved'
          : 'statusDeclined';
      return `<p class="request-history-line">${formatETB(r.amount)} — ${t(lang, statusKey)}</p>`;
    })
    .join('');
  const requestForm = !isLender
    ? `
    <div class="card">
      <button type="button" class="collapsible-header" id="request-toggle">
        <h2>${t(lang, 'requestLoan')}</h2>
        <span class="chevron ${requestOpen ? 'open' : ''}">▾</span>
      </button>
      <div class="collapsible-body" id="request-body" style="${requestOpen ? '' : 'display:none'}">
        <form id="request-form">
          <label>${t(lang, 'requestAmount')}<input type="number" id="request-amount" min="1" step="0.01" required /></label>
          <label>${t(lang, 'requestReason')}<input type="text" id="request-reason" /></label>
          <button type="submit">${t(lang, 'sendRequest')}</button>
          <p id="request-error" class="error"></p>
          <p id="request-info" class="info"></p>
        </form>
        ${myRequests.length ? `<div class="request-history">${requestHistory}</div>` : ''}
      </div>
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
      ${pendingSection}
      ${newLoanForm}
      ${requestForm}
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

  const newLoanToggle = $('#new-loan-toggle');
  if (newLoanToggle) {
    newLoanToggle.addEventListener('click', () => {
      const body = $('#new-loan-body');
      const chevron = newLoanToggle.querySelector('.chevron');
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : '';
      chevron.classList.toggle('open', !isOpen);
      localStorage.setItem('newLoanOpen', String(!isOpen));
    });
  }

  const loanForm = $('#loan-form');
  if (loanForm) {
    loanForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      $('#loan-error').textContent = '';
      const principal = Number($('#loan-principal').value);
      const startDate = $('#loan-date').value;
      const note = $('#loan-note').value.trim();
      const borrower = Object.values(profiles).find((p) => p.role === 'borrower');

      if (!borrower) {
        $('#loan-error').textContent = t(lang, 'noBorrowerYet');
        return;
      }

      try {
        await createLoan({
          lenderId: currentUser.id,
          borrowerId: borrower.id,
          principal,
          startDate,
          interestMode: 'daily_1pct',
          note,
        });
        render();
      } catch (err) {
        $('#loan-error').textContent = err.message;
      }
    });
  }

  document.querySelectorAll('.marry-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const loanId = btn.dataset.loanId;
      const today = new Date().toISOString().slice(0, 10);
      try {
        await triggerForgiveness(loanId, today);
        render();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  document.querySelectorAll('.repay-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(t(lang, 'confirmRepaid'))) return;
      const loanId = btn.dataset.loanId;
      const today = new Date().toISOString().slice(0, 10);
      try {
        await markRepaid(loanId, today);
        render();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  const requestToggle = $('#request-toggle');
  if (requestToggle) {
    requestToggle.addEventListener('click', () => {
      const body = $('#request-body');
      const chevron = requestToggle.querySelector('.chevron');
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : '';
      chevron.classList.toggle('open', !isOpen);
      localStorage.setItem('requestOpen', String(!isOpen));
    });
  }

  const requestForm2 = $('#request-form');
  if (requestForm2) {
    requestForm2.addEventListener('submit', async (e) => {
      e.preventDefault();
      $('#request-error').textContent = '';
      $('#request-info').textContent = '';
      const amount = Number($('#request-amount').value);
      const reason = $('#request-reason').value.trim();
      const lender = Object.values(profiles).find((p) => p.role === 'lender');

      if (!lender) {
        $('#request-error').textContent = t(lang, 'noLenderYet');
        return;
      }

      try {
        await createLoanRequest({
          borrowerId: currentUser.id,
          lenderId: lender.id,
          amount,
          reason,
        });
        $('#request-info').textContent = t(lang, 'requestSent');
        requestForm2.reset();
        render();
      } catch (err) {
        $('#request-error').textContent = err.message;
      }
    });
  }

  document.querySelectorAll('.approve-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const requestId = btn.dataset.requestId;
      const amount = Number(btn.dataset.amount);
      const reason = btn.dataset.reason;
      const borrowerId = btn.dataset.borrowerId;
      const today = new Date().toISOString().slice(0, 10);
      try {
        await createLoan({
          lenderId: currentUser.id,
          borrowerId,
          principal: amount,
          startDate: today,
          interestMode: 'daily_1pct',
          note: reason,
        });
        await respondToRequest(requestId, 'approved');
        render();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  document.querySelectorAll('.decline-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const requestId = btn.dataset.requestId;
      try {
        await respondToRequest(requestId, 'declined');
        render();
      } catch (err) {
        alert(err.message);
      }
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
