-- Endurecimiento posterior a la auditoría del dominio de fidelización.

drop policy if exists "redemption self or merchant read" on public.loyalty_redemptions;
drop policy if exists "redemption owner read" on public.loyalty_redemptions;
create policy "redemption owner read" on public.loyalty_redemptions
for select using (user_id = auth.uid() or public.is_platform_owner());

create or replace function public.submit_mission_execution(
  mission_slug text,
  evidence jsonb,
  idempotency_key text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  mission public.loyalty_missions;
  existing public.loyalty_executions;
  execution_id uuid;
  period_start timestamptz;
  user_count integer;
  total_count integer;
  missing_key boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(btrim(idempotency_key), '') is null or length(idempotency_key) > 200 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if not exists(select 1 from public.profiles where id = auth.uid() and status = 'active') then
    raise exception 'PARTICIPANT_INACTIVE';
  end if;

  select e.* into existing
  from public.loyalty_executions e
  where e.user_id = auth.uid() and e.idempotency_key = submit_mission_execution.idempotency_key;
  if found then
    if not exists(select 1 from public.loyalty_missions m where m.id = existing.mission_id and m.slug = mission_slug) then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return existing.id;
  end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':' || mission_slug));
  select e.* into existing
  from public.loyalty_executions e
  where e.user_id = auth.uid() and e.idempotency_key = submit_mission_execution.idempotency_key;
  if found then return existing.id; end if;

  select m.* into mission
  from public.loyalty_missions m
  join public.loyalty_campaigns c on c.id = m.campaign_id
  where m.slug = mission_slug and m.status = 'active' and c.status = 'published'
    and now() between m.starts_at and m.ends_at
  for update of m;
  if not found then raise exception 'MISSION_UNAVAILABLE'; end if;

  select exists(
    select 1
    from jsonb_array_elements_text(coalesce(mission.evidence_schema -> 'required', '[]'::jsonb)) as required_key(value)
    where not coalesce(evidence, '{}'::jsonb) ? required_key.value
      or nullif(btrim(coalesce(evidence ->> required_key.value, '')), '') is null
  ) into missing_key;
  if missing_key then raise exception 'EVIDENCE_REQUIRED'; end if;

  select count(*) into total_count from public.loyalty_executions
  where mission_id = mission.id and status in ('submitted', 'in_review', 'approved');
  if total_count >= mission.total_quota then raise exception 'MISSION_QUOTA_REACHED'; end if;

  period_start := case mission.frequency
    when 'daily' then date_trunc('day', now())
    when 'weekly' then date_trunc('week', now())
    when 'monthly' then date_trunc('month', now())
    else mission.starts_at end;
  select count(*) into user_count from public.loyalty_executions
  where mission_id = mission.id and user_id = auth.uid()
    and status in ('submitted', 'in_review', 'approved') and created_at >= period_start;
  if user_count >= mission.per_user_quota then raise exception 'USER_QUOTA_REACHED'; end if;

  insert into public.loyalty_executions(
    user_id, mission_id, campaign_id, status, evidence, submitted_at, idempotency_key
  ) values (
    auth.uid(), mission.id, mission.campaign_id,
    case when mission.requires_audit then 'in_review' else 'submitted' end,
    coalesce(evidence, '{}'::jsonb), now(), idempotency_key
  ) returning id into execution_id;

  if mission.requires_audit then
    insert into public.wallet_transactions(
      user_id, kind, status, points, concept, mission_id, execution_id, idempotency_key, created_by
    ) values (
      auth.uid(), 'mission_credit', 'pending', mission.reward_points,
      'Misión en revisión · ' || mission.name, mission.id, execution_id,
      'pending:' || execution_id, auth.uid()
    );
  else
    perform public.credit_approved_execution(execution_id, auth.uid());
  end if;
  return execution_id;
end;
$$;

create or replace function public.reconcile_expired_redemptions(target_user uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  effective_user uuid := target_user;
  item record;
  count_reversed integer := 0;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_platform_owner() then
    if effective_user is null then effective_user := auth.uid(); end if;
    if effective_user <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  end if;
  for item in
    select r.id, r.reward_id from public.loyalty_redemptions r
    where r.status = 'requested' and r.expires_at <= now()
      and (effective_user is null or r.user_id = effective_user)
    for update
  loop
    update public.loyalty_redemptions set status = 'cancelled' where id = item.id;
    update public.wallet_transactions set status = 'reversed'
      where redemption_id = item.id and kind = 'redemption' and status <> 'reversed';
    update public.loyalty_rewards set stock = stock + 1, updated_at = now() where id = item.reward_id;
    insert into public.audit_logs(actor_id, action, entity_type, entity_id)
      values(auth.uid(), 'redemption_cancelled', 'loyalty_redemption', item.id);
    count_reversed := count_reversed + 1;
  end loop;
  return count_reversed;
end;
$$;

create or replace function public.redeem_loyalty_reward(reward_slug text, request_key text)
returns table(id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  reward public.loyalty_rewards;
  existing public.loyalty_redemptions;
  balance record;
  new_id uuid;
  raw_token text;
  expiration timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(btrim(request_key), '') is null or length(request_key) > 200 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if not exists(select 1 from public.profiles where id = auth.uid() and status = 'active') then
    raise exception 'PARTICIPANT_INACTIVE';
  end if;

  select r.* into existing from public.loyalty_redemptions r
  where r.user_id = auth.uid() and r.idempotency_key = request_key;
  if found then
    if not exists(select 1 from public.loyalty_rewards rw where rw.id = existing.reward_id and rw.slug = reward_slug) then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    id := existing.id; token := existing.token; expires_at := existing.expires_at;
    return next; return;
  end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  select r.* into existing from public.loyalty_redemptions r
  where r.user_id = auth.uid() and r.idempotency_key = request_key;
  if found then
    id := existing.id; token := existing.token; expires_at := existing.expires_at;
    return next; return;
  end if;

  perform public.reconcile_expired_redemptions(auth.uid());
  select * into reward from public.loyalty_rewards where slug = reward_slug and active for update;
  if not found then raise exception 'REWARD_NOT_FOUND'; end if;
  if reward.stock <= 0 then raise exception 'OUT_OF_STOCK'; end if;
  select * into balance from public.wallet_balance(auth.uid());
  if balance.available < reward.points_required then raise exception 'INSUFFICIENT_POINTS'; end if;

  insert into public.loyalty_redemptions(
    user_id, reward_id, points, status, token, token_hash, idempotency_key, expires_at
  ) values (
    auth.uid(), reward.id, reward.points_required, 'requested', 'PENDING',
    encode(digest(gen_random_uuid()::text, 'sha256'), 'hex'), request_key, now()
  ) returning public.loyalty_redemptions.id, public.loyalty_redemptions.token,
    public.loyalty_redemptions.expires_at into new_id, raw_token, expiration;
  update public.loyalty_rewards set stock = stock - 1, updated_at = now()
    where id = reward.id and stock > 0;
  if not found then raise exception 'OUT_OF_STOCK'; end if;
  insert into public.wallet_transactions(
    user_id, kind, status, points, concept, redemption_id, idempotency_key, created_by
  ) values (
    auth.uid(), 'redemption', 'confirmed', -reward.points_required,
    'Reserva de beneficio · ' || reward.name, new_id, 'redemption:' || new_id, auth.uid()
  );
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    values(auth.uid(), 'redemption_request', 'loyalty_redemption', new_id,
      jsonb_build_object('reward_id', reward.id, 'points', reward.points_required));
  id := new_id; token := raw_token; expires_at := expiration;
  return next;
end;
$$;

create or replace function public.check_loyalty_token(raw_token text)
returns table(valid boolean, reason text, redemption_id uuid, reward_name text,
  participant_name text, venue_name text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  item public.loyalty_redemptions;
  reward public.loyalty_rewards;
  recent_failures integer;
  rate_limit integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select token_validation_rate_limit into rate_limit from public.loyalty_settings where id = true;
  select count(*) into recent_failures from public.audit_logs
    where actor_id = auth.uid() and action = 'token_validation_failed'
      and created_at > now() - interval '1 minute';
  if recent_failures >= coalesce(rate_limit, 10) then raise exception 'RATE_LIMITED'; end if;

  if not exists(select 1 from public.profiles where id = auth.uid() and status = 'active') then
    insert into public.audit_logs(actor_id, action, entity_type, metadata)
      values(auth.uid(), 'token_validation_failed', 'loyalty_redemption', jsonb_build_object('reason', 'actor_inactive'));
    valid := false; reason := 'invalid'; return next; return;
  end if;
  select * into item from public.loyalty_redemptions
    where token_hash = encode(digest(upper(trim(raw_token)), 'sha256'), 'hex');
  if not found then
    insert into public.audit_logs(actor_id, action, entity_type, metadata)
      values(auth.uid(), 'token_validation_failed', 'loyalty_redemption', jsonb_build_object('reason', 'not_found'));
    valid := false; reason := 'invalid'; return next; return;
  end if;
  select * into reward from public.loyalty_rewards where id = item.reward_id;
  if not (public.is_platform_owner() or public.can_manage_venue(reward.venue_id)) then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
      values(auth.uid(), 'token_validation_failed', 'loyalty_redemption', item.id, jsonb_build_object('reason', 'wrong_merchant'));
    valid := false; reason := 'invalid'; return next; return;
  end if;
  if not exists(select 1 from public.profiles where id = item.user_id and status = 'active') then
    insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
      values(auth.uid(), 'token_validation_failed', 'loyalty_redemption', item.id, jsonb_build_object('reason', 'participant_inactive'));
    valid := false; reason := 'invalid'; return next; return;
  end if;
  if item.status <> 'requested' then
    valid := false; reason := item.status; return next; return;
  end if;
  if item.expires_at <= now() then
    update public.loyalty_redemptions set status = 'cancelled'
      where id = item.id and status = 'requested';
    if found then
      update public.wallet_transactions set status = 'reversed'
        where redemption_id = item.id and kind = 'redemption' and status <> 'reversed';
      update public.loyalty_rewards set stock = stock + 1, updated_at = now() where id = reward.id;
      insert into public.audit_logs(actor_id, action, entity_type, entity_id)
        values(auth.uid(), 'redemption_cancelled', 'loyalty_redemption', item.id);
    end if;
    valid := false; reason := 'expired'; return next; return;
  end if;
  valid := true; reason := 'ok'; redemption_id := item.id;
  reward_name := reward.name; expires_at := item.expires_at;
  select nullif(full_name, '') into participant_name from public.profiles where id = item.user_id;
  select name into venue_name from public.venues where id = reward.venue_id;
  return next;
end;
$$;

create or replace function public.adjust_wallet(target_user uuid, adjustment_points integer,
  concept text, request_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  tx public.wallet_transactions;
  balance record;
begin
  if not public.is_platform_owner() then raise exception 'FORBIDDEN'; end if;
  if adjustment_points = 0 or nullif(btrim(concept), '') is null then raise exception 'INVALID_ADJUSTMENT'; end if;
  if nullif(btrim(request_key), '') is null or length(request_key) > 200 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  select * into tx from public.wallet_transactions
    where user_id = target_user and idempotency_key = request_key;
  if found then
    if tx.kind <> 'adjustment' or tx.points <> adjustment_points or tx.concept <> btrim(concept) then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return tx.id;
  end if;
  if not exists(select 1 from public.profiles where id = target_user and status = 'active') then
    raise exception 'PARTICIPANT_INACTIVE';
  end if;
  perform pg_advisory_xact_lock(hashtext(target_user::text));
  select * into balance from public.wallet_balance(target_user);
  if adjustment_points < 0 and balance.available + adjustment_points < 0 then
    raise exception 'INSUFFICIENT_POINTS';
  end if;
  insert into public.wallet_transactions(
    user_id, kind, status, points, concept, idempotency_key, created_by
  ) values (
    target_user, 'adjustment', 'confirmed', adjustment_points, btrim(concept), request_key, auth.uid()
  ) returning * into tx;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
    values(auth.uid(), 'wallet_adjust', 'wallet_transaction', tx.id,
      jsonb_build_object('points', adjustment_points, 'target_user', target_user));
  return tx.id;
end;
$$;

notify pgrst, 'reload schema';
