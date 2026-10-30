const express = require('express');
const db = require('../db');
const { authUser, authTeacher } = require('../middleware/auth');
const { cancelCourse } = require('../services/tier-engine');
const { filterContactInfo } = require('../services/resume');

const router = express.Router();

// 当前认证状态（含驳回原因；已通过老师附资质变更单状态）
router.get('/profile', authUser, (req, res) => {
  const p = db
    .prepare('SELECT tp.*, u.phone FROM teacher_profiles tp JOIN users u ON u.id = tp.user_id WHERE tp.user_id = ?')
    .get(req.user.id);
  if (!p) return res.json({ code: 0, data: null });
  const data = sanitizeProfile(p);
  if (p.audit_status === 'approved') {
    const { getLatestChange } = require('../services/profile');
    const c = getLatestChange(req.user.id);
    if (c && c.audit_status !== 'approved') {
      data.pendingChange = {
        id: c.id,
        auditStatus: c.audit_status, // pending / rejected
        rejectReason: c.reject_reason,
        updatedAt: c.updated_at,
      };
    }
  }
  res.json({ code: 0, data });
});

// 提交/重新提交认证资料（multipart: 表单字段 + 图片走 /api/upload 后传 URL，兼容直接传 URL）
router.post('/profile', authUser, (req, res) => {
  const { realName, idCardNo, certType, certImageUrl, degreeImageUrl, otherCertImageUrl, subject, education, major, graduateSchool, teachableGrades, intro, yearsExperience, phone } = req.body || {};
  if (!realName || !certType) {
    return res.status(400).json({ code: 400, message: '请填写姓名并选择证件类型' });
  }
  if (!['teacher_certificate', 'degree'].includes(certType)) {
    return res.status(400).json({ code: 400, message: '证件类型不正确' });
  }
  // 授课科目支持数组（多选）或逗号分隔字符串
  const subjectStr = Array.isArray(subject) ? subject.join(',') : String(subject || '');
  if (!subjectStr) return res.status(400).json({ code: 400, message: '请至少选择一个授课科目' });
  const gradesStr = Array.isArray(teachableGrades) ? teachableGrades.join(',') : String(teachableGrades || '');
  if (phone && !/^1\d{10}$/.test(String(phone))) {
    return res.status(400).json({ code: 400, message: '请填写正确的手机号' });
  }
  const now = Date.now();
  const { submitProfile } = require('../services/profile');
  const result = submitProfile(req.user.id, {
    realName,
    certType,
    certImageUrl: certImageUrl || '',
    degreeImageUrl: degreeImageUrl || null,
    otherCertImageUrl: otherCertImageUrl || null,
    subject: subjectStr,
    education: education || null,
    major: major || null,
    graduateSchool: graduateSchool || null,
    grades: gradesStr || null,
    intro: intro || null,
    years: Number(yearsExperience) || 0,
  });
  if (phone) {
    db.prepare('UPDATE users SET phone = ?, updated_at = ? WHERE id = ?').run(String(phone), now, req.user.id);
  }
  const p = db.prepare('SELECT * FROM teacher_profiles WHERE user_id = ?').get(req.user.id);
  res.json({
    code: 0,
    data: sanitizeProfile(p),
    message: result.mode === 'change' ? '已提交资质修改，审核通过后生效，期间原资质继续有效' : '已提交，等待平台审核',
  });
});

// 我的课程（老师）
router.get('/courses', authTeacher, (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, u.nickname AS teacher_name, u.avatar_url AS teacher_avatar
       FROM courses c JOIN users u ON u.id = c.teacher_id
       WHERE c.teacher_id = ? ORDER BY c.created_at DESC`
    )
    .all(req.user.id);
  res.json({ code: 0, data: rows.map(attachTiers) });
});

// 课程详情 + 成员名单（老师）
router.get('/courses/:id', authTeacher, (req, res) => {
  const c = db
    .prepare(
      `SELECT c.*, u.nickname AS teacher_name, u.avatar_url AS teacher_avatar
       FROM courses c JOIN users u ON u.id = c.teacher_id WHERE c.id = ? AND c.teacher_id = ?`
    )
    .get(req.params.id, req.user.id);
  if (!c) return res.status(404).json({ code: 404, message: '课程不存在' });
  const members = db
    .prepare(
      `SELECT e.id AS enrollment_id, e.join_seq, e.price_at_join_cents, e.current_price_cents, e.status,
              u.id AS parent_id, u.nickname, u.avatar_url, u.phone
       FROM enrollments e JOIN users u ON u.id = e.parent_id
       WHERE e.course_id = ? AND e.status = 'joined' ORDER BY e.join_seq ASC`
    )
    .all(c.id);
  res.json({ code: 0, data: { ...attachTiers(c), members } });
});

// 老师取消课程
router.post('/courses/:id/cancel', authTeacher, (req, res) => {
  const c = db
    .prepare('SELECT id FROM courses WHERE id = ? AND teacher_id = ?')
    .get(req.params.id, req.user.id);
  if (!c) return res.status(404).json({ code: 404, message: '课程不存在' });
  cancelCourse(c.id, 'teacher');
  res.json({ code: 0, message: '课程已取消，家长将收到退款' });
});

// 收益明细（MVP：按参团统计，平台抽成 5% 预留展示）
router.get('/earnings', authTeacher, (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.title, c.subject, c.status, c.enrolled_count, c.current_unit_price_cents,
              c.max_students, c.created_at,
              COALESCE((SELECT SUM(e.current_price_cents) FROM enrollments e
                        WHERE e.course_id = c.id AND e.status = 'joined'), 0) AS gross_cents
       FROM courses c WHERE c.teacher_id = ? ORDER BY c.created_at DESC`
    )
    .all(req.user.id);
  const totalGross = rows.reduce((s, r) => s + r.gross_cents, 0);
  const PLATFORM_RATE = 0.05;
  res.json({
    code: 0,
    data: {
      platformRate: PLATFORM_RATE,
      totalGrossCents: totalGross,
      totalNetCents: Math.round(totalGross * (1 - PLATFORM_RATE)),
      courses: rows.map((r) => ({
        ...r,
        grossCents: r.gross_cents,
        netCents: Math.round(r.gross_cents * (1 - PLATFORM_RATE)),
      })),
    },
  });
});

function attachTiers(c) {
  const tiers = db
    .prepare('SELECT min_people, price_cents FROM course_tiers WHERE course_id = ? ORDER BY min_people ASC')
    .all(c.id);
  return { ...c, tiers };
}

function sanitizeProfile(p) {
  return {
    id: p.id,
    realName: p.real_name,
    idCardNo: maskIdCard(p.id_card_no),
    phone: p.phone || null,
    certType: p.cert_type,
    certImageUrl: p.cert_image_url,
    degreeImageUrl: p.degree_image_url,
    otherCertImageUrl: p.other_cert_image_url,
    subject: p.subject,
    education: p.education,
    major: p.major,
    graduateSchool: p.graduate_school,
    teachableGrades: p.teachable_grades,
    intro: p.intro,
    yearsExperience: p.years_experience,
    auditStatus: p.audit_status,
    rejectReason: p.reject_reason,
    auditedAt: p.audited_at,
  };
}

function maskIdCard(no) {
  if (!no || no.length < 8) return no;
  return `${no.slice(0, 4)}********${no.slice(-4)}`;
}

// ---------------- 老师简历（自由修改，无需审核） ----------------

// 获取自己的简历
router.get('/resume', authUser, (req, res) => {
  const r = db.prepare('SELECT * FROM teacher_resumes WHERE user_id = ?').get(req.user.id);
  res.json({ code: 0, data: r ? sanitizeResume(r) : null });
});

// 保存/更新简历：文本字段统一过联系方式过滤，资质字段（学历/证书）不在此修改
router.put('/resume', authUser, (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 30);
  const gender = ['男', '女'].includes(b.gender) ? b.gender : '';
  const identityTag = ['专职', '大学生'].includes(b.identityTag) ? b.identityTag : '';
  const years = Math.max(0, Math.min(100, Number(b.yearsExperience) || 0));
  const contact = String(b.contact || '').trim().slice(0, 50);
  const data = {
    name: filterContactInfo(name),
    gender,
    address: filterContactInfo(String(b.address || '').trim().slice(0, 100)),
    subjects: Array.isArray(b.subjects) ? b.subjects.join(',') : String(b.subjects || '').slice(0, 100),
    grades: Array.isArray(b.grades) ? b.grades.join(',') : String(b.grades || '').slice(0, 100),
    contact,
    years_experience: years,
    identity_tag: identityTag,
    intro: filterContactInfo(String(b.intro || '').trim().slice(0, 2000)),
  };
  const now = Date.now();
  const existing = db.prepare('SELECT id FROM teacher_resumes WHERE user_id = ?').get(req.user.id);
  if (existing) {
    db.prepare(
      `UPDATE teacher_resumes SET name = ?, gender = ?, address = ?, subjects = ?, grades = ?, contact = ?,
         years_experience = ?, identity_tag = ?, intro = ?, updated_at = ? WHERE user_id = ?`
    ).run(data.name, data.gender, data.address, data.subjects, data.grades, data.contact,
      data.years_experience, data.identity_tag, data.intro, now, req.user.id);
  } else {
    db.prepare(
      `INSERT INTO teacher_resumes (user_id, name, gender, address, subjects, grades, contact,
         years_experience, identity_tag, intro, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(req.user.id, data.name, data.gender, data.address, data.subjects, data.grades, data.contact,
      data.years_experience, data.identity_tag, data.intro, now, now);
  }
  const r = db.prepare('SELECT * FROM teacher_resumes WHERE user_id = ?').get(req.user.id);
  res.json({ code: 0, data: sanitizeResume(r), message: '简历已保存' });
});

function sanitizeResume(r) {
  return {
    id: r.id,
    name: r.name,
    gender: r.gender,
    address: r.address,
    subjects: r.subjects,
    grades: r.grades,
    contact: r.contact,
    yearsExperience: r.years_experience,
    identityTag: r.identity_tag,
    intro: r.intro,
    updatedAt: r.updated_at,
  };
}

// ---------------- 家长发单：需求大厅（脱敏） ----------------
// 查看需求订单无需资格认证（仅需登录）；投递简历时才要求认证通过

// 需求大厅：仅招募中，绝不返回家长电话与门牌号
router.get('/demands', authUser, (req, res) => {
  const rows = db
    .prepare(
      `SELECT o.*,
              (SELECT COUNT(*) FROM demand_applications a WHERE a.order_id = o.id) AS application_count
       FROM demand_orders o WHERE o.status = 'recruiting' ORDER BY o.created_at DESC`
    )
    .all();
  res.json({ code: 0, data: rows.map(sanitizeTeacherOrder) });
});

// 需求详情（老师视角，脱敏）
router.get('/demands/:id', authUser, (req, res) => {
  const o = db.prepare('SELECT * FROM demand_orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ code: 404, message: '需求不存在' });
  if (o.status !== 'recruiting') return res.status(404).json({ code: 404, message: '该需求已停止招募' });
  const mine = db
    .prepare('SELECT * FROM demand_applications WHERE order_id = ? AND teacher_id = ?')
    .get(o.id, req.user.id);
  res.json({ code: 0, data: { ...sanitizeTeacherOrder(o), applied: !!mine } });
});

// 投递简历
router.post('/demands/:id/apply', authTeacher, (req, res) => {
  const { note } = req.body || {};
  const r = require('../services/demand').applyOrder(Number(req.params.id), req.user.id, note);
  if (!r.ok) return res.status(r.code || 400).json({ code: r.code || 400, message: r.message });
  res.json({ code: 0, message: '投递成功，等待家长查看' });
});

// 我的投递
router.get('/applications', authTeacher, (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.*, o.subject, o.grade, o.hourly_rate_cents, o.city, o.address_display,
              o.status AS order_status
       FROM demand_applications a
       JOIN demand_orders o ON o.id = a.order_id
       WHERE a.teacher_id = ? ORDER BY a.created_at DESC`
    )
    .all(req.user.id);
  res.json({
    code: 0,
    data: rows.map((a) => ({
      id: a.id,
      orderId: a.order_id,
      subject: a.subject,
      grade: a.grade,
      hourlyRateCents: a.hourly_rate_cents,
      city: a.city,
      addressDisplay: a.address_display,
      status: a.status,
      invalidReason: a.invalid_reason,
      orderStatus: a.order_status,
      note: a.note,
      createdAt: a.created_at,
    })),
  });
});

// 老师视角脱敏：无电话、无门牌号，仅区域
function sanitizeTeacherOrder(o) {
  return {
    id: o.id,
    subject: o.subject,
    grade: o.grade,
    hourlyRateCents: o.hourly_rate_cents,
    province: o.province,
    city: o.city,
    addressDisplay: o.address_display,
    status: o.status,
    applicationCount: o.application_count,
    createdAt: o.created_at,
  };
}

module.exports = router;
