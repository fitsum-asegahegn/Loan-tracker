-- Run this in the Supabase SQL editor.
-- auth.users is managed by Supabase Auth; create the two accounts
-- (Fitsum + Philemon) from Authentication > Users first, then run this.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('lender', 'borrower')),
  created_at timestamptz not null default now()
);

create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references auth.users(id),
  borrower_id uuid not null references auth.users(id),
  principal numeric not null check (principal > 0),
  start_date date not null,
  interest_mode text not null default 'daily_1pct'
    check (interest_mode in ('daily_1pct', 'yearly_5pct')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists forgiveness_clause (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references loans(id) on delete cascade,
  condition text not null default 'fitsum_married_within_10_years',
  triggered boolean not null default false,
  triggered_date date,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table loans enable row level security;
alter table forgiveness_clause enable row level security;

create policy "profiles readable by authenticated users"
  on profiles for select
  using (auth.role() = 'authenticated');

create policy "profiles editable by owner"
  on profiles for update
  using (auth.uid() = id);

create policy "profiles insertable by owner"
  on profiles for insert
  with check (auth.uid() = id);

create policy "loans readable by participants"
  on loans for select
  using (auth.uid() = lender_id or auth.uid() = borrower_id);

create policy "loans insertable by lender"
  on loans for insert
  with check (auth.uid() = lender_id);

create policy "loans updatable by lender"
  on loans for update
  using (auth.uid() = lender_id);

create policy "forgiveness readable by loan participants"
  on forgiveness_clause for select
  using (
    exists (
      select 1 from loans l
      where l.id = loan_id and (l.lender_id = auth.uid() or l.borrower_id = auth.uid())
    )
  );

create policy "forgiveness insertable by lender"
  on forgiveness_clause for insert
  with check (
    exists (select 1 from loans l where l.id = loan_id and l.lender_id = auth.uid())
  );

create policy "forgiveness updatable by borrower"
  on forgiveness_clause for update
  using (
    exists (select 1 from loans l where l.id = loan_id and l.borrower_id = auth.uid())
  );
