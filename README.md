# Fitsum's Debt Tracker 😅

A very serious PWA for a very unserious loan agreement between Fitsum and Philemon.

Philemon lends Fitsum money. The app tracks what's owed under two compounding
schemes side by side:

- **Option A — 1% daily, compounding daily**
- **Option B — 5% yearly, compounding yearly**

There's one escape hatch: if Fitsum gets married within 10 years of a loan's
start date, that loan is forgiven in full. Each loan shows a countdown to that
10-year deadline, and the borrower can mark "I got married 🎉" to trigger it.

## Stack

- Vanilla JS PWA (no build step) — `index.html` + ES modules
- Supabase for auth (email/password) and Postgres storage
- Offline shell caching via `sw.js`

## Setup

1. Create a Supabase project.
2. In **Authentication > Users**, manually create two accounts (one for
   Fitsum, one for Philemon).
3. In the **SQL Editor**, run `supabase-schema.sql`.
4. Copy each user's UUID from Authentication > Users into `plan-seed.js`,
   then after deploying, run it once from the browser console (see the
   comment at the bottom of that file) to create their profile rows.
5. Fill in `config.js` with your project's URL and anon public key
   (Project Settings > API).
6. Push this repo to GitHub, then in Vercel: **New Project > Import Git
   Repository**, select the repo, no build command needed (static site),
   deploy.

## Notes / things you may want to change

- Only the account marked `role: 'lender'` (Philemon) can register new loans.
- Only the `role: 'borrower'` account (Fitsum) sees the "I got married"
  button, and only on their own loans.
- Interest math lives in `app.js` (`dailyCompoundBalance` /
  `yearlyCompoundBalance`) if you want to tweak the rates.
- No Ethiopian calendar support in this one — dates are plain Gregorian.
  Say the word if you want that added to match your other apps.
