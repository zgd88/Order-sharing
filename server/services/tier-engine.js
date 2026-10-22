const db = require('../db');

// ---------------- 阶梯档位工具 ----------------

function getTiers(courseId) {
  return db
    .prepare('SELECT * FROM course_tiers WHERE course_id = ? ORDER BY min_people ASC')
    .all(courseId);
}

// 按人数落档：取 min_people <= n 的最高档
function priceForCount(tiers, n) {
  let price = tiers[0].price_cents;
  for (const t of tiers) {
    if (n >= t.min_people) price = t.price_cents;
  }
  return price;
}

// 服务层校验档位，返回 { ok, message }
function validateTiers(tiers, maxStudents) {
  if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > 5) {
    return { ok: false, message: '阶梯档位需为 1-5 个' };
  }
  const list = tiers
    .map((t) => ({ min_people: Number(t.min_people), price_cents: Number(t.price_cents) }))
    .sort((a, b) => a.min_people - b.min_people);
  if (list.some((t) => !Number.isInteger(t.min_people) || !Number.isInteger(t.price_cents))) {
    return { ok: false, message: '档位人数与价格必须为整数' };
  }
  if (list[0].min_people !== 1) {
    return { ok: false, message: '第一档必须为“满1人”（起步价）' };
  }
  for (let i = 1; i < list.length; i++) {
    if (list[i].min_people <= list[i - 1].min_people) {
      return { ok: false, message: '档位人数必须严格递增' };
    }
    if (list[i].price_cents >= list[i - 1].price_cents) {
      return { ok: false, message: '档位价格必须严格递减' };
    }
  }
  if (list.some((t) => t.min_people > maxStudents)) {
    return { ok: false, message: `档位人数不能超过上限 ${maxStudents} 人` };
  }
  return { ok: true, list };
}

// ---------------- 退款台账 ----------------

// 生成退款记录（模拟支付：直接置为已退，预留微信原路退接口）
function createRefund({ courseId, enrollmentId, parentId, type, eventKey, amountCents, fromPrice, toPrice, remark }) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO refund_records
     (course_id, enrollment_id, parent_id, type, event_key, amount_cents, from_price_cents, to_price_cents,
      status, remark, created_at, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?)`
  ).run(courseId, enrollmentId, parentId, type, eventKey, amountCents, fromPrice, toPrice, remark, now, now);
}

// ---------------- 参团（核心事务） ----------------

// 返回 { ok, code, message, enrollment?, course? }
function joinCourse(courseId, parentId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
    if (!course) throw err(404, '课程不存在');
    if (course.teacher_id === parentId) throw err(400, '不能报名自己的课程');
    // 惰性流局：截止已过且未成团
    if (course.status === 'recruiting' && Date.now() > course.deadline_at) {
      failCourseTx(courseId, 'flow');
      throw err(400, '报名已截止');
    }
    if (course.status === 'failed') throw err(400, '课程已流局');
    if (course.status === 'cancelled') throw err(400, '课程已取消');
    if (course.status === 'finished') throw err(400, '课程已结束');
    if (Date.now() > course.deadline_at) throw err(400, '报名已截止');
    if (course.enrolled_count >= course.max_students) throw err(400, '课程已满员');

    const existing = db
      .prepare('SELECT id FROM enrollments WHERE course_id = ? AND parent_id = ?')
      .get(courseId, parentId);
    if (existing) throw err(400, '您已参团该课程');

    const tiers = getTiers(courseId);
    if (!tiers.length) throw err(500, '课程阶梯配置缺失');

    // 入团价 = 加入后人数对应的阶梯价（首人即起步价/最高价，后来者按当前档直接付费，
    // 降价差额只退给先前已付款的成员 —— 对应 PRD“给家长B也按90元处理”）
    const newCount = course.enrolled_count + 1;
    const priceAtJoin = priceForCount(tiers, newCount);
    const now = Date.now();
    const joinSeq = course.enrolled_count + 1;
    const ins = db
      .prepare(
        `INSERT INTO enrollments (course_id, parent_id, join_seq, price_at_join_cents, current_price_cents,
          status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'joined', ?, ?)`
      )
      .run(courseId, parentId, joinSeq, priceAtJoin, priceAtJoin, now, now);
    const enrollmentId = Number(ins.lastInsertRowid);

    // 人数变化 → 重算先前成员的应付价，生成退差台账（新成员 current=priceAtJoin=newPrice，自然跳过）
    const newPrice = priceForCount(tiers, newCount);
    const members = db
      .prepare('SELECT * FROM enrollments WHERE course_id = ? AND status = ?')
      .all(courseId, 'joined');
    for (const m of members) {
      if (m.current_price_cents > newPrice) {
        createRefund({
          courseId,
          enrollmentId: m.id,
          parentId: m.parent_id,
          type: 'tier_diff',
          eventKey: `tier:${newCount}`,
          amountCents: m.current_price_cents - newPrice,
          fromPrice: m.current_price_cents,
          toPrice: newPrice,
          remark: '阶梯降价退差（模拟退款，接入微信支付后走原路退回）',
        });
        db.prepare('UPDATE enrollments SET current_price_cents = ?, updated_at = ? WHERE id = ?')
          .run(newPrice, now, m.id);
      }
    }

    const formed = newCount >= course.min_students;
    db.prepare(
      `UPDATE courses SET enrolled_count = ?, current_unit_price_cents = ?,
         status = CASE WHEN ? = 1 AND status = 'recruiting' THEN 'formed' ELSE status END,
         formed_at = CASE WHEN ? = 1 AND formed_at IS NULL THEN ? ELSE formed_at END,
         updated_at = ? WHERE id = ?`
    ).run(newCount, newPrice, formed ? 1 : 0, formed ? 1 : 0, now, now, courseId);

    db.exec('COMMIT');
    const updatedCourse = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
    const enrollment = db.prepare('SELECT * FROM enrollments WHERE id = ?').get(enrollmentId);
    return { ok: true, enrollment, course: updatedCourse };
  } catch (e) {
    db.exec('ROLLBACK');
    if (e.statusCode) return { ok: false, code: e.statusCode, message: e.message };
    // join_seq 唯一冲突 → 并发下名额被抢
    if (String(e.message).includes('UNIQUE')) {
      return { ok: false, code: 409, message: '手慢了，名额刚被抢走，请刷新重试' };
    }
    throw e;
  }
}

// ---------------- 状态机推进 ----------------

function err(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

// 流局：截止未成团（须在事务内调用）
function failCourseTx(courseId, reason) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course || course.status !== 'recruiting') return;
  const now = Date.now();
  db.prepare("UPDATE courses SET status = 'failed', failed_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, courseId);
  const members = db
    .prepare("SELECT * FROM enrollments WHERE course_id = ? AND status = 'joined'")
    .all(courseId);
  for (const m of members) {
    // 退剩余应付金额（此前阶梯退差已退部分），合计 = 入团实付
    createRefund({
      courseId,
      enrollmentId: m.id,
      parentId: m.parent_id,
      type: 'flow_refund',
      eventKey: 'flow',
      amountCents: m.current_price_cents,
      fromPrice: m.current_price_cents,
      toPrice: 0,
      remark: '拼团流局，全额退款（模拟退款，接入微信支付后走原路退回）',
    });
    db.prepare(
      "UPDATE enrollments SET status = 'expired', expired_reason = ?, updated_at = ? WHERE id = ?"
    ).run(reason, now, m.id);
  }
}

// 流局（公开入口，供 sweep 调用）
function failCourse(courseId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    failCourseTx(courseId, 'flow');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// 课程取消（老师或管理员）
function cancelCourse(courseId, by) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
    if (!course) throw err(404, '课程不存在');
    if (!['recruiting', 'formed'].includes(course.status)) {
      throw err(400, '当前状态不可取消');
    }
    const now = Date.now();
    db.prepare(
      "UPDATE courses SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?"
    ).run(by === 'admin' ? '平台取消' : '老师取消', now, courseId);
    const members = db
      .prepare("SELECT * FROM enrollments WHERE course_id = ? AND status = 'joined'")
      .all(courseId);
    for (const m of members) {
      createRefund({
        courseId,
        enrollmentId: m.id,
        parentId: m.parent_id,
        type: 'course_cancel_refund',
        eventKey: 'cancel',
        amountCents: m.current_price_cents,
        fromPrice: m.current_price_cents,
        toPrice: 0,
        remark: '课程取消，全额退款（模拟退款，接入微信支付后走原路退回）',
      });
      db.prepare(
        "UPDATE enrollments SET status = 'expired', expired_reason = ?, updated_at = ? WHERE id = ?"
      ).run(by === 'admin' ? 'admin_cancel' : 'teacher_cancel', now, m.id);
    }
    db.exec('COMMIT');
    return { ok: true };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// 课程完成：成团且上课时间结束
function finishCourse(courseId) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course || course.status !== 'formed' || Date.now() < course.end_time) return false;
  db.prepare("UPDATE courses SET status = 'finished', finished_at = ?, updated_at = ? WHERE id = ?")
    .run(Date.now(), Date.now(), courseId);
  return true;
}

// 定时扫描：流局（deadline 过期未成团）+ 完成（end_time 过后）
function sweepOnce() {
  const now = Date.now();
  const toFail = db
    .prepare("SELECT id FROM courses WHERE status = 'recruiting' AND deadline_at <= ?")
    .all(now);
  for (const c of toFail) {
    try {
      failCourse(c.id);
      console.log(`[sweep] 课程 ${c.id} 流局`);
    } catch (e) {
      console.error(`[sweep] 课程 ${c.id} 流局失败:`, e.message);
    }
  }
  const toFinish = db
    .prepare("SELECT id FROM courses WHERE status = 'formed' AND end_time <= ?")
    .all(now);
  for (const c of toFinish) {
    try {
      if (finishCourse(c.id)) console.log(`[sweep] 课程 ${c.id} 完成`);
    } catch (e) {
      console.error(`[sweep] 课程 ${c.id} 完成失败:`, e.message);
    }
  }
  return { failed: toFail.length, finished: toFinish.length };
}

module.exports = {
  getTiers,
  priceForCount,
  validateTiers,
  joinCourse,
  failCourse,
  cancelCourse,
  finishCourse,
  sweepOnce,
};
