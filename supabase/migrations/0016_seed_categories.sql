-- ============================================================================
-- 0016 — seed category shelves
-- CHICORA · run 16th (optional, safe to re-run)
-- ----------------------------------------------------------------------------
-- Only the nine shelves the storefront expects. Products are created by the
-- admin UI, or copied from the local store with `npm run db:migrate`.
-- ============================================================================

insert into public.categories (name, slug) values
  ('Birthday Gifts', 'birthday-gifts'),
  ('Cute Gifts', 'cute-gifts'),
  ('Personalized Gifts', 'personalized-gifts'),
  ('Accessories', 'accessories'),
  ('Soft Toys', 'soft-toys'),
  ('Decorative Gifts', 'decorative-gifts'),
  ('Couple Gifts', 'couple-gifts'),
  ('Surprise Boxes', 'surprise-boxes'),
  ('Other', 'other')
on conflict (slug) do nothing;
