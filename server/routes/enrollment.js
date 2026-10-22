const express = require('express');
const db = require('../db');
const { authUser } = require('../middleware/auth');
const { joinCourse } = require('../services/tier-engine');

const router = express.Router();

// 参团（家长）—— 触发阶梯定价引擎（挂载于 /api 根）
router.post('/courses/:id/join', authUser, (req, res) => {
  const result = joinCourse(Number(req.params.id), req.user.id);
  if (!result.ok) {
    return res.status(result.code || 400).json({ code: result.code || 400, message: result.message });
  }
  res.json({
    code: 0,
    data: {
      enrollment: {
        id: result.enrollment.id,
        courseId: result.enrollment.course_id,
        joinSeq: result.enrollment.join_seq,
        priceAtJoinCents: result.enrollment.price_at_join_cents,
        currentPriceCents: result.enrollment.current_price_cents,
      },
      course: {
        id: result.course.id,
        status: result.course.status,
        enrolledCount: result.course.enrolled_count,
        minStudents: result.course.min_students,
        maxStudents: result.course.max_students,
        currentPriceCents: result.course.current_unit_price_cents,
      },
    },
    message: result.course.status === 'formed' ? '恭喜，课程已成团！' : '参团成功',
  });
});

// 我的参团（家长）
router.get('/enrollments/mine', authUser, (req, res) => {
  const rows = db
    .prepare(
      `SELECT e.id, e.join_seq, e.price_at_join_cents, e.current_price_cents, e.status, e.expired_reason,
              e.created_at, e.updated_at,
              c.id AS course_id, c.title, c.subject, c.grade, c.cover_url, c.city, c.address,
              c.start_time, c.end_time, c.deadline_at, c.min_students, c.max_students,
              c.enrolled_count, c.status AS course_status, c.current_unit_price_cents,
              u.nickname AS teacher_name, u.avatar_url AS teacher_avatar
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       JOIN users u ON u.id = c.teacher_id
       WHERE e.parent_id = ? ORDER BY e.created_at DESC`
    )
    .all(req.user.id);
  const data = rows.map((r) => ({
    id: r.id,
    joinSeq: r.join_seq,
    priceAtJoinCents: r.price_at_join_cents,
    currentPriceCents: r.current_price_cents,
    status: r.status,
    expiredReason: r.expired_reason,
    createdAt: r.created_at,
    course: {
      id: r.course_id, title: r.title, subject: r.subject, grade: r.grade, coverUrl: r.cover_url,
      city: r.city, address: r.address, startTime: r.start_time, endTime: r.end_time,
      deadlineAt: r.deadline_at, minStudents: r.min_students, maxStudents: r.max_students,
      enrolledCount: r.enrolled_count, status: r.course_status,
      currentPriceCents: r.current_unit_price_cents,
      teacherName: r.teacher_name, teacherAvatar: r.teacher_avatar,
    },
    refunds: db
      .prepare(
        `SELECT id, type, event_key, amount_cents, from_price_cents, to_price_cents, status, remark, created_at
         FROM refund_records WHERE enrollment_id = ? ORDER BY created_at ASC`
      )
      .all(r.id),
  }));
  res.json({ code: 0, data });
});

module.exports = router;
