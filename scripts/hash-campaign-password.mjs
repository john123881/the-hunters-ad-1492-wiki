import { pbkdf2Sync, randomBytes } from 'node:crypto';
const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('用法：npm run auth:hash-password -- <至少 8 字元的密碼>');
  process.exit(1);
}
const iterations = 100_000;
const salt = randomBytes(16);
const digest = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
console.log('pbkdf2_sha256$' + iterations + '$' + salt.toString('base64url') + '$' + digest.toString('base64url'));
