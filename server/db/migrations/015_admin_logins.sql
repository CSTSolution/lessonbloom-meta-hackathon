-- Read-only admin logins for the team (Son, 29 Oct: Chi opens /admin with her email and a password).
-- Only the scrypt hash is kept; the password is made and kept on Son's Mac.
create table admin_logins (
  email       text primary key,
  pass        text not null,          -- scrypt$<salt hex>$<hash hex>
  created_at  timestamptz not null default now(),
  last_at     timestamptz
);
