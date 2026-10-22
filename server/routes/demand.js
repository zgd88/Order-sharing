const express = require('express');
const db = require('../db');
const { authUser } = require('../middleware/auth');
const { maskAddress, normalizeProvince, selectTeacher, closeOrder } = require('../services/demand');

const router = express.Router();
router.use(authUser);

const SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '政治', '历史', '地理', '编程', '美术', '音乐', '书法', '舞蹈', '其他'];

// 发布需求
router.post('/', (req, res) => {
  const b = req.body || {};
  const { subject, grade, hourlyRateCents, phone, province, city, address, lat, lng } = b;
  if (!subject || !hourlyRateCents || !phone || !city || !address) {
    return res.status(400).json({ code: 400, message: '请填写完整的需求信息（科目/课时费/电话/地点）' });
  }
  if (!/^1\d{10}$/.test(String(phone))) {
    return res.status(400).json({ code: 400, message: '请填写正确的手机号' });
  }
  const rate = Number(hourlyRateCents);
  if (!Number.isInteger(rate) || rate <= 0) {
    return res.status(400).json({ code: 400, message: '课时费不正确' });
  }
  const now = Date.now();
  const ins = db
    .prepare(
      `INSERT INTO demand_orders
       (parent_id, subject, grade, hourly_rate_cents, phone, province, city, address, address_display,
        status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'recruiting', ?, ?)`
    )
    .run(req.user.id, subject, grade || null, rate, String(phone), normalizeProvince(province), city, address,
      maskAddress(address), now, now);
  res.json({ code: 0, data: { id: Number(ins.lastInsertRowid) }, message: '需求发布成功，等待老师投递' });
});

// 我的需求列表（含投递数）
router.get('/mine', (req, res) => {
  const rows = db
    .prepare(
      `SELECT o.*,
              (SELECT COUNT(*) FROM demand_applications a WHERE a.order_id = o.id) AS application_count
       FROM demand_orders o WHERE o.parent_id = ? ORDER BY o.created_at DESC`
    )
    .all(req.user.id);
  res.json({ code: 0, data: rows.map(sanitizeParentOrder) });
});

// 需求详情（本人：含投递简历列表，含老师信息；电话可看自己的）
router.get('/:id', (req, res) => {
  const o = db.prepare('SELECT * FROM demand_orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ code: 404, message: '需求不存在' });
  const isOwner = o.parent_id === req.user.id;
  const apps = db
    .prepare(
      `SELECT a.*, u.nickname, u.avatar_url, u.phone AS teacher_phone,
              p.real_name, p.education, p.major, p.subject AS teacher_subject,
              p.years_experience, p.intro AS teacher_intro
       FROM demand_applications a
       JOIN users u ON u.id = a.teacher_id
       LEFT JOIN teacher_profiles p ON p.user_id = a.teacher_id
       WHERE a.order_id = ? ORDER BY a.created_at ASC`
    )
    .all(o.id);
  const data = {
    ...sanitizeParentOrder(o),
    applications: apps.map((a) => ({
      id: a.id,
      teacherId: a.teacher_id,
      nickname: a.nickname,
      avatarUrl: a.avatar_url,
      realName: a.real_name,
      education: a.education,
      major: a.major,
      teacherSubject: a.teacher_subject,
      yearsExperience: a.years_experience,
      teacherIntro: a.teacher_intro,
      note: a.note,
      status: a.status,
      createdAt: a.created_at,
    })),
  };
  if (!isOwner) {
    // 非订单所有者（仅家长本人可看投递列表）
    return res.status(403).json({ code: 403, message: '无权查看该需求的投递列表' });
  }
  res.json({ code: 0, data });
});

// 选择老师（锁单）
router.post('/:id/select', (req, res) => {
  const { applicationId } = req.body || {};
  if (!applicationId) return res.status(400).json({ code: 400, message: '缺少投递 ID' });
  const r = selectTeacher(Number(req.params.id), Number(applicationId), req.user.id);
  if (!r.ok) return res.status(r.code || 400).json({ code: r.code || 400, message: r.message });
  res.json({ code: 0, message: '订单已锁定，平台客服将尽快与您和老师联系' });
});

// 关闭订单
router.post('/:id/close', (req, res) => {
  closeOrder(Number(req.params.id), req.user.id);
  res.json({ code: 0, message: '需求已关闭' });
});

function sanitizeParentOrder(o) {
  return {
    id: o.id,
    subject: o.subject,
    grade: o.grade,
    hourlyRateCents: o.hourly_rate_cents,
    phone: o.phone,
    province: o.province,
    city: o.city,
    address: o.address,
    addressDisplay: o.address_display,
    status: o.status,
    selectedTeacherId: o.selected_teacher_id,
    selectedApplicationId: o.selected_application_id,
    lockedAt: o.locked_at,
    closedAt: o.closed_at,
    remark: o.remark,
    applicationCount: o.application_count,
    createdAt: o.created_at,
  };
}

module.exports = { router, SUBJECTS };
