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
-- anonymous users have no name at signup, so username must be nullable
alter table public.profiles alter column username drop not null;
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
alter table public.posts add column if not exists link_url   text;  -- embedded clip: YouTube, TikTok, Instagram, etc.
alter table public.posts add column if not exists tags       text[] not null default '{}';  -- replaces single category
alter table public.posts alter column category drop not null;
update public.posts set tags = array[category] where (tags is null or tags = '{}') and category is not null;

-- ---------- COMMENTS (threaded via parent_id) ----------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;
alter table public.comments add column if not exists image_url text;  -- memes / gifs / images on comments
alter table public.comments alter column body drop not null;          -- a comment can be image-only

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
  begin
    insert into public.profiles (id, onboarded) values (new.id, false)
    on conflict (id) do nothing;
  exception when others then
    null;  -- never block account creation if the profile insert hiccups
  end;
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
  p.media_url, p.media_type, p.link_url, p.tags,
  pr.username as author, pr.house as author_house, pr.avatar_url as author_avatar, pr.avatar_color as author_color,
  coalesce((select sum(v.value) from public.votes v where v.post_id = p.id), 0) as score,
  (select count(*) from public.comments c where c.post_id = p.id) as comment_count
from public.posts p
join public.profiles pr on pr.id = p.author_id;

drop view if exists public.comment_feed;
create view public.comment_feed as
select
  c.id, c.post_id, c.parent_id, c.body, c.image_url, c.created_at, c.author_id,
  pr.username as author, pr.house as author_house, pr.avatar_url as author_avatar, pr.avatar_color as author_color,
  coalesce((select sum(cv.value) from public.comment_votes cv where cv.comment_id = c.id), 0) as score
from public.comments c
join public.profiles pr on pr.id = c.author_id;

grant select on public.post_feed    to anon, authenticated;
grant select on public.comment_feed to anon, authenticated;

-- ============================================================
--  HOUSES
-- ============================================================
create table if not exists public.houses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  city        text,
  description text,
  logo_url    text,
  founder_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.house_memberships (
  house_id   uuid not null references public.houses(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'child'   check (role   in ('founder', 'parent', 'child')),
  status     text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default now(),
  primary key (house_id, user_id)
);
-- a person can be an ACTIVE member of only one house at a time (you rep one house)
create unique index if not exists house_one_active on public.house_memberships (user_id) where status = 'active';
-- free-text title (e.g. Mother, Father, Member) + a permission flag for leaders
alter table public.house_memberships add column if not exists title     text;
alter table public.house_memberships add column if not exists is_leader boolean not null default false;
update public.house_memberships set is_leader = true where role in ('founder', 'parent') and is_leader = false;
update public.house_memberships set title = (case role when 'founder' then 'Founder' when 'parent' then 'Parent' else 'Member' end) where title is null;

create table if not exists public.house_messages (
  id         uuid primary key default gen_random_uuid(),
  house_id   uuid not null references public.houses(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

-- membership-check helpers (security definer = no RLS recursion)
create or replace function public.is_house_member(h uuid, u uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.house_memberships m where m.house_id = h and m.user_id = u and m.status = 'active');
$$;
create or replace function public.is_house_leader(h uuid, u uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.house_memberships m where m.house_id = h and m.user_id = u and m.status = 'active' and m.is_leader = true);
$$;

alter table public.houses           enable row level security;
alter table public.house_memberships enable row level security;
alter table public.house_messages   enable row level security;

drop policy if exists "houses read"   on public.houses;
drop policy if exists "houses insert" on public.houses;
drop policy if exists "houses update" on public.houses;
create policy "houses read"   on public.houses for select using (true);
create policy "houses insert" on public.houses for insert to authenticated with check (auth.uid() = founder_id);
create policy "houses update" on public.houses for update to authenticated using (public.is_house_leader(id, auth.uid()));

drop policy if exists "hm read"   on public.house_memberships;
drop policy if exists "hm insert" on public.house_memberships;
drop policy if exists "hm update" on public.house_memberships;
drop policy if exists "hm delete" on public.house_memberships;
create policy "hm read" on public.house_memberships for select using (true);
-- request to join as yourself (pending), OR the founder bootstrapping in, OR a leader adding someone to their house
create policy "hm insert" on public.house_memberships for insert to authenticated
  with check (
    (auth.uid() = user_id and status = 'pending')
    or (auth.uid() = user_id and auth.uid() = (select founder_id from public.houses where id = house_id))
    or public.is_house_leader(house_id, auth.uid())
  );
-- leaders approve/promote; (a leader updates rows in their house)
create policy "hm update" on public.house_memberships for update to authenticated using (public.is_house_leader(house_id, auth.uid()));
-- leaders remove members; or you remove yourself (leave)
create policy "hm delete" on public.house_memberships for delete to authenticated using (public.is_house_leader(house_id, auth.uid()) or auth.uid() = user_id);

drop policy if exists "hmsg read"   on public.house_messages;
drop policy if exists "hmsg insert" on public.house_messages;
create policy "hmsg read"   on public.house_messages for select using (public.is_house_member(house_id, auth.uid()));
create policy "hmsg insert" on public.house_messages for insert to authenticated with check (auth.uid() = author_id and public.is_house_member(house_id, auth.uid()));

grant select on public.houses, public.house_memberships to anon, authenticated;
grant insert, update, delete on public.houses, public.house_memberships to authenticated;
grant select, insert on public.house_messages to authenticated;

-- house calendar (practices, meetings, etc. — members only)
create table if not exists public.house_events (
  id         uuid primary key default gen_random_uuid(),
  house_id   uuid not null references public.houses(id) on delete cascade,
  title      text not null,
  event_date timestamptz not null,
  note       text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.house_events enable row level security;
drop policy if exists "he read"   on public.house_events;
drop policy if exists "he insert" on public.house_events;
drop policy if exists "he delete" on public.house_events;
create policy "he read"   on public.house_events for select using (public.is_house_member(house_id, auth.uid()));
create policy "he insert" on public.house_events for insert to authenticated with check (auth.uid() = created_by and public.is_house_member(house_id, auth.uid()));
create policy "he delete" on public.house_events for delete to authenticated using (auth.uid() = created_by or public.is_house_leader(house_id, auth.uid()));
grant select, insert, delete on public.house_events to authenticated;

-- invite links: a leader generates a token, anyone with the link joins as an active member
create table if not exists public.house_invites (
  token      text primary key default gen_random_uuid()::text,
  house_id   uuid not null references public.houses(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.house_invites enable row level security;
drop policy if exists "hi insert" on public.house_invites;
drop policy if exists "hi read"   on public.house_invites;
create policy "hi insert" on public.house_invites for insert to authenticated with check (auth.uid() = created_by and public.is_house_leader(house_id, auth.uid()));
create policy "hi read"   on public.house_invites for select using (public.is_house_leader(house_id, auth.uid()));
grant select, insert on public.house_invites to authenticated;

-- redeem an invite: joins the current user to the invite's house as an active member
create or replace function public.redeem_invite(invite_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  select house_id into hid from public.house_invites where token = invite_token;
  if hid is null then raise exception 'invalid_invite'; end if;
  insert into public.house_memberships (house_id, user_id, status, title, is_leader)
    values (hid, auth.uid(), 'active', 'Member', false)
    on conflict (house_id, user_id) do update set status = 'active';
  return hid;
end; $$;
grant execute on function public.redeem_invite(text) to authenticated;

-- house views
drop view if exists public.houses_directory;
create view public.houses_directory as
select h.*, (select count(*) from public.house_memberships m where m.house_id = h.id and m.status = 'active') as member_count
from public.houses h;

drop view if exists public.house_members;
create view public.house_members as
select m.house_id, m.user_id, m.role, m.status, m.created_at, m.title, m.is_leader,
  pr.username, pr.avatar_url, pr.avatar_color
from public.house_memberships m
join public.profiles pr on pr.id = m.user_id;

grant select on public.houses_directory to anon, authenticated;
grant select on public.house_members    to anon, authenticated;

-- ============================================================
--  BALLS (organizer + ordered category lineup)
-- ============================================================
create table if not exists public.balls (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  ball_date    date,
  location     text,
  description  text,
  flyer_url    text,
  status       text not null default 'upcoming' check (status in ('upcoming', 'completed')),
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create table if not exists public.ball_categories (
  id            uuid primary key default gen_random_uuid(),
  ball_id       uuid not null references public.balls(id) on delete cascade,
  name          text not null,
  category_type text not null default 'other' check (category_type in ('performance', 'runway', 'face', 'realness', 'voguing', 'fashion', 'other')),
  prize         text,
  description   text,
  position      int not null default 0,
  created_at    timestamptz not null default now()
);

create or replace function public.is_ball_organizer(b uuid, u uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.balls bb where bb.id = b and bb.organizer_id = u);
$$;

alter table public.balls           enable row level security;
alter table public.ball_categories enable row level security;

drop policy if exists "balls read"   on public.balls;
drop policy if exists "balls insert" on public.balls;
drop policy if exists "balls update" on public.balls;
drop policy if exists "balls delete" on public.balls;
create policy "balls read"   on public.balls for select using (true);
create policy "balls insert" on public.balls for insert to authenticated with check (auth.uid() = organizer_id);
create policy "balls update" on public.balls for update to authenticated using (auth.uid() = organizer_id);
create policy "balls delete" on public.balls for delete to authenticated using (auth.uid() = organizer_id);

drop policy if exists "bc read"   on public.ball_categories;
drop policy if exists "bc insert" on public.ball_categories;
drop policy if exists "bc update" on public.ball_categories;
drop policy if exists "bc delete" on public.ball_categories;
create policy "bc read"   on public.ball_categories for select using (true);
create policy "bc insert" on public.ball_categories for insert to authenticated with check (public.is_ball_organizer(ball_id, auth.uid()));
create policy "bc update" on public.ball_categories for update to authenticated using (public.is_ball_organizer(ball_id, auth.uid()));
create policy "bc delete" on public.ball_categories for delete to authenticated using (public.is_ball_organizer(ball_id, auth.uid()));

grant select on public.balls, public.ball_categories to anon, authenticated;
grant insert, update, delete on public.balls, public.ball_categories to authenticated;

drop view if exists public.balls_directory;
create view public.balls_directory as
select b.*, pr.username as organizer,
  (select count(*) from public.ball_categories c where c.ball_id = b.id) as category_count
from public.balls b
join public.profiles pr on pr.id = b.organizer_id;

grant select on public.balls_directory to anon, authenticated;

-- ============================================================
--  BALL RESULTS (the system of record — wins accrue to people & houses)
-- ============================================================
create table if not exists public.ball_results (
  id                uuid primary key default gen_random_uuid(),
  ball_id           uuid not null references public.balls(id) on delete cascade,
  category_id       uuid not null references public.ball_categories(id) on delete cascade,
  winner_profile_id uuid references public.profiles(id) on delete set null,
  winner_name       text,            -- free-text walker name when they aren't a member
  winner_house_id   uuid references public.houses(id) on delete set null,
  winner_house_name text,            -- free-text house when it isn't a Let Out house
  created_at        timestamptz not null default now(),
  unique (category_id)               -- one recorded winner per category (MVP)
);
alter table public.ball_results enable row level security;
drop policy if exists "br read"   on public.ball_results;
drop policy if exists "br insert" on public.ball_results;
drop policy if exists "br update" on public.ball_results;
drop policy if exists "br delete" on public.ball_results;
create policy "br read"   on public.ball_results for select using (true);
create policy "br insert" on public.ball_results for insert to authenticated with check (public.is_ball_organizer(ball_id, auth.uid()));
create policy "br update" on public.ball_results for update to authenticated using (public.is_ball_organizer(ball_id, auth.uid()));
create policy "br delete" on public.ball_results for delete to authenticated using (public.is_ball_organizer(ball_id, auth.uid()));
grant select on public.ball_results to anon, authenticated;
grant insert, update, delete on public.ball_results to authenticated;

drop view if exists public.ball_results_feed;
create view public.ball_results_feed as
select r.id, r.ball_id, r.category_id, r.winner_profile_id, r.winner_name, r.winner_house_id, r.winner_house_name, r.created_at,
  c.name as category_name, c.category_type, c.position,
  b.name as ball_name, b.ball_date,
  pr.username as winner_username, pr.avatar_url as winner_avatar, pr.avatar_color as winner_color,
  h.name as winner_house_display, h.logo_url as winner_house_logo
from public.ball_results r
join public.ball_categories c on c.id = r.category_id
join public.balls b on b.id = r.ball_id
left join public.profiles pr on pr.id = r.winner_profile_id
left join public.houses   h  on h.id = r.winner_house_id;
grant select on public.ball_results_feed to anon, authenticated;

-- ============================================================
--  Done.
-- ============================================================
