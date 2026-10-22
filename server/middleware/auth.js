const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'peixue-dev-secret-change-in-production';

function signUser(user) {
  return jwt.sign({ typ: 'user', uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
}

function signAdmin(admin) {
  return jwt.sign({ typ: 'admin', aid: admin.id }, JWT_SECRET, { expiresIn: '12h' });
}

function authUser(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ code: 401, message: '未登录' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.typ !== 'user') return res.status(401).json({ code: 401, message: '令牌类型错误' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
    if (!user) return res.status(401).json({ code: 401, message: '用户不存在' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' });
  }
}

// 老师专用：需已通过资质认证
function authTeacher(req, res, next) {
  authUser(req, res, () => {
    const profile = db
      .prepare('SELECT * FROM teacher_profiles WHERE user_id = ?')
      .get(req.user.id);
    if (!profile || profile.audit_status !== 'approved') {
      return res.status(403).json({ code: 403, message: '请先完成老师资质认证并通过审核' });
    }
    req.teacherProfile = profile;
    next();
  });
}

function authAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ code: 401, message: '未登录' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.typ !== 'admin') return res.status(401).json({ code: 401, message: '令牌类型错误' });
    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(payload.aid);
    if (!admin) return res.status(401).json({ code: 401, message: '管理员不存在' });
    req.admin = admin;
    next();
  } catch (e) {
    return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' });
  }
}

module.exports = { JWT_SECRET, signUser, signAdmin, authUser, authTeacher, authAdmin };
