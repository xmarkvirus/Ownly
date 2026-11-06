-- RLS policies filter rows, but roles still need table-level SELECT privileges.
-- These grants allow authenticated application queries; existing RLS policies
-- continue to restrict listings, categories, and profiles by row.
grant select on table public.listings, public.categories, public.profiles to authenticated;
