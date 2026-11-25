create extension if not exists pgcrypto;

create table if not exists public.coupons (
  code text primary key check (code = upper(code)),
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(10, 2) not null check (discount_value > 0),
  expiry_date date,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  reserved_count integer not null default 0 check (reserved_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  customer_details jsonb not null default '{}'::jsonb,
  items jsonb not null,
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  coupon_code text references public.coupons(code),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  tip_amount numeric(12, 2) not null default 0 check (tip_amount >= 0),
  tip_percentage numeric(5, 2),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  payment_method text not null check (payment_method in ('paystack', 'paypal', 'crypto')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'expired')),
  payment_reference text,
  crypto_tx_hash text,
  crypto_currency text,
  crypto_amount numeric(24, 12),
  coupon_reserved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_email_created_idx on public.orders(user_email, created_at desc);
create index if not exists orders_payment_status_idx on public.orders(payment_status, created_at desc);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null check (provider in ('paystack', 'paypal', 'nowpayments')),
  reference text not null,
  status text not null,
  raw_response jsonb not null default '{}'::jsonb,
  crypto_tx_hash text,
  crypto_currency text,
  crypto_amount numeric(24, 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, reference)
);

alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;

revoke all on public.coupons, public.orders, public.payments from anon, authenticated;
grant all on public.coupons, public.orders, public.payments to service_role;

create or replace function public.expire_stale_checkout_orders()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stale_order record;
begin
  for v_stale_order in
    select id, coupon_code, coupon_reserved
    from public.orders
    where payment_status = 'pending'
      and created_at < now() - interval '1 hour'
      and (coupon_reserved or payment_reference is not null)
    for update skip locked
  loop
    update public.orders set payment_status = 'expired', coupon_reserved = false, updated_at = now()
    where id = v_stale_order.id;

    if v_stale_order.coupon_reserved and v_stale_order.coupon_code is not null then
      update public.coupons set reserved_count = greatest(0, reserved_count - 1)
      where code = v_stale_order.coupon_code;
    end if;
  end loop;
end;
$$;

create or replace function public.create_checkout_order(
  p_user_email text,
  p_customer_details jsonb,
  p_items jsonb,
  p_subtotal numeric,
  p_coupon_code text,
  p_tip_percentage numeric,
  p_custom_tip numeric,
  p_payment_method text
)
returns table(order_id uuid, discount_amount numeric, tip_amount numeric, total_amount numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_coupon public.coupons%rowtype;
  v_order_id uuid;
  v_discount numeric(12, 2) := 0;
  v_tip numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_discounted_subtotal numeric(12, 2);
  v_stale_order record;
begin
  for v_stale_order in
    select id, coupon_code, coupon_reserved
    from public.orders
    where payment_status = 'pending'
      and created_at < now() - interval '1 hour'
      and (coupon_reserved or payment_reference is not null)
    for update skip locked
  loop
    update public.orders set payment_status = 'expired', coupon_reserved = false, updated_at = now()
    where id = v_stale_order.id;
    if v_stale_order.coupon_reserved and v_stale_order.coupon_code is not null then
      update public.coupons set reserved_count = greatest(0, reserved_count - 1)
      where code = v_stale_order.coupon_code;
    end if;
  end loop;

  if p_payment_method not in ('paystack', 'paypal', 'crypto') then
    raise exception 'Unsupported payment method';
  end if;
  if p_subtotal < 0 or p_custom_tip < 0 then
    raise exception 'Invalid order amount';
  end if;

  if nullif(trim(p_coupon_code), '') is not null then
    select * into v_coupon
    from public.coupons
    where code = upper(trim(p_coupon_code))
    for update;

    if not found or not v_coupon.is_active then raise exception 'Coupon is not active'; end if;
    if v_coupon.expiry_date is not null and v_coupon.expiry_date < current_date then
      raise exception 'Coupon has expired';
    end if;
    if v_coupon.max_uses is not null and v_coupon.used_count + v_coupon.reserved_count >= v_coupon.max_uses then
      raise exception 'Coupon usage limit reached';
    end if;

    if v_coupon.discount_type = 'percentage' then
      v_discount := round(p_subtotal * v_coupon.discount_value / 100, 2);
    else
      v_discount := v_coupon.discount_value;
    end if;
    v_discount := least(p_subtotal, greatest(0, v_discount));
    update public.coupons set reserved_count = reserved_count + 1 where code = v_coupon.code;
  end if;

  v_discounted_subtotal := p_subtotal - v_discount;
  if p_tip_percentage is not null then
    if p_tip_percentage not in (0, 10, 20, 30) then raise exception 'Invalid tip percentage'; end if;
    v_tip := round(v_discounted_subtotal * p_tip_percentage / 100, 2);
  else
    v_tip := round(p_custom_tip, 2);
  end if;
  v_total := v_discounted_subtotal + v_tip;

  insert into public.orders (
    user_email, customer_details, items, subtotal, coupon_code, discount_amount,
    tip_amount, tip_percentage, total_amount, payment_method, coupon_reserved
  ) values (
    lower(trim(p_user_email)), coalesce(p_customer_details, '{}'::jsonb), p_items,
    round(p_subtotal, 2), nullif(upper(trim(p_coupon_code)), ''), v_discount,
    v_tip, p_tip_percentage, v_total, p_payment_method,
    nullif(trim(p_coupon_code), '') is not null
  ) returning id into v_order_id;

  return query select v_order_id, v_discount, v_tip, v_total;
end;
$$;

create or replace function public.finalize_checkout_payment(
  p_order_id uuid,
  p_provider text,
  p_reference text,
  p_status text,
  p_raw_response jsonb,
  p_crypto_tx_hash text default null,
  p_crypto_currency text default null,
  p_crypto_amount numeric default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_status not in ('pending', 'paid', 'failed', 'expired') then
    raise exception 'Invalid payment state';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  insert into public.payments (
    order_id, provider, reference, status, raw_response,
    crypto_tx_hash, crypto_currency, crypto_amount
  ) values (
    p_order_id, p_provider, p_reference, p_status, coalesce(p_raw_response, '{}'::jsonb),
    p_crypto_tx_hash, p_crypto_currency, p_crypto_amount
  ) on conflict (provider, reference) do update set
    status = excluded.status,
    raw_response = excluded.raw_response,
    crypto_tx_hash = coalesce(excluded.crypto_tx_hash, public.payments.crypto_tx_hash),
    crypto_currency = coalesce(excluded.crypto_currency, public.payments.crypto_currency),
    crypto_amount = coalesce(excluded.crypto_amount, public.payments.crypto_amount),
    updated_at = now();

  if v_order.payment_status = 'paid' then return; end if;

  if p_status = 'paid' then
    update public.orders set payment_status = 'paid', payment_reference = p_reference,
      crypto_tx_hash = coalesce(p_crypto_tx_hash, crypto_tx_hash),
      crypto_currency = coalesce(p_crypto_currency, crypto_currency),
      crypto_amount = coalesce(p_crypto_amount, crypto_amount),
      coupon_reserved = false, updated_at = now() where id = p_order_id;
    if v_order.coupon_code is not null then
      update public.coupons set
        reserved_count = case when v_order.coupon_reserved then greatest(0, reserved_count - 1) else reserved_count end,
        used_count = used_count + 1
      where code = v_order.coupon_code;
    end if;
  elsif p_status in ('failed', 'expired') and v_order.payment_status = 'pending' then
    update public.orders set payment_status = p_status, coupon_reserved = false,
      payment_reference = coalesce(p_reference, payment_reference), updated_at = now()
      where id = p_order_id;
    if v_order.coupon_reserved and v_order.coupon_code is not null then
      update public.coupons set reserved_count = greatest(0, reserved_count - 1)
      where code = v_order.coupon_code;
    end if;
  end if;
end;
$$;

create or replace function public.cancel_checkout_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.payment_status <> 'pending' then return; end if;

  update public.orders set payment_status = 'expired', coupon_reserved = false, updated_at = now()
  where id = p_order_id;

  if v_order.coupon_reserved and v_order.coupon_code is not null then
    update public.coupons set reserved_count = greatest(0, reserved_count - 1)
    where code = v_order.coupon_code;
  end if;
end;
$$;

revoke all on function public.create_checkout_order(text, jsonb, jsonb, numeric, text, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.finalize_checkout_payment(uuid, text, text, text, jsonb, text, text, numeric) from public, anon, authenticated;
revoke all on function public.cancel_checkout_order(uuid) from public, anon, authenticated;
revoke all on function public.expire_stale_checkout_orders() from public, anon, authenticated;
grant execute on function public.create_checkout_order(text, jsonb, jsonb, numeric, text, numeric, numeric, text) to service_role;
grant execute on function public.finalize_checkout_payment(uuid, text, text, text, jsonb, text, text, numeric) to service_role;
grant execute on function public.cancel_checkout_order(uuid) to service_role;
grant execute on function public.expire_stale_checkout_orders() to service_role;