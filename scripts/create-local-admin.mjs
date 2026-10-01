import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const [usernameInput, displayNameInput, password] = process.argv.slice(2);
const username = usernameInput?.trim().toLowerCase() ?? '';
const displayName = displayNameInput?.trim() ?? '';
if (!/^[a-z0-9._-]{3,40}$/.test(username) || !displayName || displayName.length > 40 || !password || password.length < 12) {
  console.error('用法：npm run admin:create-local -- <帳號> <顯示名稱> <至少 12 字元密碼>');
  process.exit(1);
}
const sqlText = value => "'" + value.replaceAll("'", "''") + "'";
const rounds = 310000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, rounds, 32, 'sha256');
const passwordHash = `pbkdf2_sha256$${rounds}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
const command = `
  INSERT INTO admin_users (username, display_name, password_hash)
  VALUES (${sqlText(username)}, ${sqlText(displayName)}, ${sqlText(passwordHash)})
  ON CONFLICT(username) DO UPDATE SET
    display_name = excluded.display_name,
    password_hash = excluded.password_hash,
    is_active = 1,
    updated_at = datetime('now');
`.replace(/\s+/g, ' ').trim();
const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'hunters-db', '--local', '--command', command], {
  stdio: 'inherit',
  env: { ...process.env, WRANGLER_LOG_PATH: '.cache/wrangler' },
  shell: process.platform === 'win32',
});
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`本機管理者 ${username} 已建立或更新。`);
