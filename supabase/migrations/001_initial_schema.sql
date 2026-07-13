-- ORS Connect V3 — schéma initial PostgreSQL / Supabase
-- À exécuter dans un projet Supabase neuf via SQL Editor.

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'directeur', 'concession', 'prestataire');
create type public.payment_mode as enum ('day', 'vehicle');
create type public.vehicle_status as enum ('waiting', 'washing', 'done', 'cancelled');
create type public.billing_type as enum ('vo', 'vn', 'relavage', 'tres_sale');
create type public.service_type as enum ('mecanique', 'service_rapide', 'carrosserie', 'vo_vn');
create type public.provider_status as enum ('pending', 'active', 'inactive');
create type public.document_type as enum ('assurance', 'urssaf', 'identite', 'autre');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'ORS Solution',
  slug text not null unique default 'ors',
  support_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.concessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  address text not null,
  city text not null,
  contact_email text,
  manager_name text,
  manager_email text,
  daily_target integer not null default 24 check (daily_target > 0),
  billed_day_rate numeric(10,2) not null default 190 check (billed_day_rate >= 0),
  billed_vo_rate numeric(10,2) not null default 30 check (billed_vo_rate >= 0),
  billed_vn_rate numeric(10,2) not null default 25 check (billed_vn_rate >= 0),
  billed_relavage_rate numeric(10,2) not null default 20 check (billed_relavage_rate >= 0),
  billed_tres_sale_rate numeric(10,2) not null default 45 check (billed_tres_sale_rate >= 0),
  factoring_enabled boolean not null default false,
  factoring_rate numeric(6,3) not null default 0 check (factoring_rate >= 0 and factoring_rate <= 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  email text not null,
  role public.app_role not null,
  phone text,
  status public.provider_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.concession_access (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  concession_id uuid not null references public.concessions(id) on delete cascade,
  primary key (profile_id, concession_id)
);

create table public.provider_contracts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  concession_id uuid not null references public.concessions(id) on delete cascade,
  payment_mode public.payment_mode not null default 'day',
  day_rate numeric(10,2) not null default 0 check (day_rate >= 0),
  vo_rate numeric(10,2) not null default 0 check (vo_rate >= 0),
  vn_rate numeric(10,2) not null default 0 check (vn_rate >= 0),
  relavage_rate numeric(10,2) not null default 0 check (relavage_rate >= 0),
  tres_sale_rate numeric(10,2) not null default 0 check (tres_sale_rate >= 0),
  daily_deduction numeric(10,2) not null default 0 check (daily_deduction >= 0),
  starts_on date not null default current_date,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint provider_contract_dates check (ends_on is null or ends_on >= starts_on)
);

create unique index provider_contract_one_active_per_site
  on public.provider_contracts(provider_id, concession_id)
  where active = true;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  concession_id uuid not null references public.concessions(id) on delete cascade,
  plate text not null,
  model text,
  service public.service_type not null default 'mecanique',
  billing_type public.billing_type not null default 'vo',
  status public.vehicle_status not null default 'waiting',
  return_time time,
  urgent boolean not null default false,
  customer_waiting boolean not null default false,
  provider_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  billed_amount numeric(10,2) not null default 0 check (billed_amount >= 0),
  provider_amount numeric(10,2) not null default 0 check (provider_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_workflow_dates check (
    (started_at is null or started_at >= created_at)
    and (completed_at is null or started_at is not null)
    and (completed_at is null or completed_at >= started_at)
  )
);

create unique index vehicles_unique_plate_per_site_day
  on public.vehicles(concession_id, upper(plate), ((created_at at time zone 'Europe/Paris')::date))
  where status <> 'cancelled';

create index vehicles_concession_status_idx on public.vehicles(concession_id, status, created_at desc);
create index vehicles_provider_completed_idx on public.vehicles(provider_id, completed_at desc) where status = 'done';

create table public.work_days (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  concession_id uuid not null references public.concessions(id) on delete cascade,
  work_date date not null,
  started_at timestamptz,
  ended_at timestamptz,
  validated_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  unique(provider_id, concession_id, work_date)
);

create table public.provider_documents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  document_type public.document_type not null,
  storage_path text not null,
  expires_on date,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  concession_id uuid not null references public.concessions(id) on delete cascade,
  provider_id uuid references public.profiles(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  work_day_id uuid references public.work_days(id) on delete set null,
  entry_date date not null,
  billed_amount numeric(10,2) not null default 0,
  provider_amount numeric(10,2) not null default 0,
  operational_fees numeric(10,2) not null default 0,
  source text not null check (source in ('vehicle', 'day', 'adjustment')),
  description text,
  created_at timestamptz not null default now(),
  constraint financial_entry_source_reference check (
    (source = 'vehicle' and vehicle_id is not null)
    or (source = 'day' and work_day_id is not null)
    or source = 'adjustment'
  )
);

create unique index financial_vehicle_once on public.financial_entries(vehicle_id) where source = 'vehicle';
create unique index financial_day_once on public.financial_entries(work_day_id) where source = 'day';
create index financial_entries_month_idx on public.financial_entries(organization_id, entry_date desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger concessions_set_updated_at before update on public.concessions for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger vehicles_set_updated_at before update on public.vehicles for each row execute function public.set_updated_at();

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.can_access_concession(target_concession uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_app_role() = 'admin'
    or exists (
      select 1 from public.concession_access ca
      where ca.profile_id = auth.uid() and ca.concession_id = target_concession
    );
$$;

create or replace function public.can_view_profile(target_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_profile = auth.uid()
    or public.current_app_role() in ('admin', 'directeur')
    or exists (
      select 1
      from public.concession_access mine
      join public.concession_access theirs on theirs.concession_id = mine.concession_id
      where mine.profile_id = auth.uid() and theirs.profile_id = target_profile
    );
$$;

alter table public.organizations enable row level security;
alter table public.concessions enable row level security;
alter table public.profiles enable row level security;
alter table public.concession_access enable row level security;
alter table public.provider_contracts enable row level security;
alter table public.vehicles enable row level security;
alter table public.work_days enable row level security;
alter table public.provider_documents enable row level security;
alter table public.financial_entries enable row level security;

create policy "organization visible to authenticated members" on public.organizations
for select to authenticated using (
  id = (select organization_id from public.profiles where id = auth.uid())
);
create policy "admin manages organization" on public.organizations
for all to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

create policy "accessible concessions are visible" on public.concessions
for select to authenticated using (public.can_access_concession(id));
create policy "admin manages concessions" on public.concessions
for all to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

create policy "authorized profiles are visible" on public.profiles
for select to authenticated using (public.can_view_profile(id));
create policy "users update own profile" on public.profiles
for update to authenticated using (id = auth.uid() or public.current_app_role() = 'admin')
with check (id = auth.uid() or public.current_app_role() = 'admin');
create policy "admin inserts profiles" on public.profiles
for insert to authenticated with check (public.current_app_role() = 'admin');

create policy "accessible assignments are visible" on public.concession_access
for select to authenticated using (
  profile_id = auth.uid()
  or public.current_app_role() in ('admin', 'directeur')
  or public.can_access_concession(concession_id)
);
create policy "admin manages access" on public.concession_access
for all to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

create policy "providers and management view contracts" on public.provider_contracts
for select to authenticated using (
  provider_id = auth.uid()
  or public.current_app_role() in ('admin', 'directeur')
  or public.can_access_concession(concession_id)
);
create policy "admin manages contracts" on public.provider_contracts
for all to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

create policy "site users view vehicles" on public.vehicles
for select to authenticated using (public.can_access_concession(concession_id));
create policy "site users create vehicles" on public.vehicles
for insert to authenticated with check (public.can_access_concession(concession_id));
create policy "site users update vehicles" on public.vehicles
for update to authenticated using (public.can_access_concession(concession_id)) with check (public.can_access_concession(concession_id));
create policy "admin deletes vehicles" on public.vehicles
for delete to authenticated using (public.current_app_role() = 'admin');

create policy "work days visible by site or owner" on public.work_days
for select to authenticated using (provider_id = auth.uid() or public.can_access_concession(concession_id));
create policy "admin manages work days" on public.work_days
for all to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

create policy "providers view own documents" on public.provider_documents
for select to authenticated using (provider_id = auth.uid() or public.current_app_role() = 'admin');
create policy "providers upload own documents" on public.provider_documents
for insert to authenticated with check (provider_id = auth.uid() or public.current_app_role() = 'admin');
create policy "admin manages documents" on public.provider_documents
for all to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

create policy "management views finances" on public.financial_entries
for select to authenticated using (public.current_app_role() in ('admin', 'directeur'));
create policy "admin manages finances" on public.financial_entries
for all to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');

-- Première initialisation : le premier utilisateur Auth devient administrateur ORS.
create or replace function public.bootstrap_first_admin(
  p_full_name text,
  p_concession_name text,
  p_city text,
  p_address text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_concession uuid;
  v_email text;
begin
  if v_user is null then
    raise exception 'Authentification requise';
  end if;

  perform pg_advisory_xact_lock(hashtext('ors_connect_first_admin'));

  if exists (select 1 from public.profiles) then
    raise exception 'L initialisation a déjà été effectuée';
  end if;

  if nullif(trim(p_full_name), '') is null
     or nullif(trim(p_concession_name), '') is null
     or nullif(trim(p_city), '') is null
     or nullif(trim(p_address), '') is null then
    raise exception 'Tous les champs sont obligatoires';
  end if;

  select email into v_email from auth.users where id = v_user;
  if v_email is null then raise exception 'Adresse e-mail Auth introuvable'; end if;

  insert into public.organizations(name, slug)
  values ('ORS Solution', 'ors')
  returning id into v_org;

  insert into public.profiles(id, organization_id, full_name, email, role, status)
  values (v_user, v_org, trim(p_full_name), v_email, 'admin', 'active');

  insert into public.concessions(organization_id, name, city, address)
  values (v_org, trim(p_concession_name), trim(p_city), trim(p_address))
  returning id into v_concession;

  insert into public.concession_access(profile_id, concession_id)
  values (v_user, v_concession);

  return v_concession;
end;
$$;

grant execute on function public.bootstrap_first_admin(text, text, text, text) to authenticated;

-- Démarrage contrôlé d'un véhicule et affectation à un prestataire actif.
create or replace function public.start_vehicle(p_vehicle_id uuid, p_provider_id uuid default null)
returns public.vehicles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_provider uuid := coalesce(p_provider_id, auth.uid());
  v_role public.app_role := public.current_app_role();
begin
  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found then raise exception 'Véhicule introuvable'; end if;
  if not public.can_access_concession(v_vehicle.concession_id) then raise exception 'Accès refusé'; end if;
  if v_vehicle.status <> 'waiting' then raise exception 'Ce véhicule ne peut pas être démarré'; end if;
  if v_role = 'prestataire' and v_provider <> auth.uid() then raise exception 'Affectation interdite'; end if;

  if not exists (
    select 1
    from public.profiles p
    join public.concession_access ca on ca.profile_id = p.id
    where p.id = v_provider
      and p.role = 'prestataire'
      and p.status = 'active'
      and ca.concession_id = v_vehicle.concession_id
  ) then
    raise exception 'Prestataire actif non affecté à cette concession';
  end if;

  update public.vehicles
  set status = 'washing', provider_id = v_provider, started_at = now(), completed_at = null
  where id = p_vehicle_id
  returning * into v_vehicle;

  return v_vehicle;
end;
$$;

grant execute on function public.start_vehicle(uuid, uuid) to authenticated;

-- Clôture atomique : fige la rémunération et crée les écritures financières.
create or replace function public.complete_vehicle(p_vehicle_id uuid)
returns public.vehicles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_contract public.provider_contracts%rowtype;
  v_org uuid;
  v_provider_amount numeric(10,2) := 0;
  v_work_day uuid;
begin
  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found then raise exception 'Véhicule introuvable'; end if;
  if not public.can_access_concession(v_vehicle.concession_id) then raise exception 'Accès refusé'; end if;
  if v_vehicle.status <> 'washing' or v_vehicle.provider_id is null then
    raise exception 'Le véhicule doit être en lavage et affecté';
  end if;

  select * into v_contract
  from public.provider_contracts
  where provider_id = v_vehicle.provider_id
    and concession_id = v_vehicle.concession_id
    and active = true
    and starts_on <= current_date
    and (ends_on is null or ends_on >= current_date)
  order by starts_on desc
  limit 1;

  if not found then raise exception 'Aucun contrat actif pour ce prestataire'; end if;

  if v_contract.payment_mode = 'vehicle' then
    v_provider_amount := case v_vehicle.billing_type
      when 'vo' then v_contract.vo_rate
      when 'vn' then v_contract.vn_rate
      when 'relavage' then v_contract.relavage_rate
      when 'tres_sale' then v_contract.tres_sale_rate
    end;
  end if;

  update public.vehicles
  set status = 'done', completed_at = now(), provider_amount = v_provider_amount
  where id = p_vehicle_id
  returning * into v_vehicle;

  select organization_id into v_org from public.concessions where id = v_vehicle.concession_id;

  insert into public.financial_entries(
    organization_id, concession_id, provider_id, vehicle_id, entry_date,
    billed_amount, provider_amount, source, description
  ) values (
    v_org, v_vehicle.concession_id, v_vehicle.provider_id, v_vehicle.id, current_date,
    v_vehicle.billed_amount, v_provider_amount, 'vehicle', 'Prestation véhicule ' || v_vehicle.plate
  ) on conflict (vehicle_id) where source = 'vehicle' do nothing;

  if v_contract.payment_mode = 'day' then
    insert into public.work_days(provider_id, concession_id, work_date, started_at, ended_at)
    values (v_vehicle.provider_id, v_vehicle.concession_id, current_date, v_vehicle.started_at, now())
    on conflict (provider_id, concession_id, work_date)
    do update set ended_at = excluded.ended_at
    returning id into v_work_day;

    insert into public.financial_entries(
      organization_id, concession_id, provider_id, work_day_id, entry_date,
      billed_amount, provider_amount, source, description
    ) values (
      v_org, v_vehicle.concession_id, v_vehicle.provider_id, v_work_day, current_date,
      0, v_contract.day_rate, 'day', 'Forfait journalier prestataire'
    ) on conflict (work_day_id) where source = 'day' do nothing;
  end if;

  return v_vehicle;
end;
$$;

grant execute on function public.complete_vehicle(uuid) to authenticated;

-- Realtime sur les véhicules.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vehicles'
  ) then
    alter publication supabase_realtime add table public.vehicles;
  end if;
end $$;
