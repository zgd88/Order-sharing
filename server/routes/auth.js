const express = require('express');
const db = require('../db');
const { signUser, authUser } = require('../middleware/auth');

const router = express.Router();

// 登录：开发期用 deviceId 生成 mock openid（预留 wx.login code 换 openid 的接入位）
router.post('/login', (req, res) => {
  const { deviceId, code, role, nickname, avatarUrl } = req.body || {};
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
  };
}

module.exports = router;
