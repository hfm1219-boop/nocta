-- Capa agéntica conversacional: sesión, confirmaciones de un solo uso y ejecución auditable.

create table if not exists public.ai_conversations(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete set null,
  status text not null default 'active' check(status in('active','completed','cancelled')),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages(
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check(role in('user','assistant','tool')),
  content text not null check(length(content) between 1 and 10000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_agent_runs(
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  intent text not null,
  status text not null check(status in('running','needs_input','needs_confirmation','completed','failed')),
  step_count integer not null default 0 check(step_count between 0 and 8),
  model text,
  latency_ms integer,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.ai_tool_calls(
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_agent_runs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tool_name text not null,
  tool_kind text not null check(tool_kind in('READ','DRAFT','WRITE')),
  input jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  status text not null check(status in('succeeded','failed','denied')),
  latency_ms integer,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_confirmations(
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  action text not null check(action='create_promotion'),
  payload jsonb not null,
  status text not null default 'pending' check(status in('pending','confirmed','consumed','expired','cancelled')),
  confirmed_at timestamptz,
  consumed_at timestamptz,
  expires_at timestamptz not null default(now()+interval '30 minutes'),
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_conversation on public.ai_messages(conversation_id,created_at);
create index if not exists ai_runs_conversation on public.ai_agent_runs(conversation_id,created_at desc);
create index if not exists ai_confirmations_pending on public.ai_confirmations(user_id,status,expires_at);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_agent_runs enable row level security;
alter table public.ai_tool_calls enable row level security;
alter table public.ai_confirmations enable row level security;

create policy "ai conversations self" on public.ai_conversations for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "ai messages self" on public.ai_messages for all to authenticated using(user_id=auth.uid() and exists(select 1 from public.ai_conversations c where c.id=conversation_id and c.user_id=auth.uid())) with check(user_id=auth.uid() and exists(select 1 from public.ai_conversations c where c.id=conversation_id and c.user_id=auth.uid()));
create policy "ai runs self read" on public.ai_agent_runs for select to authenticated using(user_id=auth.uid());
create policy "ai runs self write" on public.ai_agent_runs for insert to authenticated with check(user_id=auth.uid());
create policy "ai runs self update" on public.ai_agent_runs for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "ai tool calls self" on public.ai_tool_calls for select to authenticated using(user_id=auth.uid());
create policy "ai tool calls self insert" on public.ai_tool_calls for insert to authenticated with check(user_id=auth.uid());
create policy "ai confirmations self read" on public.ai_confirmations for select to authenticated using(user_id=auth.uid());

grant select,insert,update on public.ai_conversations,public.ai_messages,public.ai_agent_runs to authenticated;
grant select,insert on public.ai_tool_calls to authenticated;
grant select on public.ai_confirmations to authenticated;

create or replace function public.prepare_agent_promotion(target_conversation uuid,promotion_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare target_venue uuid; target_org uuid; confirmation_id uuid; product_ids uuid[]; start_at timestamptz; end_at timestamptz; mechanic_value public.promotion_mechanic;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from public.ai_conversations c where c.id=target_conversation and c.user_id=auth.uid() and c.status='active') then raise exception 'CONVERSATION_NOT_FOUND'; end if;
  target_venue := (promotion_payload->>'venueId')::uuid;
  select v.organization_id into target_org from public.venues v where v.id=target_venue and v.active;
  if target_org is null or not public.can_manage_venue(target_venue) or not public.current_user_can('venue.manage',target_org) then raise exception 'FORBIDDEN'; end if;
  if nullif(trim(promotion_payload->>'title'),'') is null or length(trim(promotion_payload->>'title'))<4 then raise exception 'INVALID_TITLE'; end if;
  if length(trim(coalesce(promotion_payload->>'description','')))<10 or length(trim(coalesce(promotion_payload->>'terms','')))<5 then raise exception 'INVALID_CONTENT'; end if;
  start_at := (promotion_payload->>'startsAt')::timestamptz; end_at := (promotion_payload->>'endsAt')::timestamptz;
  if end_at<=start_at then raise exception 'INVALID_WINDOW'; end if;
  mechanic_value := (promotion_payload->>'mechanic')::public.promotion_mechanic;
  select array_agg(value::uuid) into product_ids from jsonb_array_elements_text(promotion_payload->'productIds');
  if coalesce(array_length(product_ids,1),0)=0 or (select count(*) from public.venue_menu_items i where i.id=any(product_ids) and i.venue_id=target_venue and i.available)<>array_length(product_ids,1) then raise exception 'INVALID_PRODUCTS'; end if;
  if mechanic_value='percentage' and ((promotion_payload->>'benefit')::numeric<=0 or (promotion_payload->>'benefit')::numeric>100) then raise exception 'INVALID_BENEFIT'; end if;
  if mechanic_value in('fixed_amount','fixed_price') and (promotion_payload->>'benefit')::integer<=0 then raise exception 'INVALID_BENEFIT'; end if;
  if mechanic_value='buy_x_get_y' and ((promotion_payload->>'buyQuantity')::integer<1 or (promotion_payload->>'getQuantity')::integer<1) then raise exception 'INVALID_BENEFIT'; end if;
  update public.ai_confirmations set status='cancelled' where conversation_id=target_conversation and status='pending';
  insert into public.ai_confirmations(conversation_id,user_id,organization_id,venue_id,action,payload)
  values(target_conversation,auth.uid(),target_org,target_venue,'create_promotion',promotion_payload) returning id into confirmation_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'ai.confirmation.requested','ai_conversation',target_conversation,jsonb_build_object('confirmationId',confirmation_id,'tool','create_promotion','venueId',target_venue));
  return confirmation_id;
end;$$;

create or replace function public.execute_confirmed_agent_promotion(target_confirmation uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare confirmation public.ai_confirmations; payload jsonb; promotion_id uuid; rule_id uuid; product_id uuid; mechanic_value public.promotion_mechanic;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into confirmation from public.ai_confirmations c where c.id=target_confirmation and c.user_id=auth.uid() for update;
  if confirmation.id is null then raise exception 'CONFIRMATION_NOT_FOUND'; end if;
  if confirmation.status<>'pending' then raise exception 'CONFIRMATION_ALREADY_USED'; end if;
  if confirmation.expires_at<=now() then update public.ai_confirmations set status='expired' where id=target_confirmation; raise exception 'CONFIRMATION_EXPIRED'; end if;
  if not public.can_manage_venue(confirmation.venue_id) or not public.current_user_can('venue.manage',confirmation.organization_id) then raise exception 'FORBIDDEN'; end if;
  payload:=confirmation.payload; mechanic_value:=(payload->>'mechanic')::public.promotion_mechanic;
  update public.ai_confirmations set status='confirmed',confirmed_at=now() where id=target_confirmation;
  insert into public.promotions(venue_id,title,description,terms,starts_at,ends_at,active,created_by)
  values(confirmation.venue_id,trim(payload->>'title'),trim(payload->>'description'),trim(payload->>'terms'),(payload->>'startsAt')::timestamptz,(payload->>'endsAt')::timestamptz,true,auth.uid()) returning id into promotion_id;
  insert into public.promotion_rules(promotion_id,mechanic,percentage_off,fixed_amount_cop,buy_quantity,get_quantity,fixed_price_cop,budget_cop,local_time_start,local_time_end)
  values(promotion_id,mechanic_value,
    case when mechanic_value='percentage' then (payload->>'benefit')::numeric end,
    case when mechanic_value='fixed_amount' then (payload->>'benefit')::integer end,
    case when mechanic_value='buy_x_get_y' then (payload->>'buyQuantity')::integer end,
    case when mechanic_value='buy_x_get_y' then (payload->>'getQuantity')::integer end,
    case when mechanic_value='fixed_price' then (payload->>'benefit')::integer end,
    nullif(payload->>'budgetCop','')::bigint,
    ((payload->>'startsAt')::timestamptz at time zone 'America/Bogota')::time,
    ((payload->>'endsAt')::timestamptz at time zone 'America/Bogota')::time
  ) returning id into rule_id;
  for product_id in select value::uuid from jsonb_array_elements_text(payload->'productIds') loop
    if not exists(select 1 from public.venue_menu_items i where i.id=product_id and i.venue_id=confirmation.venue_id and i.available) then raise exception 'INVALID_PRODUCTS'; end if;
    insert into public.promotion_rule_items(rule_id,venue_menu_item_id,role,minimum_quantity) values(rule_id,product_id,'qualifying',1);
  end loop;
  update public.ai_confirmations set status='consumed',consumed_at=now() where id=target_confirmation;
  update public.ai_conversations set status='completed',state=jsonb_build_object('promotionId',promotion_id),updated_at=now() where id=confirmation.conversation_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'promotion.created_by_ai','promotion',promotion_id,jsonb_build_object('conversationId',confirmation.conversation_id,'confirmationId',target_confirmation,'tool','create_promotion','source','ai_agent'));
  return promotion_id;
end;$$;

revoke all on function public.prepare_agent_promotion(uuid,jsonb),public.execute_confirmed_agent_promotion(uuid) from public,anon;
grant execute on function public.prepare_agent_promotion(uuid,jsonb),public.execute_confirmed_agent_promotion(uuid) to authenticated;
notify pgrst,'reload schema';
