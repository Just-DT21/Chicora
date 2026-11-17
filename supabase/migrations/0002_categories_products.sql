-- ============================================================================
-- 0002 — categories and products
-- CHICORA · run 2nd
-- ============================================================================

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) between 2 and 60),
  slug       text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(trim(name)) between 2 and 140),
  description      text not null default '',
  price            numeric(10, 2) not null check (price > 0),
  discounted_price numeric(10, 2)
                     check (discounted_price is null or (discounted_price > 0 and discounted_price < price)),
  category_id      uuid not null references public.categories (id) on delete restrict,
  stock_quantity   integer not null default 0 check (stock_quantity >= 0),
  images           text[] not null default '{}',
  is_featured      boolean not null default false,
  is_new_arrival   boolean not null default false,
  is_published     boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_published_idx on public.products (is_published, is_featured, created_at desc);
