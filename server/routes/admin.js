const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signAdmin, authAdmin } = require('../middleware/auth');
const { cancelCourse } = require('../services/tier-engine');

const router = express.Router();

// ---------------- 登录 ----------------
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username || '');
  if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) {
    return res.status(401).json({ code: 401, message: '账号或密码错误' });
  }
  res.json({ code: 0, data: { token: signAdmin(admin), admin: { id: admin.id, username: admin.username, displayName: admin.display_name } } });
});

router.use(authAdmin);

// ---------------- 数据统计 ----------------
router.get('/stats', (req, res) => {
  const now = Date.now();
  const gmv = db.prepare("SELECT COALESCE(SUM(price_at_join_cents),0) AS v FROM enrollments WHERE status = 'joined'").get().v;
  res.json({
    code: 0,
    data: {
      userCount: db.prepare('SELECT COUNT(*) AS v FROM users').get().v,
      teacherCount: db.prepare("SELECT COUNT(*) AS v FROM teacher_profiles WHERE audit_status = 'approved'").get().v,
      pendingTeacherCount: db.prepare("SELECT COUNT(*) AS v FROM teacher_profiles WHERE audit_status = 'pending'").get().v,
      courseCount: db.prepare('SELECT COUNT(*) AS v FROM courses').get().v,
      activeCourseCount: db.prepare("SELECT COUNT(*) AS v FROM courses WHERE status IN ('recruiting','formed')").get().v,
      enrollmentCount: db.prepare("SELECT COUNT(*) AS v FROM enrollments WHERE status = 'joined'").get().v,
      demandCount: db.prepare('SELECT COUNT(*) AS v FROM demand_orders').get().v,
      lockedDemandCount: db.prepare("SELECT COUNT(*) AS v FROM demand_orders WHERE status = 'locked'").get().v,
      gmvCents: gmv,
      recentCourses: db
        .prepare("SELECT id, title, subject, status, enrolled_count, created_at FROM courses ORDER BY created_at DESC LIMIT 5")
        .all()
        .map((c) => ({ id: c.id, title: c.title, subject: c.subject, status: c.status, enrolledCount: c.enrolled_count, createdAt: c.created_at })),
    },
  });
});

// ---------------- 老师资质审核 ----------------
router.get('/teachers', (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT tp.*, u.nickname, u.avatar_url, u.phone, u.openid
    FROM teacher_profiles tp JOIN users u ON u.id = tp.user_id`;
  const args = [];
  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    sql += ' WHERE tp.audit_status = ?';
    args.push(status);
  }
  sql += ' ORDER BY tp.updated_at DESC';
  const rows = db.prepare(sql).all(...args);
  res.json({
    code: 0,
    data: rows.map((p) => ({
      id: p.id, userId: p.user_id, realName: p.real_name, idCardNo: p.id_card_no,
      certType: p.cert_type, certImageUrl: p.cert_image_url, degreeImageUrl: p.degree_image_url,
      subject: p.subject, education: p.education, major: p.major,
      graduateSchool: p.graduate_school, teachableGrades: p.teachable_grades, intro: p.intro,
      yearsExperience: p.years_experience,
      auditStatus: p.audit_status, rejectReason: p.reject_reason,
      auditedAt: p.audited_at, updatedAt: p.updated_at,
      nickname: p.nickname, avatarUrl: p.avatar_url, phone: p.phone,
    })),
  });
});

router.get('/teachers/:id', (req, res) => {
  const p = db
    .prepare(
      `SELECT tp.*, u.nickname, u.avatar_url, u.phone, u.openid
       FROM teacher_profiles tp JOIN users u ON u.id = tp.user_id WHERE tp.id = ?`
    )
    .get(req.params.id);
  if (!p) return res.status(404).json({ code: 404, message: '认证记录不存在' });
  res.json({
    code: 0,
    data: {
      id: p.id, userId: p.user_id, realName: p.real_name, idCardNo: p.id_card_no,
      certType: p.cert_type, certImageUrl: p.cert_image_url, degreeImageUrl: p.degree_image_url,
      subject: p.subject, intro: p.intro, yearsExperience: p.years_experience,
      auditStatus: p.audit_status, rejectReason: p.reject_reason,
      auditedAt: p.audited_at, updatedAt: p.updated_at,
      nickname: p.nickname, avatarUrl: p.avatar_url, phone: p.phone,
    },
  });
});

router.post('/teachers/:id/audit', (req, res) => {
  const { action, reason } = req.body || {};
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ code: 400, message: '操作类型不正确' });
  }
  const p = db.prepare('SELECT * FROM teacher_profiles WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ code: 404, message: '认证记录不存在' });
  if (p.audit_status !== 'pending') {
    return res.status(400).json({ code: 400, message: '该记录已审核' });
  }
  if (action === 'reject' && !reason) {
    return res.status(400).json({ code: 400, message: '请填写驳回原因' });
  }
  const now = Date.now();
  db.prepare(
    'UPDATE teacher_profiles SET audit_status = ?, reject_reason = ?, audited_by = ?, audited_at = ?, updated_at = ? WHERE id = ?'
  ).run(action === 'approve' ? 'approved' : 'rejected', action === 'reject' ? reason : null, req.admin.id, now, now, p.id);
  res.json({ code: 0, message: action === 'approve' ? '已通过审核' : '已驳回' });
});

// ---------------- 课程管理 ----------------
router.get('/courses', (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT c.*, u.nickname AS teacher_name, tp.real_name
    FROM courses c
    JOIN users u ON u.id = c.teacher_id
    LEFT JOIN teacher_profiles tp ON tp.user_id = c.teacher_id`;
  const args = [];
  if (status && ['recruiting', 'formed', 'failed', 'cancelled', 'finished'].includes(status)) {
    sql += ' WHERE c.status = ?';
    args.push(status);
  }
  sql += ' ORDER BY c.created_at DESC';
  const rows = db.prepare(sql).all(...args);
  res.json({
    code: 0,
    data: rows.map((c) => ({
      id: c.id, title: c.title, subject: c.subject, grade: c.grade, city: c.city,
      address: c.address, startTime: c.start_time, endTime: c.end_time, deadlineAt: c.deadline_at,
      minStudents: c.min_students, maxStudents: c.max_students, enrolledCount: c.enrolled_count,
      currentPriceCents: c.current_unit_price_cents, status: c.status, cancelReason: c.cancel_reason,
      teacherId: c.teacher_id, teacherName: c.teacher_name, teacherRealName: c.real_name,
      createdAt: c.created_at,
      tiers: db.prepare('SELECT min_people, price_cents FROM course_tiers WHERE course_id = ? ORDER BY min_people').all(c.id),
    })),
  });
});

router.get('/courses/:id', (req, res) => {
  const c = db
    .prepare(
      `SELECT c.*, u.nickname AS teacher_name, tp.real_name
       FROM courses c JOIN users u ON u.id = c.teacher_id
       LEFT JOIN teacher_profiles tp ON tp.user_id = c.teacher_id WHERE c.id = ?`
    )
    .get(req.params.id);
  if (!c) return res.status(404).json({ code: 404, message: '课程不存在' });
  const members = db
    .prepare(
      `SELECT e.id, e.join_seq, e.price_at_join_cents, e.current_price_cents, e.status, e.expired_reason,
              e.created_at, u.id AS parent_id, u.nickname, u.phone
       FROM enrollments e JOIN users u ON u.id = e.parent_id
       WHERE e.course_id = ? ORDER BY e.join_seq ASC`
    )
    .all(c.id);
  const refunds = db
    .prepare('SELECT * FROM refund_records WHERE course_id = ? ORDER BY created_at ASC')
    .all(c.id);
  res.json({
    code: 0,
    data: {
      id: c.id, title: c.title, subject: c.subject, grade: c.grade, city: c.city, address: c.address,
      outline: c.outline, startTime: c.start_time, endTime: c.end_time, deadlineAt: c.deadline_at,
      minStudents: c.min_students, maxStudents: c.max_students, enrolledCount: c.enrolled_count,
      currentPriceCents: c.current_unit_price_cents, status: c.status, cancelReason: c.cancel_reason,
      teacherId: c.teacher_id, teacherName: c.teacher_name, teacherRealName: c.real_name,
      createdAt: c.created_at, formedAt: c.formed_at, failedAt: c.failed_at, finishedAt: c.finished_at,
      tiers: db.prepare('SELECT min_people, price_cents FROM course_tiers WHERE course_id = ? ORDER BY min_people').all(c.id),
      members: members.map((m) => ({ ...m, priceAtJoinCents: m.price_at_join_cents, currentPriceCents: m.current_price_cents, expiredReason: m.expired_reason, parentId: m.parent_id })),
      refunds: refunds.map((r) => ({ id: r.id, type: r.type, eventKey: r.event_key, amountCents: r.amount_cents, status: r.status, remark: r.remark, createdAt: r.created_at })),
    },
  });
});

router.post('/courses/:id/cancel', (req, res) => {
  const c = db.prepare('SELECT id FROM courses WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ code: 404, message: '课程不存在' });
  cancelCourse(c.id, 'admin');
  res.json({ code: 0, message: '课程已取消，家长将收到退款' });
});

// ---------------- Banner 管理 ----------------
router.get('/banners', (req, res) => {
  const rows = db.prepare('SELECT * FROM banners ORDER BY sort_order ASC, id ASC').all();
  res.json({
    code: 0,
    data: rows.map((b) => ({
      id: b.id, title: b.title, imageUrl: b.image_url, linkType: b.link_type, linkValue: b.link_value,
      sortOrder: b.sort_order, enabled: b.enabled, startAt: b.start_at, endAt: b.end_at,
    })),
  });
});

router.post('/banners', (req, res) => {
  const { title, imageUrl, linkType, linkValue, sortOrder, enabled, startAt, endAt } = req.body || {};
  if (!title || !imageUrl) return res.status(400).json({ code: 400, message: '标题与图片必填' });
  const now = Date.now();
  const ins = db
    .prepare(
      'INSERT INTO banners (title, image_url, link_type, link_value, sort_order, enabled, start_at, end_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(title, imageUrl, linkType || 'none', linkValue || null, Number(sortOrder) || 0, enabled ? 1 : 0, startAt || null, endAt || null, now, now);
  res.json({ code: 0, data: { id: Number(ins.lastInsertRowid) } });
});

router.put('/banners/:id', (req, res) => {
  const b = db.prepare('SELECT * FROM banners WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ code: 404, message: 'Banner 不存在' });
  const { title, imageUrl, linkType, linkValue, sortOrder, enabled, startAt, endAt } = req.body || {};
  db.prepare(
    'UPDATE banners SET title = ?, image_url = ?, link_type = ?, link_value = ?, sort_order = ?, enabled = ?, start_at = ?, end_at = ?, updated_at = ? WHERE id = ?'
  ).run(title || b.title, imageUrl || b.image_url, linkType || b.link_type,
    linkValue !== undefined ? linkValue : b.link_value, Number(sortOrder) ?? b.sort_order,
    enabled !== undefined ? (enabled ? 1 : 0) : b.enabled, startAt !== undefined ? startAt : b.start_at,
    endAt !== undefined ? endAt : b.end_at, Date.now(), b.id);
  res.json({ code: 0, message: '已保存' });
});

router.delete('/banners/:id', (req, res) => {
  db.prepare('DELETE FROM banners WHERE id = ?').run(req.params.id);
  res.json({ code: 0, message: '已删除' });
});

// ---------------- 家长发单订单管理 ----------------
router.get('/demands', (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT o.*, u.nickname AS parent_nickname,
           tu.nickname AS teacher_nickname, tp.real_name AS teacher_real_name, tu.phone AS teacher_phone,
           (SELECT COUNT(*) FROM demand_applications a WHERE a.order_id = o.id) AS application_count
    FROM demand_orders o
    JOIN users u ON u.id = o.parent_id
    LEFT JOIN users tu ON tu.id = o.selected_teacher_id
    LEFT JOIN teacher_profiles tp ON tp.user_id = o.selected_teacher_id`;
  const args = [];
  if (status && ['recruiting', 'locked', 'closed'].includes(status)) {
    sql += ' WHERE o.status = ?';
    args.push(status);
  }
  sql += ' ORDER BY o.updated_at DESC';
  const rows = db.prepare(sql).all(...args);
  res.json({
    code: 0,
    data: rows.map((o) => ({
      id: o.id, subject: o.subject, grade: o.grade, hourlyRateCents: o.hourly_rate_cents,
      phone: o.phone, province: o.province, city: o.city, address: o.address,
      status: o.status, remark: o.remark, remarkUpdatedAt: o.remark_updated_at,
      parentId: o.parent_id, parentNickname: o.parent_nickname,
      selectedTeacherId: o.selected_teacher_id,
      selectedTeacherNickname: o.teacher_nickname,
      selectedTeacherRealName: o.teacher_real_name,
      selectedTeacherPhone: o.teacher_phone,
      applicationCount: o.application_count,
      lockedAt: o.locked_at, closedAt: o.closed_at, createdAt: o.created_at,
    })),
  });
});

router.get('/demands/:id', (req, res) => {
  const o = db
    .prepare(
      `SELECT o.*, u.nickname AS parent_nickname,
              tu.nickname AS teacher_nickname, tp.real_name AS teacher_real_name,
              tp.education AS teacher_education, tp.major AS teacher_major,
              tp.years_experience AS teacher_years, tu.phone AS teacher_phone
       FROM demand_orders o
       JOIN users u ON u.id = o.parent_id
       LEFT JOIN users tu ON tu.id = o.selected_teacher_id
       LEFT JOIN teacher_profiles tp ON tp.user_id = o.selected_teacher_id
       WHERE o.id = ?`
    )
    .get(req.params.id);
  if (!o) return res.status(404).json({ code: 404, message: '订单不存在' });
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
  res.json({
    code: 0,
    data: {
      id: o.id, subject: o.subject, grade: o.grade, hourlyRateCents: o.hourly_rate_cents,
      phone: o.phone, province: o.province, city: o.city, address: o.address,
      status: o.status, remark: o.remark, remarkUpdatedAt: o.remark_updated_at,
      parentId: o.parent_id, parentNickname: o.parent_nickname,
      selectedTeacherId: o.selected_teacher_id,
      selectedTeacherNickname: o.teacher_nickname,
      selectedTeacherRealName: o.teacher_real_name,
      selectedTeacherEducation: o.teacher_education,
      selectedTeacherMajor: o.teacher_major,
      selectedTeacherYears: o.teacher_years,
      selectedTeacherPhone: o.teacher_phone,
      lockedAt: o.locked_at, closedAt: o.closed_at, createdAt: o.created_at,
      applications: apps.map((a) => ({
        id: a.id, teacherId: a.teacher_id, nickname: a.nickname, avatarUrl: a.avatar_url,
        teacherPhone: a.teacher_phone, realName: a.real_name, education: a.education,
        major: a.major, teacherSubject: a.teacher_subject, yearsExperience: a.years_experience,
        teacherIntro: a.teacher_intro, note: a.note, status: a.status, createdAt: a.created_at,
      })),
    },
  });
});

// 客服备注（跟进状态）
router.put('/demands/:id/remark', (req, res) => {
  const { remark } = req.body || {};
  const o = db.prepare('SELECT id FROM demand_orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ code: 404, message: '订单不存在' });
  db.prepare(
    'UPDATE demand_orders SET remark = ?, remark_updated_at = ?, remark_updated_by = ?, updated_at = ? WHERE id = ?'
  ).run(remark || null, Date.now(), req.admin.id, Date.now(), o.id);
  res.json({ code: 0, message: '备注已保存' });
});

// ---------------- 用户管理 ----------------
router.get('/users', (req, res) => {
  const { keyword } = req.query;
  let sql = 'SELECT * FROM users';
  const args = [];
  if (keyword) {
    sql += ' WHERE nickname LIKE ? OR phone LIKE ?';
    args.push(`%${keyword}%`, `%${keyword}%`);
  }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  const rows = db.prepare(sql).all(...args);
  res.json({
    code: 0,
    data: rows.map((u) => {
      const p = db.prepare('SELECT audit_status FROM teacher_profiles WHERE user_id = ?').get(u.id);
      return {
        id: u.id, nickname: u.nickname, avatarUrl: u.avatar_url, phone: u.phone,
        city: u.city, role: u.role, createdAt: u.created_at,
        teacherAuditStatus: p ? p.audit_status : null,
      };
    }),
  });
});

module.exports = router;
