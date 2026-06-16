-- ============================================================
--  the Let Out — database schema
--  Run this once in the Supabase SQL Editor (paste the whole file, click Run).
--  Safe to re-run: it drops and recreates the views/policies it owns.
-- ============================================================

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  username   text not null,
  created_at timestamptz not null default now()
);

-- ---------- POSTS ----------
create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  category   text not null,
  title      text not null,
  body       text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- COMMENTS ----------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

-- ---------- VOTES (one row per user per post: 1 = upvote, -1 = chop) ----------
create table if not exists public.votes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  value   smallint not null check (value in (-1, 1)),
  primary key (post_id, user_id)
);

-- ============================================================
--  AUTO-CREATE A PROFILE WHEN SOMEONE SIGNS UP
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
--  ROW LEVEL SECURITY
--  Everyone can read (it's a community forum). Only signed-in
--  users can write, and only as themselves.
-- ============================================================
alter table public.profiles enable row level security;
alter table public.posts    enable row level security;
alter table public.comments enable row level security;
alter table public.votes    enable row level security;

-- profiles
drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles insert" on public.profiles;
drop policy if exists "profiles update" on public.profiles;
create policy "profiles read"   on public.profiles for select using (true);
create policy "profiles insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles update" on public.profiles for update to authenticated using (auth.uid() = id);

-- posts
drop policy if exists "posts read"   on public.posts;
drop policy if exists "posts insert" on public.posts;
drop policy if exists "posts delete" on public.posts;
create policy "posts read"   on public.posts for select using (true);
create policy "posts insert" on public.posts for insert to authenticated with check (auth.uid() = author_id);
create policy "posts delete" on public.posts for delete to authenticated using (auth.uid() = author_id);

-- comments
drop policy if exists "comments read"   on public.comments;
drop policy if exists "comments insert" on public.comments;
drop policy if exists "comments delete" on public.comments;
create policy "comments read"   on public.comments for select using (true);
create policy "comments insert" on public.comments for insert to authenticated with check (auth.uid() = author_id);
create policy "comments delete" on public.comments for delete to authenticated using (auth.uid() = author_id);

-- votes
drop policy if exists "votes read"   on public.votes;
drop policy if exists "votes write"  on public.votes;
drop policy if exists "votes update" on public.votes;
drop policy if exists "votes delete" on public.votes;
create policy "votes read"   on public.votes for select using (true);
create policy "votes write"  on public.votes for insert to authenticated with check (auth.uid() = user_id);
create policy "votes update" on public.votes for update to authenticated using (auth.uid() = user_id);
create policy "votes delete" on public.votes for delete to authenticated using (auth.uid() = user_id);

-- ============================================================
--  FEED VIEWS (read-only convenience views for the app)
-- ============================================================
drop view if exists public.post_feed;
create view public.post_feed as
select
  p.id,
  p.category,
  p.title,
  p.body,
  p.created_at,
  p.author_id,
  pr.username as author,
  coalesce((select sum(v.value) from public.votes v where v.post_id = p.id), 0) as score,
  (select count(*) from public.comments c where c.post_id = p.id)              as comment_count
from public.posts p
join public.profiles pr on pr.id = p.author_id;

drop view if exists public.comment_feed;
create view public.comment_feed as
select
  c.id,
  c.post_id,
  c.body,
  c.created_at,
  c.author_id,
  pr.username as author
from public.comments c
join public.profiles pr on pr.id = c.author_id;

grant select on public.post_feed    to anon, authenticated;
grant select on public.comment_feed to anon, authenticated;

-- ============================================================
--  Done. Your tables, security rules, and feed are ready.
-- ============================================================
