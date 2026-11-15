-- STARTER blocked-name list for the product owner to review and extend.
-- Deliberately minimal. It is not a complete moderation list and does not catch
-- look-alike spellings (leetspeak) or other languages.
--
-- Matching is on the normalised name (lower-case, separators removed):
--   'exact'    blocks only when the whole name equals the entry
--   'contains' blocks when the entry appears anywhere in the name
-- Use 'contains' sparingly: short words block innocent names (the Scunthorpe problem).
-- Safe to run more than once. Run as the service role / postgres.

insert into public.blocked_names (word, match) values
  -- Reserved or authority-sounding names (exact, so "Badminton" is fine)
  ('admin', 'exact'),
  ('administrator', 'exact'),
  ('moderator', 'exact'),
  ('mod', 'exact'),
  ('support', 'exact'),
  ('staff', 'exact'),
  ('teacher', 'exact'),
  ('official', 'exact'),
  ('owner', 'exact'),
  ('root', 'exact'),
  ('system', 'exact'),
  -- The site's own name (anywhere in the name)
  ('musictheorynow', 'contains'),
  -- Common English profanities and slurs (starter set; extend as needed)
  ('fuck', 'contains'),
  ('shit', 'contains'),
  ('cunt', 'contains'),
  ('bitch', 'contains'),
  ('wanker', 'contains'),
  ('twat', 'contains'),
  ('slut', 'contains'),
  ('whore', 'contains'),
  ('nigger', 'contains'),
  ('nigga', 'contains'),
  ('faggot', 'contains'),
  ('retard', 'contains'),
  ('dick', 'exact'),
  ('cock', 'exact')
on conflict (normalised, match) do nothing;
