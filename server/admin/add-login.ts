// Adds (or replaces) a team login for the read-only /admin view, on the server, from a hash made on
// Son's Mac with hash.ts (the password itself never comes here). Run inside the app's container:
//   docker exec -i lessonbloom-meta npx tsx server/admin/add-login.ts <email> < hash-file
//   docker exec lessonbloom-meta npx tsx server/admin/add-login.ts <email> --remove
import { config } from '../config.ts';
import { pgSql } from '../db/sql.ts';

const email = String(process.argv[2] ?? '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !config.databaseUrl) { console.error('usage: add-login.ts <email> [--remove] < hash-file (needs DATABASE_URL)'); process.exit(1); }
const sql = pgSql(config.databaseUrl);
if (process.argv[3] === '--remove') { await sql.query('delete from admin_logins where email = $1', [email]); console.log(`removed ${email}`); process.exit(0); }
let hash = '';
for await (const chunk of process.stdin) hash += chunk;
hash = hash.trim();
if (!/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(hash)) { console.error('That is not a hash from hash.ts.'); process.exit(1); }
await sql.query('insert into admin_logins (email, pass) values ($1, $2) on conflict (email) do update set pass = excluded.pass', [email, hash]);
console.log(`saved ${email}`);
process.exit(0);
