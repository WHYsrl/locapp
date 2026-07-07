-- Google SSO (SPEC.md §4 Auth): users can sign in with a Google ID token.
-- google_sub links the Google account; auth_provider tracks how the user was provisioned.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'password';
