-- ============================================================
--  the Let Out — database schema
--  Run in the Supabase SQL Editor (paste all, Run).
--  Safe to run on a fresh OR existing project — only adds what's
--  missing and recreates the views/policies it owns.
-- ============================================================

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  username   text,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists house        text;
alter table public.profiles add column if not exists scene        text;
alter table public.profiles add column if not exists avatar_url   text;
alter table public.profiles add column if not exists avatar_color text;
alter table public.profiles add column if not exists bio          text;
alter table public.profiles add column if not exists onboarded    boolean not null default false;
create unique index if not exists profiles_username_lower
  on public.profiles (lower(username)) where username is not null;

-- ---------- POSTS (with optional media) ----------
create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  category   text not null,
  title      text not null,
  body       text not null default '',
  created_at timestamptz not null default now()
);
alter table public.posts add column if not exists media_url  text;
alter table public.posts add column if not exists media_type text;  -- 'image' | 'video'

-- ---------- COMMENTS (threaded via parent_id) ----------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;

-- ---------- VOTES (posts) ----------
create table if not exists public.votes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  value   smallint not null check (value in (-1, 1)),
  primary key (post_id, user_id)
);

-- ---------- COMMENT VOTES ----------
create table if not exists public.comment_votes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  value      smallint not null check (value in (-1, 1)),
  primary key (comment_id, user_id)
);

-- ============================================================
--  BLANK PROFILE ON SIGNUP (works for email, Google, AND anonymous)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, onboarded) values (new.id, false)
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
--  ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.posts         enable row level security;
alter table public.comments      enable row level security;
alter table public.votes         enable row level security;
alter table public.comment_votes enable row level security;

drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles insert" on public.profiles;
drop policy if exists "profiles update" on public.profiles;
create policy "profiles read"   on public.profiles for select using (true);
create policy "profiles insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles update" on public.profiles for update to authenticated using (auth.uid() = id);

drop policy if exists "posts read"   on public.posts;
drop policy if exists "posts insert" on public.posts;
drop policy if exists "posts delete" on public.posts;
create policy "posts read"   on public.posts for select using (true);
create policy "posts insert" on public.posts for insert to authenticated with check (auth.uid() = author_id);
create policy "posts delete" on public.posts for delete to authenticated using (auth.uid() = author_id);

drop policy if exists "comments read"   on public.comments;
drop policy if exists "comments insert" on public.comments;
drop policy if exists "comments delete" on public.comments;
create policy "comments read"   on public.comments for select using (true);
create policy "comments insert" on public.comments for insert to authenticated with check (auth.uid() = author_id);
create policy "comments delete" on public.comments for delete to authenticated using (auth.uid() = author_id);

drop policy if exists "votes read"   on public.votes;
drop policy if exists "votes write"  on public.votes;
drop policy if exists "votes update" on public.votes;
drop policy if exists "votes delete" on public.votes;
create policy "votes read"   on public.votes for select using (true);
create policy "votes write"  on public.votes for insert to authenticated with check (auth.uid() = user_id);
create policy "votes update" on public.votes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "votes delete" on public.votes for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "cvotes read"   on public.comment_votes;
drop policy if exists "cvotes write"  on public.comment_votes;
drop policy if exists "cvotes update" on public.comment_votes;
drop policy if exists "cvotes delete" on public.comment_votes;
create policy "cvotes read"   on public.comment_votes for select using (true);
create policy "cvotes write"  on public.comment_votes for insert to authenticated with check (auth.uid() = user_id);
create policy "cvotes update" on public.comment_votes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cvotes delete" on public.comment_votes for delete to authenticated using (auth.uid() = user_id);

-- ============================================================
--  TABLE GRANTS
-- ============================================================
grant select on public.posts, public.comments, public.votes, public.comment_votes, public.profiles to anon, authenticated;
grant insert, update, delete on public.posts, public.comments, public.votes, public.comment_votes, public.profiles to authenticated;

-- ============================================================
--  STORAGE BUCKETS (public): avatars + post media
-- ============================================================
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('media',   'media',   true) on conflict (id) do nothing;

drop policy if exists "avatars read"   on storage.objects;
drop policy if exists "avatars insert" on storage.objects;
drop policy if exists "avatars update" on storage.objects;
create policy "avatars read"   on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars insert" on storage.objects for insert to authenticated with check (bucket_id = 'avatars');
create policy "avatars update" on storage.objects for update to authenticated using (bucket_id = 'avatars');

drop policy if exists "media read"   on storage.objects;
drop policy if exists "media insert" on storage.objects;
drop policy if exists "media update" on storage.objects;
create policy "media read"   on storage.objects for select using (bucket_id = 'media');
create policy "media insert" on storage.objects for insert to authenticated with check (bucket_id = 'media');
create policy "media update" on storage.objects for update to authenticated using (bucket_id = 'media');

-- ============================================================
--  FEED VIEWS
-- ============================================================
drop view if exists public.post_feed;
create view public.post_feed as
select
  p.id, p.category, p.title, p.body, p.created_at, p.author_id,
  p.media_url, p.media_type,
  pr.username as author, pr.house as author_house, pr.avatar_url as author_avatar, pr.avatar_color as author_color,
  coalesce((select sum(v.value) from public.votes v where v.post_id = p.id), 0) as score,
  (select count(*) from public.comments c where c.post_id = p.id) as comment_count
from public.posts p
join public.profiles pr on pr.id = p.author_id;

drop view if exists public.comment_feed;
create view public.comment_feed as
select
  c.id, c.post_id, c.parent_id, c.body, c.created_at, c.author_id,
  pr.username as author, pr.house as author_house, pr.avatar_url as author_avatar, pr.avatar_color as author_color,
  coalesce((select sum(cv.value) from public.comment_votes cv where cv.comment_id = c.id), 0) as score
from public.comments c
join public.profiles pr on pr.id = c.author_id;

grant select on public.post_feed    to anon, authenticated;
grant select on public.comment_feed to anon, authenticated;

-- ============================================================
--  Done.
-- ============================================================
