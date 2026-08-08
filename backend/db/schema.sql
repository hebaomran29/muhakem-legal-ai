-- ═══════════════════════════════════════════════════════════════
-- مُحَكِّم — Database Schema (Supabase / Postgres)
-- شغّليه في: Supabase Dashboard → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════

-- ── المكاتب/الفرق ──────────────────────────────────────────────
create table if not exists firms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ── أعضاء المكتب (ربط auth.users بالمكتب) ─────────────────────
create table if not exists firm_members (
  firm_id     uuid not null references firms(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner', 'member')),
  joined_at   timestamptz not null default now(),
  primary key (firm_id, user_id)
);

-- ── الجلسات (مذكرة / عقد / مراجعة / بحث / استشارة) ────────────
create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references firms(id) on delete cascade,
  created_by  uuid not null references auth.users(id),
  type        text not null check (type in ('memo', 'contract', 'review', 'research', 'consultation')),
  title       text not null default '',
  prompt      text,               -- الطلب الأصلي اللي بدأت بيه الجلسة
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_sessions_firm on sessions(firm_id, updated_at desc);

-- ── نتيجة المذكرة (Sections + المصادر اللي استخدمها الـ RAG) ──
create table if not exists memo_results (
  session_id      uuid primary key references sessions(id) on delete cascade,
  sections        jsonb not null,        -- نفس شكل MemoSection[] بتاع الفرونت
  case_metadata   jsonb,
  sources         jsonb,                 -- الطعون + مواد القانون اللي اتجابت بالـ RAG (عشان شات الأسئلة)
  memo_text       text,                  -- النص الكامل المُصدَّر (لتصدير Word)
  updated_at      timestamptz not null default now()
);

-- ── نتيجة العقد (البنود) ───────────────────────────────────────
create table if not exists contract_results (
  session_id       uuid primary key references sessions(id) on delete cascade,
  clauses          jsonb not null,       -- نفس شكل ContractClause[] بتاع الفرونت
  contract_type_ar text,
  updated_at       timestamptz not null default now()
);

-- ── سجل شات التعديل لكل جلسة ───────────────────────────────────
create table if not exists chat_messages (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  role         text not null check (role in ('user', 'assistant')),
  text         text not null,
  change_card  jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_chat_session on chat_messages(session_id, created_at);

-- ═══════════════════════════════════════════════════════════════
-- Row Level Security — كل مستخدم يشوف بس بيانات المكتب بتاعه
-- (طبقة حماية إضافية؛ الباك إند بيستخدم service role فبيتخطاها،
--  لكن مهمة لو أي حد هيوصل للـ DB مباشرة من الفرونت مستقبلاً)
-- ═══════════════════════════════════════════════════════════════

alter table firms enable row level security;
alter table firm_members enable row level security;
alter table sessions enable row level security;
alter table memo_results enable row level security;
alter table contract_results enable row level security;
alter table chat_messages enable row level security;

create policy "members can view their firm" on firms
  for select using (
    id in (select firm_id from firm_members where user_id = auth.uid())
  );

create policy "members can view their firm's membership" on firm_members
  for select using (
    firm_id in (select firm_id from firm_members where user_id = auth.uid())
  );

create policy "members can access their firm's sessions" on sessions
  for all using (
    firm_id in (select firm_id from firm_members where user_id = auth.uid())
  );

create policy "members can access their firm's memo results" on memo_results
  for all using (
    session_id in (
      select id from sessions where firm_id in (
        select firm_id from firm_members where user_id = auth.uid()
      )
    )
  );

create policy "members can access their firm's contract results" on contract_results
  for all using (
    session_id in (
      select id from sessions where firm_id in (
        select firm_id from firm_members where user_id = auth.uid()
      )
    )
  );

create policy "members can access their firm's chat messages" on chat_messages
  for all using (
    session_id in (
      select id from sessions where firm_id in (
        select firm_id from firm_members where user_id = auth.uid()
      )
    )
  );
