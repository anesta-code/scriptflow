-- Prevent multiple ScriptFlow profiles from using the same email address.
-- The normalized expression treats casing and surrounding whitespace consistently.
-- Existing data was checked before adding this index; the duplicate check returned no rows.

create unique index if not exists profiles_email_normalized_unique
on public.profiles (lower(trim(email)))
where email is not null
  and trim(email) <> '';
