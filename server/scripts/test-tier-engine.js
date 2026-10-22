// 阶梯定价引擎集成测试：使用独立临时数据库，覆盖阶梯退差/成团/流局/取消/幂等
const path = require('path');
const fs = require('fs');
const os = require('os');

// ---- 准备独立测试数据库（通过 DB_PATH 环境变量注入） ----
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'peixue-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

const testDb = require('../db');
const {
  validateTiers, priceForCount, joinCourse, failCourse, cancelCourse, finishCourse,
} = require('../services/tier-engine');

let passed = 0;
let failed = 0;
function assert(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}
function assertEq(actual, expected, name) {
  assert(actual === expected, name, `期望 ${expected}，实际 ${actual}`);
}

// ---- 工具函数：直接插入用户/课程 ----
function insertUser(id, role = 'parent') {
  const now = Date.now();
  testDb.prepare(
    "INSERT INTO users (id, openid, nickname, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, `mock_test_${id}`, `用户${id}`, role, now, now);
}
function insertCourse({ id, teacherId, minStudents, maxStudents, tiers, deadlineAt, status = 'recruiting', startTime, endTime }) {
  const now = Date.now();
  const start = startTime || now + 7 * 864e5;
  const end = endTime || start + 2 * 3600e3;
  testDb.prepare(
    `INSERT INTO courses (id, teacher_id, title, subject, outline, city, address, lat, lng,
      start_time, end_time, deadline_at, min_students, max_students, current_unit_price_cents,
      status, created_at, updated_at)
     VALUES (?, ?, ?, '数学', ?, '测试市', ?, 30.0, 120.0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, teacherId, `课程${id}`, '大纲', '某地址', start, end,
    deadlineAt || now + 3 * 864e5, minStudents, maxStudents, tiers[tiers.length - 1].price_cents, status, now, now);
  const insTier = testDb.prepare('INSERT INTO course_tiers (course_id, min_people, price_cents) VALUES (?, ?, ?)');
  for (const t of tiers) insTier.run(id, t.min_people, t.price_cents);
}
function enroll(courseId, parentId) {
  return joinCourse(courseId, parentId);
}
function getEnrollment(courseId, parentId) {
  return testDb.prepare('SELECT * FROM enrollments WHERE course_id = ? AND parent_id = ?').get(courseId, parentId);
}
function getRefunds(courseId) {
  return testDb.prepare('SELECT * FROM refund_records WHERE course_id = ? ORDER BY id').all(courseId);
}
function getCourse(id) {
  return testDb.prepare('SELECT * FROM courses WHERE id = ?').get(id);
}
function totalRefunded(parentId) {
  const r = testDb.prepare(
    "SELECT COALESCE(SUM(amount_cents),0) AS v FROM refund_records WHERE parent_id = ? AND status = 'paid'"
  ).get(parentId);
  return r.v;
}

console.log('== 1. 档位校验 ==');
assert(validateTiers([{ min_people: 1, price_cents: 10000 }], 8).ok, '单档合法');
assert(!validateTiers([{ min_people: 3, price_cents: 10000 }], 8).ok, '第一档必须满1人');
assert(!validateTiers([{ min_people: 1, price_cents: 10000 }, { min_people: 5, price_cents: 12000 }], 8).ok, '价格必须递减');
assert(!validateTiers([{ min_people: 1, price_cents: 10000 }, { min_people: 5, price_cents: 8000 }, { min_people: 5, price_cents: 6000 }], 8).ok, '人数必须严格递增');
assert(!validateTiers([{ min_people: 1, price_cents: 10000 }], 0).ok, '档位人数不超上限');
assertEq(priceForCount([{ min_people: 1, price_cents: 10000 }, { min_people: 3, price_cents: 9000 }, { min_people: 5, price_cents: 8000 }], 2, ), 10000, '2人落档=100元');

console.log('== 2. 阶梯退差：3档课程（满1人100 / 满3人90 / 满5人80），成团3人 ==');
insertUser(1, 'teacher'); // 老师
for (let i = 100; i <= 108; i++) insertUser(i); // 8位家长
insertCourse({
  id: 1, teacherId: 1, minStudents: 3, maxStudents: 8,
  tiers: [
    { min_people: 1, price_cents: 10000 },
    { min_people: 3, price_cents: 9000 },
    { min_people: 5, price_cents: 8000 },
  ],
});

let r1 = enroll(1, 100);
assert(r1.ok, '第1人报名成功');
assertEq(getEnrollment(1, 100).price_at_join_cents, 10000, '第1人按最高阶梯100元入团');
assertEq(getCourse(1).status, 'recruiting', '1人未成团');
assertEq(getCourse(1).enrolled_count, 1, '人数=1');

let r2 = enroll(1, 101);
assert(r2.ok, '第2人报名成功');
assertEq(getEnrollment(1, 101).price_at_join_cents, 10000, '第2人入团价=100元（2人档仍100）');
assertEq(getEnrollment(1, 100).current_price_cents, 10000, '2人仍按100元档');
assertEq(getRefunds(1).length, 0, '2人时无退差');

let r3 = enroll(1, 102);
assert(r3.ok, '第3人报名成功');
assertEq(getEnrollment(1, 102).price_at_join_cents, 9000, '第3人入团价=90元（直接按当前档付费）');
assertEq(getEnrollment(1, 100).current_price_cents, 9000, '第1人降至90元');
assertEq(getEnrollment(1, 101).current_price_cents, 9000, '第2人降至90元');
assertEq(getEnrollment(1, 102).current_price_cents, 9000, '第3人按90元');
assertEq(getRefunds(1).filter((x) => x.type === 'tier_diff').length, 2, '2条退差记录（仅先前2人）');
assertEq(totalRefunded(100), 1000, '第1人累计退10元');
assertEq(totalRefunded(102), 0, '第3人无退差（直接按90付费）');
assertEq(getCourse(1).status, 'formed', '3人达成成团');
assertEq(r3.course.status, 'formed', '返回结果携带成团状态');

console.log('== 3. 成团后继续报名：第4人、第5人触发降至80元 ==');
enroll(1, 103);
assertEq(getEnrollment(1, 100).current_price_cents, 9000, '4人仍90元档');
let r5 = enroll(1, 104);
assert(r5.ok, '第5人报名成功');
assertEq(getEnrollment(1, 104).price_at_join_cents, 8000, '第5人入团价=80元（直接按当前档付费）');
assertEq(getEnrollment(1, 100).current_price_cents, 8000, '第1人降至80元');
assertEq(getEnrollment(1, 104).current_price_cents, 8000, '第5人按80元');
assertEq(getRefunds(1).filter((x) => x.type === 'tier_diff').length, 6, '累计6条退差（2+4）');
assertEq(totalRefunded(100), 2000, '第1人累计退20元（100→80）');
assertEq(totalRefunded(101), 2000, '第2人累计退20元');
assertEq(totalRefunded(102), 1000, '第3人累计退10元（90→80）');
assertEq(totalRefunded(104), 0, '第5人无退差（直接按80付费）');

console.log('== 4. 幂等与边界 ==');
const rDup = enroll(1, 100);
assert(!rDup.ok && rDup.message.includes('已参团'), '重复报名被拒');
const rTeacher = enroll(1, 1);
assert(!rTeacher.ok && rTeacher.message.includes('自己的课程'), '老师不能报自己课程');

console.log('== 5. 满员：8人课程报满后拒绝 ==');
enroll(1, 105); enroll(1, 106); enroll(1, 107);
assertEq(getCourse(1).enrolled_count, 8, '已报满8人');
const rFull = enroll(1, 108);
assert(!rFull.ok && rFull.message.includes('满员'), '满员后报名被拒');
assertEq(getEnrollment(1, 107).current_price_cents, 8000, '第7人按80元');

console.log('== 6. 流局：截止未成团 → 全额退款 + 退差台账正确 ==');
insertCourse({
  id: 2, teacherId: 1, minStudents: 5, maxStudents: 8, deadlineAt: Date.now() - 1000,
  tiers: [
    { min_people: 1, price_cents: 10000 },
    { min_people: 3, price_cents: 9000 },
  ],
});
// 截止前报名3人（手动回拨时间模拟）：直接插 enrollment 模拟已报名
const past = Date.now() - 3600e3;
const insE = testDb.prepare(
  `INSERT INTO enrollments (course_id, parent_id, join_seq, price_at_join_cents, current_price_cents, status, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, 'joined', ?, ?)`
);
insE.run(2, 100, 1, 10000, 9000, past, past);
insE.run(2, 101, 2, 10000, 9000, past, past);
insE.run(2, 102, 3, 10000, 9000, past, past);
testDb.prepare('UPDATE courses SET enrolled_count = 3, current_unit_price_cents = 9000 WHERE id = 2').run();
failCourse(2);
assertEq(getCourse(2).status, 'failed', '课程标记流局');
assertEq(getRefunds(2).filter((x) => x.type === 'flow_refund').length, 3, '3条流局退款');
const f100 = getRefunds(2).filter((x) => x.type === 'flow_refund' && x.parent_id === 100)[0];
assertEq(f100.amount_cents, 9000, '流局退剩余应付90元');
assertEq(totalRefunded(100), 2000 + 9000, '第1人合计退 11000 = 入团10000 + 流局后不再重复（注：跨课程合计）');
assertEq(getEnrollment(2, 100).status, 'expired', '参团记录置为 expired');
const rAfterFail = enroll(2, 103);
assert(!rAfterFail.ok, '流局后禁止报名');

console.log('== 7. 老师取消课程 → 退剩余应付 ==');
insertCourse({
  id: 3, teacherId: 1, minStudents: 3, maxStudents: 8,
  tiers: [{ min_people: 1, price_cents: 10000 }, { min_people: 3, price_cents: 9000 }],
});
enroll(3, 100); enroll(3, 101); enroll(3, 102); // 成团，各降至90
cancelCourse(3, 'teacher');
assertEq(getCourse(3).status, 'cancelled', '课程标记取消');
assertEq(getRefunds(3).filter((x) => x.type === 'course_cancel_refund').length, 3, '3条取消退款');
const c100 = getRefunds(3).filter((x) => x.type === 'course_cancel_refund' && x.parent_id === 100)[0];
assertEq(c100.amount_cents, 9000, '取消退剩余应付90元');
assertEq(getEnrollment(3, 100).status, 'expired', '参团记录置为 expired');
assertEq(getEnrollment(3, 100).expired_reason, 'teacher_cancel', '过期原因 teacher_cancel');

console.log('== 8. 课程完成 ==');
insertCourse({
  id: 4, teacherId: 1, minStudents: 2, maxStudents: 4,
  tiers: [{ min_people: 1, price_cents: 10000 }, { min_people: 2, price_cents: 9000 }],
  startTime: Date.now() - 5 * 3600e3, endTime: Date.now() - 1000, deadlineAt: Date.now() - 6 * 3600e3,
});
// 已过截止但已成团：手工置 formed
testDb.prepare("UPDATE courses SET status = 'formed' WHERE id = 4").run();
assertEq(finishCourse(4), true, '课程可推进为 finished');
assertEq(getCourse(4).status, 'finished', '课程标记 finished');
assertEq(finishCourse(4), false, '重复推进返回 false');

console.log('== 9. 并发报名：join_seq 唯一约束兜底 ==');
insertCourse({
  id: 5, teacherId: 1, minStudents: 2, maxStudents: 8,
  tiers: [{ min_people: 1, price_cents: 10000 }],
});
const rs = [100, 101, 102, 103, 104, 105, 106, 107].map((p) => enroll(5, p));
assert(rs.every((r) => r.ok), '8人全部报名成功');
assertEq(getCourse(5).enrolled_count, 8, '人数=8');
const seqs = testDb.prepare('SELECT join_seq FROM enrollments WHERE course_id = 5 ORDER BY join_seq').all();
assert(seqs.every((s, i) => s.join_seq === i + 1), 'join_seq 连续无重号');

console.log(`\n===== 测试结果: ${passed} 通过, ${failed} 失败 =====`);
testDb.close();
try {
  fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
} catch (e) {
  console.log(`(临时目录清理失败，可忽略: ${tmpDir})`);
}
process.exit(failed ? 1 : 0);
