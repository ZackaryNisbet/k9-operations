-- US federal holidays reference table, surfaced on the aggregated calendar so
-- lead-time planning accounts for closures (shipping delays, staffing). Dates are
-- computed from the observed rules (nth-weekday / last-Monday), not hard-coded.
create table if not exists public.us_federal_holidays (
  holiday_date date primary key,
  name text not null
);

alter table public.us_federal_holidays enable row level security;
drop policy if exists us_federal_holidays_read on public.us_federal_holidays;
create policy us_federal_holidays_read on public.us_federal_holidays for select to authenticated, anon using (true);
grant select on public.us_federal_holidays to authenticated, anon;

insert into public.us_federal_holidays (holiday_date, name)
with years as (select generate_series(2025, 2031) as y)
select d, n from (
  select make_date(y,1,1) as d, 'New Year''s Day' as n from years
  union all select make_date(y,6,19), 'Juneteenth National Independence Day' from years
  union all select make_date(y,7,4), 'Independence Day' from years
  union all select make_date(y,11,11), 'Veterans Day' from years
  union all select make_date(y,12,25), 'Christmas Day' from years
  union all select make_date(y,1,1)  + ((1 - extract(dow from make_date(y,1,1))::int  + 7) % 7) + 14, 'Martin Luther King Jr. Day' from years
  union all select make_date(y,2,1)  + ((1 - extract(dow from make_date(y,2,1))::int  + 7) % 7) + 14, 'Presidents'' Day' from years
  union all select make_date(y,9,1)  + ((1 - extract(dow from make_date(y,9,1))::int  + 7) % 7),      'Labor Day' from years
  union all select make_date(y,10,1) + ((1 - extract(dow from make_date(y,10,1))::int + 7) % 7) + 7,  'Columbus Day' from years
  union all select make_date(y,11,1) + ((4 - extract(dow from make_date(y,11,1))::int + 7) % 7) + 21, 'Thanksgiving Day' from years
  union all select make_date(y,5,31) - ((extract(dow from make_date(y,5,31))::int - 1 + 7) % 7),      'Memorial Day' from years
) h
on conflict (holiday_date) do update set name = excluded.name;
