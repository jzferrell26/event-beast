-- Subscription provisioning uses a dedicated, unexposed database capability.
-- The role has no login until an operator supplies its credential separately.
begin;
create schema if not exists billing;
revoke all on schema billing from public, anon, authenticated;
grant usage on schema billing to authenticated;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='event_beast_billing') then
    create role event_beast_billing nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end $$;
grant usage on schema billing to event_beast_billing;

create table public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  stripe_price_id text not null check (stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  stripe_product_id text not null check (stripe_product_id ~ '^prod_[A-Za-z0-9]+$'),
  unit_amount bigint not null check (unit_amount between 1 and 999999999),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  billing_interval text not null check (billing_interval in ('month','year')),
  event_limit integer not null check (event_limit between 1 and 10000),
  livemode boolean not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (stripe_price_id,livemode)
);
alter table public.billing_plans enable row level security;
revoke all on public.billing_plans from public, anon, authenticated;
grant select on public.billing_plans to authenticated;
create policy billing_plans_read on public.billing_plans for select to authenticated
  using (private.platform_verified_email() is not null and (active or private.is_platform_owner()));

create table billing.checkout_intents (
  id uuid primary key,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  buyer_email text not null,
  requested_name text not null check (char_length(btrim(requested_name)) between 1 and 160),
  requested_slug text not null check (requested_slug ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  target_organization_id uuid references public.organizations(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  plan_id uuid not null references public.billing_plans(id) on delete restrict,
  stripe_price_id text not null,
  event_limit integer not null check (event_limit between 1 and 10000),
  livemode boolean not null,
  status text not null default 'pending' check (status in ('pending','open','provisioned','expired')),
  stripe_session_id text unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  checkout_url text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '23 hours'),
  completed_at timestamptz
);
create unique index billing_pending_slug on billing.checkout_intents(buyer_id,requested_slug,livemode)
  where target_organization_id is null and status in ('pending','open');
create unique index billing_pending_target on billing.checkout_intents(target_organization_id)
  where target_organization_id is not null and status in ('pending','open');
create index billing_checkout_buyer on billing.checkout_intents(buyer_id,created_at desc);

create table billing.accounts (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  stripe_customer_id text not null unique,
  stripe_subscription_id text not null unique,
  intent_id uuid not null unique references billing.checkout_intents(id) on delete restrict,
  plan_id uuid not null references public.billing_plans(id) on delete restrict,
  stripe_price_id text not null,
  status text not null check (status in ('active','past_due','canceled','unpaid','paused','incomplete','incomplete_expired','trialing')),
  paid_until timestamptz,
  last_paid_invoice_id text,
  cancel_at_period_end boolean not null default false,
  livemode boolean not null,
  checked_at timestamptz not null default now()
);
create table billing.webhook_receipts (
  event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9]+$'),
  event_type text not null,
  resource_id text not null,
  livemode boolean not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'received' check (state in ('received','processed','failed')),
  attempts integer not null default 0,
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table billing.checkout_intents enable row level security;
alter table billing.accounts enable row level security;
alter table billing.webhook_receipts enable row level security;
revoke all on all tables in schema billing from public, anon, authenticated, event_beast_billing;
alter table public.organizations add column billing_event_limit integer check (billing_event_limit between 1 and 10000);

-- Recovery/billing remains available to a verified active owner even when event
-- operations are suspended or the paid period has ended.
create function billing.is_owner(p_organization uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and private.platform_verified_email() is not null and (
    private.is_platform_owner() or exists(select 1 from public.organization_memberships
      where organization_id=p_organization and user_id=auth.uid() and role='owner' and status='active'));
$$;
create function billing.has_access(p_organization uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select not exists(select 1 from billing.accounts where organization_id=p_organization)
    or exists(select 1 from billing.accounts where organization_id=p_organization and paid_until>now());
$$;
create or replace function private.can_manage_organization(p_organization uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and private.platform_verified_email() is not null and exists(
    select 1 from public.organizations o where o.id=p_organization and (private.is_platform_owner()
      or (o.status='active' and billing.has_access(o.id) and exists(select 1 from public.organization_memberships m
        where m.organization_id=o.id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin')))));
$$;
-- Preserve legacy event roles while enforcing paid access for tenant events.
create or replace function public.is_event_admin(p_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.events e where e.id=p_event and (
    (e.organization_id is not null and private.can_manage_organization(e.organization_id))
    or ((e.organization_id is null or exists(select 1 from public.organizations o
      where o.id=e.organization_id and o.status='active' and billing.has_access(o.id))) and (
      exists(select 1 from public.attendees a where a.event_id=p_event and a.user_id=auth.uid() and a.status='approved' and a.access_role='admin')
      or exists(select 1 from public.event_admins a where a.event_id=p_event and a.user_id=auth.uid()
        and not exists(select 1 from public.attendees r where r.event_id=a.event_id and r.user_id=a.user_id and r.status<>'approved'))))));
$$;

-- Terms are append-only. An agency can close an offer without changing existing
-- paid accounts or an already-open checkout's allowance.
create function billing.save_plan(p_values jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not private.is_platform_owner() then raise exception 'Agency access required' using errcode='42501'; end if;
  insert into public.billing_plans(name,stripe_price_id,stripe_product_id,unit_amount,currency,billing_interval,event_limit,livemode)
    values(btrim(p_values->>'name'),p_values->>'stripe_price_id',p_values->>'stripe_product_id',(p_values->>'unit_amount')::bigint,
      p_values->>'currency',p_values->>'billing_interval',(p_values->>'event_limit')::integer,(p_values->>'livemode')::boolean)
    returning id into v_id;
  return v_id;
end $$;
create function billing.set_plan_active(p_plan uuid,p_active boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_platform_owner() then raise exception 'Agency access required' using errcode='42501'; end if;
  update public.billing_plans set active=p_active where id=p_plan;
  if not found then raise exception 'Plan not found' using errcode='22023'; end if;
end $$;

create function billing.begin_checkout(p_request uuid,p_plan uuid,p_name text,p_slug text,p_target uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_intent billing.checkout_intents; v_plan public.billing_plans; v_org public.organizations; v_account billing.accounts;
  v_email text:=private.platform_verified_email();
begin
  if auth.uid() is null or v_email is null then raise exception 'Verify your email before subscribing' using errcode='42501'; end if;
  if p_request is null then raise exception 'A checkout request is required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('billing-buyer:'||auth.uid()::text,0));
  select * into v_intent from billing.checkout_intents where id=p_request;
  if found then
    if v_intent.buyer_id<>auth.uid() or v_intent.plan_id<>p_plan or v_intent.requested_name is distinct from btrim(p_name)
      or v_intent.requested_slug is distinct from p_slug or v_intent.target_organization_id is distinct from p_target
      then raise exception 'This checkout request was used for different details' using errcode='PT409'; end if;
    return to_jsonb(v_intent);
  end if;
  select * into v_plan from public.billing_plans where id=p_plan and active;
  if not found then raise exception 'This plan is not available for new subscriptions' using errcode='22023'; end if;
  if p_target is not null then
    select * into v_org from public.organizations where id=p_target for update;
    if not found or not billing.is_owner(p_target) then raise exception 'Workspace owner access required' using errcode='42501'; end if;
    if v_org.status<>'active' then raise exception 'Contact the agency to reactivate this workspace before subscribing' using errcode='42501'; end if;
    if p_slug is distinct from v_org.slug or btrim(p_name) is distinct from v_org.name then raise exception 'Use the existing workspace details' using errcode='22023'; end if;
    select * into v_account from billing.accounts where organization_id=p_target;
    if found and (v_account.livemode<>v_plan.livemode or v_account.status not in ('canceled','incomplete_expired'))
      then raise exception 'Manage the existing subscription before starting another one' using errcode='PT409'; end if;
  elsif exists(select 1 from public.organizations where slug=p_slug) then
    raise exception 'That workspace URL is already in use' using errcode='PT409';
  end if;
  select * into v_intent from billing.checkout_intents where status in ('pending','open') and
    ((p_target is null and target_organization_id is null and buyer_id=auth.uid() and requested_slug=p_slug and livemode=v_plan.livemode)
      or (p_target is not null and target_organization_id=p_target)) for update;
  if found then
    if v_intent.buyer_id<>auth.uid() or v_intent.plan_id<>p_plan or v_intent.requested_name is distinct from btrim(p_name)
      then raise exception 'A checkout is already open for this workspace. Finish or expire it first.' using errcode='PT409'; end if;
    return to_jsonb(v_intent);
  end if;
  if (select count(*) from billing.checkout_intents where buyer_id=auth.uid() and status in ('pending','open'))>=3
    then raise exception 'Finish an open checkout before starting another' using errcode='22023'; end if;
  insert into billing.checkout_intents(id,buyer_id,buyer_email,requested_name,requested_slug,target_organization_id,plan_id,stripe_price_id,event_limit,livemode,stripe_customer_id)
    values(p_request,auth.uid(),v_email,btrim(p_name),p_slug,p_target,p_plan,v_plan.stripe_price_id,v_plan.event_limit,v_plan.livemode,v_account.stripe_customer_id)
    returning * into v_intent;
  return to_jsonb(v_intent);
end $$;

create function billing.checkout_status(p_intent uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_intent billing.checkout_intents; v_slug text;
begin
  select * into v_intent from billing.checkout_intents where id=p_intent;
  if not found or private.platform_verified_email() is null or (v_intent.buyer_id<>auth.uid() and not private.is_platform_owner())
    then raise exception 'This checkout is not available to your account' using errcode='42501'; end if;
  select slug into v_slug from public.organizations where id=v_intent.organization_id;
  return jsonb_build_object('id',v_intent.id,'status',v_intent.status,'organization_slug',v_slug,'organization_id',v_intent.organization_id,
    'expires_at',v_intent.expires_at,'checkout_url',case when v_intent.status='open' and v_intent.expires_at>now() then v_intent.checkout_url end,
    'name',v_intent.requested_name);
end $$;
create function billing.owner_context(p_organization uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_org public.organizations; v_account billing.accounts; v_plan public.billing_plans;
begin
  if not billing.is_owner(p_organization) then raise exception 'Workspace owner access required' using errcode='42501'; end if;
  select * into v_org from public.organizations where id=p_organization;
  if not found then raise exception 'Workspace not found' using errcode='22023'; end if;
  select * into v_account from billing.accounts where organization_id=p_organization;
  select * into v_plan from public.billing_plans where id=v_account.plan_id;
  return jsonb_build_object('organization',to_jsonb(v_org),'account',case when v_account.organization_id is not null then to_jsonb(v_account) end,
    'plan',case when v_plan.id is not null then to_jsonb(v_plan) end,'has_access',billing.has_access(p_organization));
end $$;
create function billing.agency_overview() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_platform_owner() then raise exception 'Agency access required' using errcode='42501'; end if;
  return jsonb_build_object(
    'accounts',coalesce((select jsonb_agg(a) from (select o.id,o.name,o.slug,b.status,b.paid_until,b.checked_at,p.name as plan_name
      from billing.accounts b join public.organizations o on o.id=b.organization_id join public.billing_plans p on p.id=b.plan_id
      order by b.checked_at desc limit 100) a),'[]'::jsonb),
    'failures',coalesce((select jsonb_agg(e) from (select event_id,event_type,error_code,attempts,received_at
      from billing.webhook_receipts where state='failed' order by received_at desc limit 100) e),'[]'::jsonb));
end $$;

-- Machine-only functions. This role cannot read tables, grant ownership, or
-- browse attendee data. It can invoke only the narrow operations below.
create function billing.intent(p_intent uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select to_jsonb(i) from billing.checkout_intents i where id=p_intent;
$$;
create function billing.subscription_intent(p_subscription text) returns uuid
language sql stable security definer set search_path='' as $$
  select id from billing.checkout_intents where stripe_subscription_id=p_subscription order by created_at desc limit 1;
$$;
create function billing.plan_for_price(p_price text,p_live boolean) returns jsonb
language sql stable security definer set search_path='' as $$
  select to_jsonb(p) from public.billing_plans p where stripe_price_id=p_price and livemode=p_live;
$$;
create function billing.lock_subscription(p_subscription text) returns void
language sql security invoker set search_path='' as $$
  select pg_advisory_xact_lock(hashtextextended('billing-subscription:'||p_subscription,0));
$$;
create function billing.bind_checkout(p_intent uuid,p_session text,p_customer text,p_subscription text,p_url text) returns void
language plpgsql security definer set search_path='' as $$
declare v_intent billing.checkout_intents;
begin
  select * into v_intent from billing.checkout_intents where id=p_intent for update;
  if not found then raise exception 'Checkout intent not found' using errcode='22023'; end if;
  if p_session is null or p_session !~ '^cs_[A-Za-z0-9_]+$'
    or (v_intent.stripe_session_id is not null and v_intent.stripe_session_id<>p_session)
    or (v_intent.stripe_customer_id is not null and p_customer is not null and v_intent.stripe_customer_id<>p_customer)
    or (v_intent.stripe_subscription_id is not null and p_subscription is not null and v_intent.stripe_subscription_id<>p_subscription)
    then raise exception 'Checkout provider identity mismatch' using errcode='22023'; end if;
  if p_url is not null and (p_url !~ '^https://checkout\.stripe\.com/' or char_length(p_url)>4096)
    then raise exception 'Unexpected checkout destination' using errcode='22023'; end if;
  update billing.checkout_intents set stripe_session_id=p_session,stripe_customer_id=coalesce(p_customer,stripe_customer_id),
    stripe_subscription_id=coalesce(p_subscription,stripe_subscription_id),checkout_url=case when p_subscription is not null then null else coalesce(p_url,checkout_url) end,
    status=case when status='pending' then 'open' else status end where id=p_intent;
end $$;
create function billing.expire_checkout(p_intent uuid,p_session text) returns void
language plpgsql security definer set search_path='' as $$
begin
  update billing.checkout_intents set status='expired' where id=p_intent and stripe_session_id=p_session and status in ('pending','open');
end $$;

create function billing.receive_event(p_id text,p_type text,p_resource text,p_live boolean,p_hash text) returns text
language plpgsql security definer set search_path='' as $$
declare v_receipt billing.webhook_receipts;
begin
  insert into billing.webhook_receipts(event_id,event_type,resource_id,livemode,payload_hash)
    values(p_id,p_type,p_resource,p_live,p_hash) on conflict(event_id) do nothing;
  select * into v_receipt from billing.webhook_receipts where event_id=p_id for update;
  if v_receipt.event_type<>p_type or v_receipt.resource_id<>p_resource or v_receipt.livemode<>p_live or v_receipt.payload_hash<>p_hash
    then raise exception 'Event identity mismatch' using errcode='22023'; end if;
  if v_receipt.state<>'processed' then update billing.webhook_receipts set attempts=attempts+1 where event_id=p_id; end if;
  return v_receipt.state;
end $$;
create function billing.finish_event(p_id text) returns void language sql security definer set search_path='' as $$
  update billing.webhook_receipts set state='processed',error_code=null,processed_at=now() where event_id=p_id;
$$;
create function billing.fail_event(p_id text,p_code text) returns void language sql security definer set search_path='' as $$
  update billing.webhook_receipts set state='failed',error_code=left(p_code,80) where event_id=p_id and state<>'processed';
$$;

create function billing.apply_subscription(p_intent uuid,p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_intent billing.checkout_intents; v_account billing.accounts; v_plan public.billing_plans; v_org uuid; v_slug text;
  v_subscription text:=p_snapshot->>'subscription_id'; v_customer text:=p_snapshot->>'customer_id';
  v_status text:=p_snapshot->>'status'; v_price text:=p_snapshot->>'price_id';
  v_live boolean:=(p_snapshot->>'livemode')::boolean; v_paid timestamptz:=(p_snapshot->>'paid_until')::timestamptz;
  v_invoice text:=p_snapshot->>'paid_invoice_id'; v_replacement boolean:=false;
begin
  if v_subscription is null or v_subscription !~ '^sub_[A-Za-z0-9]+$' or v_customer is null or v_customer !~ '^cus_[A-Za-z0-9]+$'
    or v_status is null or v_status not in ('active','past_due','canceled','unpaid','paused','incomplete','incomplete_expired','trialing')
    or v_live is null then raise exception 'Invalid subscription snapshot' using errcode='22023'; end if;
  perform billing.lock_subscription(v_subscription);
  select * into v_intent from billing.checkout_intents where id=p_intent for update;
  if not found then raise exception 'Checkout intent not found' using errcode='22023'; end if;
  if v_intent.stripe_session_id is null or v_intent.stripe_subscription_id is distinct from v_subscription
    or v_intent.stripe_customer_id is distinct from v_customer or v_intent.livemode<>v_live
    then raise exception 'Subscription is not bound to this checkout' using errcode='22023'; end if;
  select * into v_plan from public.billing_plans where stripe_price_id=v_price and livemode=v_live;
  if not found then raise exception 'Subscription price is not configured' using errcode='22023'; end if;
  if v_paid is not null and (v_invoice is null or v_invoice !~ '^in_[A-Za-z0-9]+$')
    then raise exception 'A paid invoice is required for access' using errcode='22023'; end if;
  v_org:=coalesce(v_intent.organization_id,v_intent.target_organization_id);
  if v_org is not null then
    perform 1 from public.organizations where id=v_org for update;
    select * into v_account from billing.accounts where organization_id=v_org for update;
    if found and v_account.stripe_subscription_id<>v_subscription then
      if v_intent.status='provisioned' then return jsonb_build_object('status','superseded'); end if;
      if v_account.status not in ('canceled','incomplete_expired') or v_account.stripe_customer_id<>v_customer or v_account.livemode<>v_live
        then raise exception 'An existing subscription must be recovered first' using errcode='PT409'; end if;
      v_replacement:=true;
    end if;
  end if;
  if v_intent.status<>'provisioned' then
    if v_price<>v_intent.stripe_price_id then raise exception 'Checkout plan mismatch' using errcode='22023'; end if;
    if v_status<>'active' or v_paid is null or v_paid<=now() then return jsonb_build_object('status','awaiting_payment'); end if;
    if not exists(select 1 from auth.users where id=v_intent.buyer_id and email_confirmed_at is not null)
      then raise exception 'The purchaser must have a verified account' using errcode='42501'; end if;
    if v_intent.target_organization_id is not null and not exists(select 1 from public.organization_memberships
      where organization_id=v_org and user_id=v_intent.buyer_id and role='owner' and status='active')
      and not exists(select 1 from private.platform_owner where user_id=v_intent.buyer_id)
      then raise exception 'Purchaser no longer owns this workspace' using errcode='42501'; end if;
    if v_org is null then
      v_slug:=v_intent.requested_slug;
      -- Concurrent purchases may request the same URL. Never attach a paid
      -- purchase to somebody else's account: allocate a unique durable URL.
      if exists(select 1 from public.organizations where slug=v_slug) then
        v_slug:=left(v_slug,30)||'-'||replace(v_intent.id::text,'-','');
      end if;
      insert into public.organizations(name,slug,billing_event_limit) values(v_intent.requested_name,v_slug,v_intent.event_limit)
        on conflict(slug) do nothing returning id into v_org;
      if v_org is null then
        v_slug:=left(v_intent.requested_slug,30)||'-'||replace(v_intent.id::text,'-','');
        insert into public.organizations(name,slug,billing_event_limit) values(v_intent.requested_name,v_slug,v_intent.event_limit) returning id into v_org;
      end if;
      insert into public.organization_memberships(organization_id,user_id,role) values(v_org,v_intent.buyer_id,'owner');
      insert into public.platform_audit_log(actor_id,organization_id,action,details)
        values(v_intent.buyer_id,v_org,'billing.account_provisioned',jsonb_build_object('intent_id',p_intent,'source','stripe'));
    end if;
    update billing.checkout_intents set organization_id=v_org,status='provisioned',completed_at=now() where id=p_intent;
  end if;
  insert into billing.accounts(organization_id,stripe_customer_id,stripe_subscription_id,intent_id,plan_id,stripe_price_id,status,paid_until,last_paid_invoice_id,cancel_at_period_end,livemode)
    values(v_org,v_customer,v_subscription,p_intent,v_plan.id,v_price,v_status,v_paid,v_invoice,coalesce((p_snapshot->>'cancel_at_period_end')::boolean,false),v_live)
    on conflict(organization_id) do update set stripe_subscription_id=excluded.stripe_subscription_id,intent_id=excluded.intent_id,
      status=excluded.status,cancel_at_period_end=excluded.cancel_at_period_end,checked_at=now(),
      paid_until=case when v_replacement then excluded.paid_until else greatest(accounts.paid_until,excluded.paid_until) end,
      last_paid_invoice_id=coalesce(excluded.last_paid_invoice_id,accounts.last_paid_invoice_id),
      plan_id=case when v_paid>now() then excluded.plan_id else accounts.plan_id end,
      stripe_price_id=case when v_paid>now() then excluded.stripe_price_id else accounts.stripe_price_id end;
  if v_paid>now() then update public.organizations set billing_event_limit=case when v_intent.status<>'provisioned' then v_intent.event_limit else v_plan.event_limit end where id=v_org; end if;
  select slug into v_slug from public.organizations where id=v_org;
  return jsonb_build_object('status','provisioned','organization_id',v_org,'organization_slug',v_slug);
end $$;

-- Recover a saved checkout without trusting a browser session identifier.
create function billing.recent_checkouts() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if private.platform_verified_email() is null then raise exception 'Verify your email before opening checkout' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(billing.checkout_status(i.id)) from
    (select id from billing.checkout_intents where buyer_id=auth.uid() order by created_at desc limit 12) i),'[]'::jsonb);
end $$;
create function billing.expire_unbound(p_intent uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update billing.checkout_intents set status='expired',checkout_url=null where id=p_intent
    and stripe_session_id is null and status='pending' and expires_at<now()-interval '1 minute';
end $$;

-- Public functions are invoker wrappers; only authenticated callers receive
-- their execute grants. Stripe never invokes these user operations.
create function public.billing_recent_checkouts() returns jsonb language sql security invoker set search_path='' as $$ select billing.recent_checkouts(); $$;
create function public.billing_save_plan(p_values jsonb) returns uuid language sql security invoker set search_path='' as $$ select billing.save_plan(p_values); $$;
create function public.billing_set_plan_active(p_plan uuid,p_active boolean) returns void language sql security invoker set search_path='' as $$ select billing.set_plan_active(p_plan,p_active); $$;
create function public.billing_begin_checkout(p_request uuid,p_plan uuid,p_name text,p_slug text,p_target uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select billing.begin_checkout(p_request,p_plan,p_name,p_slug,p_target); $$;
create function public.billing_checkout_status(p_intent uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select billing.checkout_status(p_intent); $$;
create function public.billing_owner_context(p_organization uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select billing.owner_context(p_organization); $$;
create function public.billing_agency_overview() returns jsonb language sql stable security invoker set search_path='' as $$ select billing.agency_overview(); $$;

do $$ declare fn record; begin
  for fn in select p.oid::regprocedure as signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='billing' or (n.nspname='public' and p.proname like 'billing\_%' escape '\')
  loop
    execute format('revoke all on function %s from public,anon,authenticated,event_beast_billing',fn.signature);
    if fn.nspname='public' or fn.proname in ('is_owner','has_access','save_plan','set_plan_active','begin_checkout','checkout_status','owner_context','agency_overview')
      then execute format('grant execute on function %s to authenticated',fn.signature);
    else execute format('grant execute on function %s to event_beast_billing',fn.signature); end if;
  end loop;
end $$;
-- Billing-managed event limits are combined with an explicit agency override
-- in platform_create_event, below. Existing events and overrides are retained.
create function billing.guard_event_allowance() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_limit integer;
begin
  if new.organization_id is null then return new; end if;
  if tg_op='UPDATE' and old.organization_id is not distinct from new.organization_id then return new; end if;
  select coalesce(event_limit,billing_event_limit) into v_limit from public.organizations where id=new.organization_id for update;
  if v_limit is not null and (select count(*) from public.events where organization_id=new.organization_id)>=v_limit
    then raise exception 'This workspace has reached its event allowance. Review Billing or contact the agency.' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function billing.guard_event_allowance() from public,anon,authenticated,event_beast_billing;
create trigger billing_event_allowance before insert or update of organization_id on public.events
  for each row execute function billing.guard_event_allowance();
revoke all on function billing.recent_checkouts(), billing.expire_unbound(uuid), public.billing_recent_checkouts() from public,anon,authenticated,event_beast_billing;
grant execute on function billing.recent_checkouts(), public.billing_recent_checkouts() to authenticated;
grant execute on function billing.expire_unbound(uuid) to event_beast_billing;
commit;
