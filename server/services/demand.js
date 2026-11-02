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
    if (!order) throw err(404, '需求不存在');
    if (order.parent_id !== parentId) throw err(403, '无权操作该需求');
    // 核心校验：必须仍处于意向征集中，防止并发双锁
    if (order.status !== 'recruiting') {
      if (order.status === 'locked') throw err(409, '需求已锁定，请勿重复操作');
      throw err(400, '需求已关闭');
    }
    const app = db
      .prepare("SELECT * FROM demand_applications WHERE id = ? AND order_id = ? AND status = 'pending'")
      .get(applicationId, orderId);
    if (!app) throw err(400, '该意向不存在或已失效');

    const now = Date.now();
    db.prepare(
      `UPDATE demand_orders SET status = 'locked', selected_teacher_id = ?, selected_application_id = ?,
         locked_at = ?, updated_at = ? WHERE id = ?`
    ).run(app.teacher_id, app.id, now, now, orderId);
    db.prepare(
      "UPDATE demand_applications SET status = 'selected', updated_at = ? WHERE id = ?"
    ).run(now, app.id);

    // 其他意向自动失效 + 站内信
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
      insNoti.run(o.teacher_id, 'order_locked_by_other', '意向已失效',
        `您对「${order.subject}」需求表达的意向已失效（该需求已被其他老师锁定）。`, now);
    }
    // 通知被选中的老师
    insNoti.run(app.teacher_id, 'selected', '恭喜，家长已选择您',
      `您对「${order.subject}」需求表达的意向已被家长选中，平台客服将尽快与您联系。`, now);

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

// 关闭需求（仅意向征集中的可关）
function closeOrder(orderId, parentId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const order = db.prepare('SELECT * FROM demand_orders WHERE id = ?').get(orderId);
    if (!order) throw err(404, '需求不存在');
    if (order.parent_id !== parentId) throw err(403, '无权操作该需求');
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
      insNoti.run(a.teacher_id, 'order_closed', '需求已关闭',
        `您对「${order.subject}」需求表达的意向已失效（家长已关闭该需求）。`, now);
    }
    db.exec('COMMIT');
    return { ok: true };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// 表达意向（一个老师对一个需求只能表达一次）
function applyOrder(orderId, teacherId, note) {
  const order = db.prepare('SELECT * FROM demand_orders WHERE id = ?').get(orderId);
  if (!order) return { ok: false, code: 404, message: '需求不存在' };
  if (order.parent_id === teacherId) return { ok: false, code: 400, message: '不能对自己的需求表达意向' };
  if (order.status !== 'recruiting') return { ok: false, code: 400, message: '该需求已停止征集' };
  const existing = db
    .prepare('SELECT * FROM demand_applications WHERE order_id = ? AND teacher_id = ?')
    .get(orderId, teacherId);
  if (existing) return { ok: false, code: 400, message: '您已对该需求表达过意向，请勿重复表达' };
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
