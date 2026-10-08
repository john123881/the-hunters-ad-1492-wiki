import { pbkdf2Sync, randomBytes } from 'node:crypto';
const password=process.argv[2];
if(!password || password.length<12){console.error('用法：npm run admin:hash-password -- <至少 12 字元的密碼>');process.exit(1);}
const rounds=100000,salt=randomBytes(16),hash=pbkdf2Sync(password,salt,rounds,32,'sha256');
const b=value=>value.toString('base64url');
console.log(`pbkdf2_sha256$${rounds}$${b(salt)}$${b(hash)}`);
