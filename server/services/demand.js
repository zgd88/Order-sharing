const db = require('../db');

// 省份规范化：从"贵州省贵阳市"/"贵州"等任意输入提取规范省名（贵州/北京/内蒙古…）
function normalizeProvince(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  const m = s.match(/^(北京|上海|天津|重庆|[一-龥]{2,10}?(?:省|自治区|特别行政区))/);
  if (m) return m[1].replace(/(省|市|自治区|特别行政区)$/, '');
  return s;
}

// 地址脱敏：只保留到 区/街道/路 级别，去掉门牌号、栋、单元、室
function maskAddress(address) {
  let a = String(address || '').trim();
  if (!a) return '';
  a = a.replace(/\d+\s*号.*$/, '');                 // "文三路138号2单元" → "文三路"
  a = a.replace(/\d+\s*(栋|幢|号楼|单元|室|层|楼).*$/, '');
  a = a.replace(/[0-9\-—].*$/, '');
  return a.trim() || String(address || '');
}

// 锁单事务：家长选择老师（并发安全）
// 返回 { ok, code, message, order, application }
function selectTeacher(orderId, applicationId, parentId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const order = db.prepare('SELECT * FROM demand_orders WHERE id = ?').get(orderId);
    if (!order) throw err(404, '订单不存在');
    if (order.parent_id !== parentId) throw err(403, '无权操作该订单');
    // 核心校验：必须仍处于招募中，防止并发双锁
    if (order.status !== 'recruiting') {
      if (order.status === 'locked') throw err(409, '订单已锁定，请勿重复操作');
      throw err(400, '订单已关闭');
    }
    const app = db
      .prepare("SELECT * FROM demand_applications WHERE id = ? AND order_id = ? AND status = 'pending'")
      .get(applicationId, orderId);
    if (!app) throw err(400, '该投递不存在或已失效');

    const now = Date.now();
    db.prepare(
      `UPDATE demand_orders SET status = 'locked', selected_teacher_id = ?, selected_application_id = ?,
         locked_at = ?, updated_at = ? WHERE id = ?`
    ).run(app.teacher_id, app.id, now, now, orderId);
    db.prepare(
      "UPDATE demand_applications SET status = 'selected', updated_at = ? WHERE id = ?"
    ).run(now, app.id);

    // 其他投递自动失效 + 站内信
    const others = db
      .prepare("SELECT * FROM demand_applications WHERE order_id = ? AND status = 'pending'")
      .all(orderId);
    const insNoti = db.prepare(
      'INSERT INTO notifications (user_id, type, title, content, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)'
    );
    for (const o of others) {
      db.prepare(
        "UPDATE demand_applications SET status = 'invalid', invalid_reason = 'locked_by_other', updated_at = ? WHERE id = ?"
      ).run(now, o.id);
      insNoti.run(o.teacher_id, 'order_locked_by_other', '订单已被接走',
        `您投递的「${order.subject}」需求已被其他老师拿下，投递已失效。`, now);
    }
    // 通知被选中的老师
    insNoti.run(app.teacher_id, 'selected', '恭喜，家长已选择您',
      `您投递的「${order.subject}」需求已被家长选中，订单已锁定，平台客服将尽快与您联系。`, now);

    db.exec('COMMIT');
    return {
      ok: true,
      order: db.prepare('SELECT * FROM demand_orders WHERE id = ?').get(orderId),
      application: db.prepare('SELECT * FROM demand_applications WHERE id = ?').get(app.id),
    };
  } catch (e) {
    db.exec('ROLLBACK');
    if (e.statusCode) return { ok: false, code: e.statusCode, message: e.message };
    throw e;
  }
}

// 关闭订单（仅招募中的可关）
function closeOrder(orderId, parentId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const order = db.prepare('SELECT * FROM demand_orders WHERE id = ?').get(orderId);
    if (!order) throw err(404, '订单不存在');
    if (order.parent_id !== parentId) throw err(403, '无权操作该订单');
    if (order.status !== 'recruiting') throw err(400, '当前状态不可关闭');
    const now = Date.now();
    db.prepare("UPDATE demand_orders SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, orderId);
    const apps = db
      .prepare("SELECT * FROM demand_applications WHERE order_id = ? AND status = 'pending'")
      .all(orderId);
    const insNoti = db.prepare(
      'INSERT INTO notifications (user_id, type, title, content, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)'
    );
    for (const a of apps) {
      db.prepare(
        "UPDATE demand_applications SET status = 'invalid', invalid_reason = 'order_closed', updated_at = ? WHERE id = ?"
      ).run(now, a.id);
      insNoti.run(a.teacher_id, 'order_closed', '订单已关闭',
        `您投递的「${order.subject}」需求已被家长关闭，投递已失效。`, now);
    }
    db.exec('COMMIT');
    return { ok: true };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// 投递简历（一个老师对一个订单只能投递一次）
function applyOrder(orderId, teacherId, note) {
  const order = db.prepare('SELECT * FROM demand_orders WHERE id = ?').get(orderId);
  if (!order) return { ok: false, code: 404, message: '订单不存在' };
  if (order.parent_id === teacherId) return { ok: false, code: 400, message: '不能投递自己的订单' };
  if (order.status !== 'recruiting') return { ok: false, code: 400, message: '该订单已停止招募' };
  const existing = db
    .prepare('SELECT * FROM demand_applications WHERE order_id = ? AND teacher_id = ?')
    .get(orderId, teacherId);
  if (existing) return { ok: false, code: 400, message: '您已投递过该订单，请勿重复投递' };
  const now = Date.now();
  const ins = db
    .prepare(
      "INSERT INTO demand_applications (order_id, teacher_id, note, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)"
    )
    .run(orderId, teacherId, note || null, now, now);
  return { ok: true, id: Number(ins.lastInsertRowid) };
}

function err(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

module.exports = { maskAddress, normalizeProvince, selectTeacher, closeOrder, applyOrder };
