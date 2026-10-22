-- Radar only. Never touches Desktop's local SQLite archive.
create table public.radar_sites (
 id uuid primary key default gen_random_uuid(), site_key text unique not null default replace(gen_random_uuid()::text,'-',''),
 name text not null check (length(name) between 1 and 80), domains text[] not null check(cardinality(domains) between 1 and 10),
 public_enabled boolean not null default false, theme text not null default 'dark' check(theme in ('dark','light')),
 created_at timestamptz not null default now()
);
create table public.radar_site_members (
 site_id uuid references public.radar_sites on delete cascade, user_id uuid references auth.users on delete cascade,
 primary key(site_id,user_id)
);
create table public.radar_events (
 site_id uuid not null references public.radar_sites on delete cascade, event_id text not null,
 visitor_id text not null, session_id text not null, occurred_at timestamptz not null, received_at timestamptz not null default now(),
 type text not null check(type in ('page_view','heartbeat','custom')), pathname text not null check(length(pathname)<=512),
 name text, properties jsonb not null default '{}', referrer text, country text, city text,
 latitude double precision, longitude double precision,
 primary key(site_id,event_id), check(octet_length(properties::text)<=8192)
);
create index radar_event_time on public.radar_events(site_id,received_at desc);
create index radar_event_visitor on public.radar_events(site_id,visitor_id,occurred_at);
create table public.radar_sessions (
 site_id uuid not null references public.radar_sites on delete cascade, session_id text not null, visitor_id text not null,
 started_at timestamptz not null, last_seen timestamptz not null, pathname text not null,
 country text, city text, latitude double precision, longitude double precision,
 primary key(site_id,session_id)
);
create index radar_session_time on public.radar_sessions(site_id,last_seen desc);
alter table public.radar_sites enable row level security;
alter table public.radar_site_members enable row level security;
alter table public.radar_events enable row level security;
alter table public.radar_sessions enable row level security;
create policy member_read on public.radar_site_members for select to authenticated using(user_id=auth.uid());
create policy site_read on public.radar_sites for select to authenticated using(exists(select 1 from public.radar_site_members m where m.site_id=id and m.user_id=auth.uid()));
create policy site_update on public.radar_sites for update to authenticated using(exists(select 1 from public.radar_site_members m where m.site_id=id and m.user_id=auth.uid())) with check(exists(select 1 from public.radar_site_members m where m.site_id=id and m.user_id=auth.uid()));
create policy event_read on public.radar_events for select to authenticated using(exists(select 1 from public.radar_site_members m where m.site_id=radar_events.site_id and m.user_id=auth.uid()));
create policy session_read on public.radar_sessions for select to authenticated using(exists(select 1 from public.radar_site_members m where m.site_id=radar_sessions.site_id and m.user_id=auth.uid()));
revoke all on public.radar_sites,public.radar_site_members,public.radar_events,public.radar_sessions from anon,authenticated;
grant select on public.radar_sites,public.radar_site_members,public.radar_events,public.radar_sessions to authenticated;
grant update(name,domains,public_enabled,theme) on public.radar_sites to authenticated;
grant all on public.radar_sites,public.radar_site_members,public.radar_events,public.radar_sessions to service_role;

create function public.radar_create_site(p_name text,p_domains text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.radar_sites;
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if (select count(*) from public.radar_site_members where user_id=auth.uid())>=10 then raise exception 'site_limit'; end if;
 if exists(select 1 from unnest(p_domains) d where length(d)>253 or d !~ '^[a-z0-9.-]+$') then raise exception 'invalid_domain'; end if;
 insert into public.radar_sites(name,domains) values(p_name,p_domains) returning * into s;
 insert into public.radar_site_members values(s.id,auth.uid()); return to_jsonb(s);
end $$;
revoke all on function public.radar_create_site(text,text[]) from public,anon,authenticated;
grant execute on function public.radar_create_site(text,text[]) to authenticated;

create function public.radar_ingest(p_site uuid,p_event jsonb,p_geo jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare inserted integer; t timestamptz := least(to_timestamp((p_event->>'occurredAt')::double precision/1000),now());
begin
 insert into public.radar_events(site_id,event_id,visitor_id,session_id,occurred_at,type,pathname,name,properties,referrer,country,city,latitude,longitude)
 values(p_site,p_event->>'eventId',p_event->>'visitorId',p_event->>'sessionId',t,p_event->>'type',p_event->>'pathname',p_event->>'name',coalesce(p_event->'properties','{}'),p_event->>'referrer',p_geo->>'country',p_geo->>'city',(p_geo->>'latitude')::double precision,(p_geo->>'longitude')::double precision)
 on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return false; end if;
 insert into public.radar_sessions as s(site_id,session_id,visitor_id,started_at,last_seen,pathname,country,city,latitude,longitude)
 values(p_site,p_event->>'sessionId',p_event->>'visitorId',t,t,p_event->>'pathname',p_geo->>'country',p_geo->>'city',(p_geo->>'latitude')::double precision,(p_geo->>'longitude')::double precision)
 on conflict(site_id,session_id) do update set
 started_at=least(s.started_at,excluded.started_at),last_seen=greatest(s.last_seen,excluded.last_seen),
 pathname=case when excluded.last_seen>=s.last_seen then excluded.pathname else s.pathname end,
 country=coalesce(excluded.country,s.country),city=coalesce(excluded.city,s.city),
 latitude=coalesce(excluded.latitude,s.latitude),longitude=coalesce(excluded.longitude,s.longitude)
 where s.visitor_id=excluded.visitor_id;
 if not found then raise exception 'session_identity_conflict'; end if;
 return true;
end $$;
revoke all on function public.radar_ingest(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.radar_ingest(uuid,jsonb,jsonb) to service_role;

create function public.radar_summary(p_site uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('online',(select count(*) from public.radar_sessions where site_id=p_site and last_seen>now()-interval '60 seconds'),
 'pageViews',(select count(*) from public.radar_events where site_id=p_site and type='page_view' and received_at>now()-interval '24 hours'),
 'visitors',(select count(distinct visitor_id) from public.radar_events where site_id=p_site and type='page_view' and received_at>now()-interval '24 hours'),'now',floor(extract(epoch from now())*1000));
$$;
revoke all on function public.radar_summary(uuid) from public,anon,authenticated;
grant execute on function public.radar_summary(uuid) to authenticated,service_role;

create function public.radar_snapshot(p_site uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.radar_site_members where site_id=p_site and user_id=auth.uid()) then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object('summary',public.radar_summary(p_site),
 'sessions',coalesce((select jsonb_agg(to_jsonb(s)-'site_id') from (select * from public.radar_sessions where site_id=p_site and last_seen>now()-interval '24 hours' order by last_seen desc limit 200) s),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e)-'site_id') from (select * from public.radar_events where site_id=p_site and type<>'heartbeat' and received_at>now()-interval '24 hours' order by occurred_at desc,event_id limit 200) e),'[]'),
 'truncated',(select count(*)>200 from public.radar_sessions where site_id=p_site and last_seen>now()-interval '24 hours') or (select count(*)>200 from public.radar_events where site_id=p_site and type<>'heartbeat' and received_at>now()-interval '24 hours'),
 'pages',coalesce((select jsonb_agg(x) from(select pathname as name,count(*) as count from public.radar_events where site_id=p_site and type='page_view' and received_at>now()-interval '24 hours' group by pathname order by count(*) desc limit 10)x),'[]'),
 'sources',coalesce((select jsonb_agg(x) from(select coalesce(referrer,'Direct') as name,count(*) as count from public.radar_events where site_id=p_site and type='page_view' and received_at>now()-interval '24 hours' group by referrer order by count(*) desc limit 10)x),'[]'),
 'countries',coalesce((select jsonb_agg(x) from(select coalesce(country,'Unknown') as name,count(*) as count from public.radar_sessions where site_id=p_site and last_seen>now()-interval '24 hours' group by country order by count(*) desc limit 10)x),'[]'),
 'cities',coalesce((select jsonb_agg(x) from(select coalesce(city,'Unknown') as name,count(*) as count from public.radar_sessions where site_id=p_site and last_seen>now()-interval '24 hours' group by city order by count(*) desc limit 10)x),'[]'));
end $$;
revoke all on function public.radar_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.radar_snapshot(uuid) to authenticated;

create function public.radar_journey(p_site uuid,p_visitor text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.radar_site_members where site_id=p_site and user_id=auth.uid()) then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object('events',coalesce((select jsonb_agg(to_jsonb(e)-'site_id') from(select * from public.radar_events where site_id=p_site and visitor_id=p_visitor and type<>'heartbeat' and received_at>now()-interval '30 days' order by occurred_at,event_id limit 500)e),'[]'),
 'truncated',(select count(*)>500 from public.radar_events where site_id=p_site and visitor_id=p_visitor and type<>'heartbeat' and received_at>now()-interval '30 days'));
end $$;
revoke all on function public.radar_journey(uuid,text) from public,anon,authenticated;
grant execute on function public.radar_journey(uuid,text) to authenticated;

create function public.radar_cleanup() returns void language sql security definer set search_path='' as $$
 delete from public.radar_events where received_at<now()-interval '30 days';
 delete from public.radar_sessions where last_seen<now()-interval '30 days';
$$;
revoke all on function public.radar_cleanup() from public,anon,authenticated;
grant execute on function public.radar_cleanup() to service_role;
