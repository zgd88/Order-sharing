const express = require('express');
const db = require('../db');
const { signUser, authUser } = require('../middleware/auth');

const router = express.Router();

// 注册：手机号+密码（bcrypt 加密），注册成功直接返回登录态
router.post('/register', (req, res) => {
  const { phone, password, role, nickname } = req.body || {};
  try {
    const r = require('../services/auth').register({ phone, password, role, nickname });
    res.json({ code: 0, data: r, message: '注册成功' });
  } catch (e) {
    res.status(e.statusCode || 400).json({ code: e.statusCode || 400, message: e.message });
  }
});

// 修改密码（需登录）
router.post('/change-password', authUser, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  try {
    require('../services/auth').changePassword(req.user.id, oldPassword, newPassword);
    res.json({ code: 0, message: '密码修改成功' });
  } catch (e) {
    res.status(e.statusCode || 400).json({ code: e.statusCode || 400, message: e.message });
  }
});

// 登录：
// - 传 phone+password → 注册账号密码登录
// - 传 deviceId → 演示模式 mock 登录（开发测试用，预留 wx.login code 换 openid 的接入位）
router.post('/login', (req, res) => {
  const { phone, password, deviceId, code, role, nickname, avatarUrl } = req.body || {};
  if (phone) {
    try {
      const r = require('../services/auth').loginByPassword(phone, password);
      return res.json({ code: 0, data: r, message: '登录成功' });
    } catch (e) {
      return res.status(e.statusCode || 400).json({ code: e.statusCode || 400, message: e.message });
    }
  }
  if (!deviceId && !code) {
    return res.status(400).json({ code: 400, message: '缺少 deviceId' });
  }
  // 生产环境：用 code 调微信 jscode2session 换取 openid
  const openid = code ? `wx_${code}` : `mock_${String(deviceId).slice(0, 40)}`;
  const now = Date.now();
  let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid);
  if (!user) {
    const ins = db
      .prepare(
        'INSERT INTO users (openid, nickname, avatar_url, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(openid, nickname || '微信用户', avatarUrl || null, role === 'teacher' ? 'teacher' : 'parent', now, now);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(ins.lastInsertRowid));
  } else {
    const fields = [];
    const args = [];
    if (nickname) { fields.push('nickname = ?'); args.push(nickname); }
    if (avatarUrl) { fields.push('avatar_url = ?'); args.push(avatarUrl); }
    if (role === 'teacher' || role === 'parent') { fields.push('role = ?'); args.push(role); }
    fields.push('updated_at = ?'); args.push(now);
    args.push(user.id);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }
  const token = signUser(user);
  res.json({ code: 0, data: { token, user: sanitizeUser(user) } });
});

// 切换身份（当前账号，支持注册账号与演示账号）
router.post('/switch-role', authUser, (req, res) => {
  const { role } = req.body || {};
  if (!['teacher', 'parent'].includes(role)) {
    return res.status(400).json({ code: 400, message: '身份参数不正确' });
  }
  db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, Date.now(), req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ code: 0, data: { token: signUser(user), user: sanitizeUser(user) } });
});

router.get('/me', authUser, (req, res) => {
  res.json({ code: 0, data: sanitizeUser(req.user) });
});

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

module.exports = router;
