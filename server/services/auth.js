const bcrypt = require('bcryptjs');
const db = require('../db');
const { signUser } = require('../middleware/auth');

function err(message) {
  const e = new Error(message);
  e.statusCode = 400;
  return e;
}

function sanitizeUser(u) {
  return {
    id: u.id,
    nickname: u.nickname,
    avatarUrl: u.avatar_url,
    phone: u.phone,
    city: u.city,
    role: u.role,
    hasPassword: !!u.password_hash,
  };
}

// 注册：手机号+密码，注册成功直接返回登录态
function register({ phone, password, role, nickname }) {
  const p = String(phone || '').trim();
  if (!/^1\d{10}$/.test(p)) throw err('请填写正确的手机号');
  if (!password || password.length < 6 || password.length > 20) throw err('密码长度需为 6-20 位');
  const existing = db.prepare('SELECT * FROM users WHERE phone = ?').get(p);
  if (existing) throw err('该手机号已注册，请直接登录');
  const now = Date.now();
  const hash = bcrypt.hashSync(password, 10);
  const ins = db
    .prepare(
      'INSERT INTO users (openid, nickname, phone, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(`phone_${p}`, nickname || `用户${p.slice(-4)}`, p, hash, role === 'teacher' ? 'teacher' : 'parent', now, now);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(ins.lastInsertRowid));
  return { token: signUser(user), user: sanitizeUser(user) };
}

// 手机号+密码登录
function loginByPassword(phone, password) {
  const p = String(phone || '').trim();
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(p);
  if (!user || !user.password_hash) throw err('账号或密码错误');
  if (!bcrypt.compareSync(password || '', user.password_hash)) throw err('账号或密码错误');
  return { token: signUser(user), user: sanitizeUser(user) };
}

// 修改密码
function changePassword(userId, oldPassword, newPassword) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || !user.password_hash) throw err('当前账号未设置密码');
  if (!bcrypt.compareSync(oldPassword || '', user.password_hash)) throw err('原密码不正确');
  if (!newPassword || newPassword.length < 6 || newPassword.length > 20) throw err('新密码长度需为 6-20 位');
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(bcrypt.hashSync(newPassword, 10), Date.now(), userId);
  return { ok: true };
}

module.exports = { register, loginByPassword, changePassword };
