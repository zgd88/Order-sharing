const express = require('express');
const db = require('../db');
const { authUser, authTeacher } = require('../middleware/auth');
const { validateTiers, getTiers, priceForCount, failCourse } = require('../services/tier-engine');
const { haversineKm, formatDistance } = require('../services/distance');
const { normalizeProvince } = require('../services/demand');

const router = express.Router();

const SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '政治', '历史', '地理', '编程', '美术', '音乐', '书法', '舞蹈', '其他'];

// 发布拼好课（老师）
router.post('/', authTeacher, (req, res) => {
  const b = req.body || {};
  const {
    title, subject, grade, coverUrl, outline, province, city, address, lat, lng,
    startTime, endTime, deadlineAt, minStudents, maxStudents, tiers,
  } = b;

  if (!title || !subject || !outline || !city || !address) {
    return res.status(400).json({ code: 400, message: '请填写完整的课程信息' });
  }
  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
    return res.status(400).json({ code: 400, message: '请选择课程地点' });
  }
  const start = Number(startTime);
  const end = Number(endTime);
  const deadline = Number(deadlineAt);
  const minS = Number(minStudents);
  const maxS = Number(maxStudents);
  if (![start, end, deadline].every(Number.isFinite)) {
    return res.status(400).json({ code: 400, message: '时间参数不正确' });
  }
  if (deadline > start) return res.status(400).json({ code: 400, message: '报名截止时间须早于开课时间' });
  if (end < start) return res.status(400).json({ code: 400, message: '结束时间须晚于开课时间' });
  if (minS < 2) return res.status(400).json({ code: 400, message: '成团人数至少 2 人' });
  if (maxS < minS) return res.status(400).json({ code: 400, message: '人数上限不能小于成团人数' });

  const v = validateTiers(tiers, maxS);
  if (!v.ok) return res.status(400).json({ code: 400, message: v.message });

  const now = Date.now();
  const ins = db
    .prepare(
      `INSERT INTO courses (teacher_id, title, subject, grade, cover_url, outline, province, city, address, lat, lng,
        start_time, end_time, deadline_at, min_students, max_students, current_unit_price_cents,
        status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recruiting', ?, ?)`
    )
    .run(req.user.id, title, subject, grade || null, coverUrl || null, outline, normalizeProvince(province), city, address, latN, lngN,
      start, end, deadline, minS, maxS, v.list[v.list.length - 1].price_cents, now, now);
  const courseId = Number(ins.lastInsertRowid);
  const insTier = db.prepare('INSERT INTO course_tiers (course_id, min_people, price_cents) VALUES (?, ?, ?)');
  for (const t of v.list) insTier.run(courseId, t.min_people, t.price_cents);
  res.json({ code: 0, data: { id: courseId }, message: '课程发布成功' });
});

// 拼好课大厅（家长）：省/城市/科目/年级筛选 + 距离排序
router.get('/', (req, res) => {
  const { subject, grade, province, city, lat, lng } = req.query;
  const now = Date.now();
  // 惰性流局
  const overdue = db
    .prepare("SELECT id FROM courses WHERE status = 'recruiting' AND deadline_at <= ?")
    .all(now);
  for (const c of overdue) {
    try { failCourse(c.id); } catch (e) { /* ignore */ }
  }

  let sql = `
    SELECT c.*, u.nickname AS teacher_name, u.avatar_url AS teacher_avatar,
           p.subject AS teacher_subject, p.years_experience
    FROM courses c
    JOIN users u ON u.id = c.teacher_id
    JOIN teacher_profiles p ON p.user_id = c.teacher_id AND p.audit_status = 'approved'
    WHERE c.status IN ('recruiting','formed')`;
  const args = [];
  if (province) { sql += ' AND c.province = ?'; args.push(province); }
  if (city) { sql += ' AND c.city LIKE ?'; args.push(`%${city}%`); }
  if (subject && subject !== '全部') { sql += ' AND c.subject = ?'; args.push(subject); }
  if (grade && grade !== '全部') { sql += ' AND c.grade = ?'; args.push(grade); }
  sql += ' ORDER BY c.created_at DESC';
  const rows = db.prepare(sql).all(...args);

  const latN = Number(lat);
  const lngN = Number(lng);
  const withDistance = rows.map((c) => {
    let distanceKm = null;
    if (Number.isFinite(latN) && Number.isFinite(lngN) && c.lat != null && c.lng != null) {
      distanceKm = haversineKm(latN, lngN, c.lat, c.lng);
    }
    const tiers = getTiers(c.id);
    return {
      id: c.id, title: c.title, subject: c.subject, grade: c.grade, coverUrl: c.cover_url,
      city: c.city, address: c.address, startTime: c.start_time, endTime: c.end_time,
      deadlineAt: c.deadline_at, minStudents: c.min_students, maxStudents: c.max_students,
      enrolledCount: c.enrolled_count, status: c.status,
      currentPriceCents: c.current_unit_price_cents,
      lowestPriceCents: tiers[tiers.length - 1].price_cents,
      teacherName: c.teacher_name, teacherAvatar: c.teacher_avatar,
      teacherSubject: c.teacher_subject, yearsExperience: c.years_experience,
      distanceKm: distanceKm == null ? null : Math.round(distanceKm * 100) / 100,
      distanceText: formatDistance(distanceKm),
      needToForm: Math.max(0, c.min_students - c.enrolled_count),
    };
  });
  if (Number.isFinite(latN) && Number.isFinite(lngN)) {
    withDistance.sort((a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999));
  }
  res.json({ code: 0, data: { list: withDistance, subjects: SUBJECTS } });
});

// 课程详情（含“再邀 X 人全员降至 Y 元”提示）
router.get('/:id', (req, res) => {
  const c = db
    .prepare(
      `SELECT c.*, u.nickname AS teacher_name, u.avatar_url AS teacher_avatar,
              p.subject AS teacher_subject, p.years_experience, p.intro AS teacher_intro
       FROM courses c
       JOIN users u ON u.id = c.teacher_id
       JOIN teacher_profiles p ON p.user_id = c.teacher_id AND p.audit_status = 'approved'
       WHERE c.id = ?`
    )
    .get(req.params.id);
  if (!c) return res.status(404).json({ code: 404, message: '课程不存在' });

  const tiers = getTiers(c.id);
  const count = c.enrolled_count;
  const currentPrice = priceForCount(tiers, count);
  // 下一档：min_people > count 的最低价档
  const nextTier = tiers.find((t) => t.min_people > count);
  const hint = nextTier
    ? {
        needMore: nextTier.min_people - count,
        nextPriceCents: nextTier.price_cents,
        text: `再邀 ${nextTier.min_people - count} 人，全员降至 ${(nextTier.price_cents / 100).toFixed(2)} 元`,
      }
    : null;

  res.json({
    code: 0,
    data: {
      id: c.id, title: c.title, subject: c.subject, grade: c.grade, coverUrl: c.cover_url,
      outline: c.outline, city: c.city, address: c.address, lat: c.lat, lng: c.lng,
      startTime: c.start_time, endTime: c.end_time, deadlineAt: c.deadline_at,
      minStudents: c.min_students, maxStudents: c.max_students,
      enrolledCount: count, status: c.status,
      currentPriceCents: currentPrice,
      tiers: tiers.map((t) => ({ ...t, active: count >= t.min_people })),
      nextTierHint: hint,
      needToForm: Math.max(0, c.min_students - count),
      teacherName: c.teacher_name, teacherAvatar: c.teacher_avatar,
      teacherSubject: c.teacher_subject, yearsExperience: c.years_experience, teacherIntro: c.teacher_intro,
    },
  });
});

module.exports = router;
