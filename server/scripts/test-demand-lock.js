// 家长发单/投递/锁单逻辑集成测试：并发锁单、重复投递、失效与站内信、地址脱敏
const path = require('path');
const fs = require('fs');
const os = require('os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'peixue-demand-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

const db = require('../db');
const { maskAddress, selectTeacher, closeOrder, applyOrder } = require('../services/demand');

let passed = 0;
let failed = 0;
function assert(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}
function assertEq(actual, expected, name) {
  assert(actual === expected, name, `期望 ${expected}，实际 ${actual}`);
}

function insertUser(id, role = 'parent') {
  const now = Date.now();
  db.prepare(
    "INSERT INTO users (id, openid, nickname, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, `mock_t${id}`, `用户${id}`, role, now, now);
}
function insertOrder(id, parentId, status = 'recruiting') {
  const now = Date.now();
  db.prepare(
    `INSERT INTO demand_orders (id, parent_id, subject, grade, hourly_rate_cents, phone, province, city,
      address, address_display, status, created_at, updated_at)
     VALUES (?, ?, '数学', '初二', 15000, '13800001111', '贵州', '贵阳观山湖区',
      '观山湖区长岭北路88号3栋2单元301室', ?, ?, ?, ?)`
  ).run(id, parentId, maskAddress('观山湖区长岭北路88号3栋2单元301室'), status, now, now);
}
function insertApplication(id, orderId, teacherId, status = 'pending') {
  const now = Date.now();
  db.prepare(
    `INSERT INTO demand_applications (id, order_id, teacher_id, note, status, created_at, updated_at)
     VALUES (?, ?, ?, '授课经历：5年教学经验', ?, ?, ?)`
  ).run(id, orderId, teacherId, status, now, now);
}
function getOrder(id) {
  return db.prepare('SELECT * FROM demand_orders WHERE id = ?').get(id);
}
function getApp(id) {
  return db.prepare('SELECT * FROM demand_applications WHERE id = ?').get(id);
}
function notiOf(userId) {
  return db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id').all(userId);
}

console.log('== 1. 地址脱敏 ==');
assertEq(maskAddress('观山湖区长岭北路88号3栋2单元301室'), '观山湖区长岭北路', '去掉门牌号/栋/单元/室');
assertEq(maskAddress('西湖区文三路138号'), '西湖区文三路', '去掉"138号"');
assertEq(maskAddress('望江街道阳光小区3栋'), '望江街道阳光小区', '无门牌时去掉"3栋"');
assertEq(maskAddress(''), '', '空地址');

console.log('== 2. 投递：一次限制 ==');
insertUser(1, 'parent'); // 家长
insertUser(101, 'teacher'); insertUser(102, 'teacher'); insertUser(103, 'teacher');
insertOrder(1, 1);
assert(applyOrder(1, 101, '我擅长数学').ok, '老师101投递成功');
const dup = applyOrder(1, 101, '再投一次');
assert(!dup.ok && dup.message.includes('已投递'), '重复投递被拒');
assert(applyOrder(1, 102).ok, '老师102投递成功');
assert(applyOrder(1, 103).ok, '老师103投递成功');
assert(!applyOrder(1, 1).ok, '家长不能投递自己的订单（非老师）'); // 直接调服务层无鉴权，仅验证业务
const afterDup = db.prepare('SELECT COUNT(*) AS c FROM demand_applications WHERE order_id = 1').get().c;
assertEq(afterDup, 3, '共 3 条投递');

console.log('== 3. 锁单：状态校验 + 其他投递失效 + 站内信 ==');
const apps = db.prepare('SELECT * FROM demand_applications WHERE order_id = 1 ORDER BY id').all();
const target = apps[1]; // 老师102
const r = selectTeacher(1, target.id, 1);
assert(r.ok, '家长选择老师成功');
const o = getOrder(1);
assertEq(o.status, 'locked', '订单状态 → locked');
assertEq(o.selected_teacher_id, 102, '记录被选老师');
assertEq(getApp(target.id).status, 'selected', '被选投递 → selected');
assertEq(getApp(apps[0].id).status, 'invalid', '其他投递101 → invalid');
assertEq(getApp(apps[0].id).invalid_reason, 'locked_by_other', '失效原因 locked_by_other');
assertEq(getApp(apps[2].id).status, 'invalid', '其他投递103 → invalid');
assertEq(notiOf(101).length, 1, '老师101收到1条站内信');
assert(notiOf(101)[0].type === 'order_locked_by_other', '站内信类型=订单已被接走');
assertEq(notiOf(102).length, 1, '老师102收到1条站内信');
assert(notiOf(102)[0].type === 'selected', '被选老师收到"已被选中"通知');
assertEq(notiOf(103).length, 1, '老师103收到1条站内信');

console.log('== 4. 并发锁单：再次选择被拒（幂等/防双锁） ==');
const again = selectTeacher(1, apps[0].id, 1); // 用已失效投递再选
assert(!again.ok, '锁定后再次选择被拒');
assert(again.message.includes('锁定'), '提示订单已锁定');
// 直接构造：同一订单两笔"同时"选择，第二笔必须失败
insertOrder(2, 1);
insertApplication(10, 2, 101);
insertApplication(11, 2, 102);
const first = selectTeacher(2, 10, 1);
assert(first.ok, '订单2第一次选择成功');
const second = selectTeacher(2, 11, 1);
assert(!second.ok && second.code === 409, '订单2第二次选择返回409');
assertEq(getOrder(2).status, 'locked', '订单2仍只锁定一次');
assertEq(getApp(11).status, 'invalid', '第二笔投递已失效');

console.log('== 5. 他人订单：无权锁定 ==');
insertUser(2, 'parent');
insertOrder(3, 1);
insertApplication(20, 3, 101);
const other = selectTeacher(3, 20, 2); // 家长2锁家长1的订单
assert(!other.ok && other.code === 403, '非订单所有者锁单被拒(403)');

console.log('== 6. 家长关闭订单：投递失效 + 站内信 ==');
insertOrder(4, 1);
insertApplication(30, 4, 101);
insertApplication(31, 4, 102);
closeOrder(4, 1);
assertEq(getOrder(4).status, 'closed', '订单 → closed');
assertEq(getApp(30).status, 'invalid', '投递30失效');
assertEq(getApp(30).invalid_reason, 'order_closed', '失效原因 order_closed');
const n101 = notiOf(101).filter((n) => n.type === 'order_closed');
assertEq(n101.length, 1, '老师101收到订单关闭通知');
const closedAgain = (() => { try { closeOrder(4, 1); return null; } catch (e) { return e; } })();
assert(closedAgain && closedAgain.statusCode === 400, '重复关闭被拒');

console.log('== 7. 锁后关闭被拒 ==');
insertOrder(5, 1);
insertApplication(40, 5, 101);
selectTeacher(5, 40, 1);
const closeLocked = (() => { try { closeOrder(5, 1); return null; } catch (e) { return e; } })();
assert(closeLocked && closeLocked.statusCode === 400, '已锁定订单不可关闭');

console.log('== 8. 简历联系方式正则过滤 ==');
const { filterContactInfo } = require('../services/resume');
assertEq(filterContactInfo('联系我 13812345678 谢谢'), '联系我 [联系方式已过滤] 谢谢', '手机号被过滤');
assertEq(filterContactInfo('打 138 1234 5678 这个'), '打 [联系方式已过滤] 这个', '带空格手机号被过滤');
assertEq(filterContactInfo('座机 0851-1234567 可联系'), '座机 [联系方式已过滤] 可联系', '座机被过滤');
assertEq(filterContactInfo('加微信：abc_12345 详聊'), '加[联系方式已过滤] 详聊', '微信号被过滤');
assertEq(filterContactInfo('我的微信是 wx_abc12345，欢迎联系'), '我的[联系方式已过滤]，欢迎联系', '"微信是xxx"写法被过滤');
assertEq(filterContactInfo('微信号 abcdefgh 可加'), '[联系方式已过滤] 可加', '"微信号xxx"写法被过滤');
assertEq(filterContactInfo('加VX:xyz123456聊'), '加[联系方式已过滤]聊', 'VX+号被过滤');
assertEq(filterContactInfo('QQ 12345678 在线'), '[联系方式已过滤] 在线', 'QQ号被过滤');
assertEq(filterContactInfo('邮箱 test@qq.com 联系'), '邮箱 [联系方式已过滤] 联系', '邮箱被过滤');
assertEq(filterContactInfo('正常的简介，没有联系方式'), '正常的简介，没有联系方式', '无联系方式原样保留');
assertEq(filterContactInfo('课时费100-200元/小时'), '课时费100-200元/小时', '价格区间不被误杀');
assertEq(filterContactInfo(''), '', '空文本安全');

console.log('== 9. 已认证老师资质变更单：驳回不失效、通过才更新 ==');
const { submitProfile, getPendingChange, auditChange } = require('../services/profile');
// 老师101 认证通过
const now2 = Date.now();
db.prepare(
  `INSERT INTO teacher_profiles (user_id, real_name, cert_type, cert_image_url, subject, education, major,
     graduate_school, teachable_grades, intro, years_experience, audit_status, audited_at, created_at, updated_at)
   VALUES (101, '王明', 'teacher_certificate', '/uploads/old.jpg', '数学', '本科', '数学', '贵州大学',
     '初二,初三', '老简介', 8, 'approved', ?, ?, ?)`
).run(now2, now2, now2);
const baseData = {
  realName: '王明', certType: 'teacher_certificate', certImageUrl: '/uploads/new.jpg',
  degreeImageUrl: null, otherCertImageUrl: '/uploads/other.jpg', subject: '数学,物理',
  education: '硕士', major: '应用数学', graduateSchool: '浙江大学', grades: '初二,初三,高一',
  intro: '新简介', years: 9,
};
assertEq(submitProfile(101, baseData).mode, 'change', '已通过老师提交 → 生成变更单模式');
const p1 = db.prepare('SELECT * FROM teacher_profiles WHERE user_id = 101').get();
assertEq(p1.audit_status, 'approved', '提交修改后原资质仍为 approved');
assertEq(p1.education, '本科', '原资料未被改动');
const change = getPendingChange(101);
assert(!!change, '存在待审变更单');
assertEq(change.education, '硕士', '变更单保存新资料');

// 驳回修改 → 原资质继续有效
auditChange(change.id, 'reject', '证件不清晰', 1);
const p2 = db.prepare('SELECT * FROM teacher_profiles WHERE user_id = 101').get();
assertEq(p2.audit_status, 'approved', '驳回后仍为 approved');
assertEq(p2.education, '本科', '驳回后资料未变');
const rejectedChange = db.prepare('SELECT * FROM teacher_profile_changes WHERE id = ?').get(change.id);
assertEq(rejectedChange.audit_status, 'rejected', '变更单置 rejected');
assertEq(rejectedChange.reject_reason, '证件不清晰', '记录驳回原因');

// 重新提交 → 通过 → 新资料生效且保持 approved
assertEq(submitProfile(101, baseData).mode, 'change', '再次提交生成新变更单');
const change2 = getPendingChange(101);
auditChange(change2.id, 'approve', '', 1);
const p3 = db.prepare('SELECT * FROM teacher_profiles WHERE user_id = 101').get();
assertEq(p3.audit_status, 'approved', '通过修改后保持 approved');
assertEq(p3.education, '硕士', '新学历生效');
assertEq(p3.cert_image_url, '/uploads/new.jpg', '新证书生效');
assertEq(p3.subject, '数学,物理', '新科目生效');

// 首轮审核（无资料/被驳回）仍走直接模式
insertUser(201, 'teacher');
assertEq(submitProfile(201, baseData).mode, 'direct', '无资料老师 → 直接模式');
const p4 = db.prepare('SELECT * FROM teacher_profiles WHERE user_id = 201').get();
assertEq(p4.audit_status, 'pending', '首轮提交进入待审核');
assertEq(submitProfile(201, baseData).mode, 'direct', '待审核状态再次提交 → 直接模式（原地更新）');

console.log(`\n===== 测试结果: ${passed} 通过, ${failed} 失败 =====`);
db.close();
try { fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch (e) { /* ignore */ }
process.exit(failed ? 1 : 0);
