// The hash for a team login: reads the password on stdin, prints only its scrypt hash (for admin_logins).
//   npx tsx server/admin/hash.ts < password-file
import { hashPass } from './admin.ts';
let pass = '';
for await (const chunk of process.stdin) pass += chunk;
pass = pass.trim();
if (pass.length < 16) { console.error('The password must be at least 16 characters.'); process.exit(1); }
console.log(hashPass(pass));
