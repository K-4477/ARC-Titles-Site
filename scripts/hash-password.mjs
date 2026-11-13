// Makes the values for the admin login environment variables. Nothing is sent anywhere.
//   npm run hash-password
// Paste the two printed lines into Vercel -> Project -> Settings -> Environment Variables.
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../server/auth.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question('Choose an admin password (at least 12 characters): ');
rl.close();

if (password.length < 12) {
  console.error('Too short. Use at least 12 characters.');
  process.exit(1);
}

console.log('\nADMIN_PASSWORD_HASH=' + hashPassword(password));
console.log('SESSION_SECRET=' + randomBytes(32).toString('base64url'));
console.log('\nKeep these out of git. The password itself is not stored anywhere.');
