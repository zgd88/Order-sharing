// 演示数据：老师/家长/课程/Banner。可重复执行（已存在则跳过），或传 --reset 清空后重建
const db = require('../db');
const { joinCourse } = require('../services/tier-engine');

const RESET = process.argv.includes('--reset');
if (RESET) {
  console.log('[seed] 清空业务数据（保留管理员）...');
  // 订单↔投递存在循环外键，重置期间临时关闭外键检查
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of ['notifications', 'demand_applications', 'demand_orders', 'refund_records', 'enrollments', 'course_tiers', 'courses', 'teacher_profiles', 'banners', 'users']) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare("DELETE FROM sqlite_sequence WHERE name != 'admins'").run();
}

const now = Date.now();
const DAY = 864e5;

function mkUser(openid, nickname, role) {
  db.prepare(
    'INSERT INTO users (openid, nickname, avatar_url, role, city, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(openid, nickname, null, role, '杭州', now, now);
  return Number(db.prepare('SELECT last_insert_rowid() AS id').get().id);
}

function mkProfile(userId, { realName, idCardNo, subject, years, status, rejectReason, education, major, graduateSchool, teachableGrades }) {
  db.prepare(
    `INSERT INTO teacher_profiles
     (user_id, real_name, id_card_no, cert_type, cert_image_url, degree_image_url, subject, education, major,
      graduate_school, teachable_grades, intro, years_experience, audit_status, reject_reason,
      audited_at, created_at, updated_at)
     VALUES (?, ?, ?, 'teacher_certificate', '/uploads/demo-cert.jpg', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, realName, idCardNo, subject, education || null, major || null,
    graduateSchool || null, teachableGrades || null,
    `专注${subject}教学，耐心细致，善于启发式引导。`, years,
    status, rejectReason || null, status === 'pending' ? null : now, now, now);
}

// 老师（openid 与登录接口的 mock_{deviceId} 规则一致）
const t1 = mkUser('mock_demo_teacher_1', '王老师', 'teacher');
const t2 = mkUser('mock_demo_teacher_2', '李老师', 'teacher');
const t3 = mkUser('mock_demo_teacher_3', '赵老师', 'teacher');
db.prepare('UPDATE users SET phone = ? WHERE id = ?').run('13500001111', t1);
db.prepare('UPDATE users SET phone = ? WHERE id = ?').run('13500002222', t2);
db.prepare('UPDATE users SET phone = ? WHERE id = ?').run('13500003333', t3);
mkProfile(t1, { realName: '王明', idCardNo: '330101199001011234', subject: '数学,物理', years: 8, status: 'approved', education: '硕士', major: '数学与应用数学', graduateSchool: '浙江大学', teachableGrades: '小学六年级,初一,初二,初三' });
mkProfile(t2, { realName: '李华', idCardNo: '330101199202025678', subject: '英语', years: 5, status: 'approved', education: '本科', major: '英语教育', graduateSchool: '浙江师范大学', teachableGrades: '小学三年级,小学四年级,小学五年级,小学六年级' });
mkProfile(t3, { realName: '赵强', idCardNo: '330101198803039012', subject: '物理', years: 10, status: 'pending' });

// 家长
const parents = [];
['小明妈妈', '小红爸爸', '小刚妈妈', '小雨爸爸', '小美妈妈', '小宇妈妈', '小浩爸爸', '小琳妈妈'].forEach((n, i) => {
  parents.push(mkUser(`mock_demo_parent_${i + 1}`, n, 'parent'));
});

const mkCourse = ({ teacherId, title, subject, grade, tiers, minStudents, maxStudents, deadlineOffset, startOffset, city = '杭州西湖区', province = '浙江' }) => {
  const deadline = now + deadlineOffset * DAY;
  const start = now + startOffset * DAY;
  const end = start + 2 * 3600e3;
  const coords = city === '贵阳观山湖区' ? [26.6477, 106.6302] : [30.2741, 120.1551];
  const ins = db.prepare(
    `INSERT INTO courses (teacher_id, title, subject, grade, cover_url, outline, province, city, address, lat, lng,
      start_time, end_time, deadline_at, min_students, max_students, current_unit_price_cents,
      status, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recruiting', ?, ?)`
  ).run(teacherId, title, subject, grade,
    `1. ${subject}基础巩固\n2. 重难点专项突破\n3. 真题演练与讲评\n4. 课后答疑辅导`,
    province, city,
    city === '贵阳观山湖区'
      ? '贵州省贵阳市观山湖区长岭北路 88 号（示例地址）'
      : `浙江省杭州市西湖区文三路 ${Math.floor(Math.random() * 200) + 100} 号（示例地址）`,
    coords[0], coords[1],
    start, end, deadline, minStudents, maxStudents, tiers[tiers.length - 1].price_cents, now, now);
  const courseId = Number(ins.lastInsertRowid);
  const insTier = db.prepare('INSERT INTO course_tiers (course_id, min_people, price_cents) VALUES (?, ?, ?)');
  for (const t of tiers) insTier.run(courseId, t.min_people, t.price_cents);
  return courseId;
};

// 课程1：数学（已成团 5 人，继续招募中，阶梯 100/90/80）
const c1 = mkCourse({
  teacherId: t1, title: '三年级数学思维冲刺班（10次课）', subject: '数学', grade: '三年级',
  tiers: [{ min_people: 1, price_cents: 10000 }, { min_people: 3, price_cents: 9000 }, { min_people: 5, price_cents: 8000 }],
  minStudents: 3, maxStudents: 8, deadlineOffset: 2, startOffset: 5,
});
for (let i = 0; i < 5; i++) joinCourse(c1, parents[i]);

// 课程2：英语（拼团中 2 人，还差 1 人成团）
const c2 = mkCourse({
  teacherId: t2, title: '少儿英语自然拼读启蒙班', subject: '英语', grade: '一年级',
  tiers: [{ min_people: 1, price_cents: 8000 }, { min_people: 3, price_cents: 7000 }, { min_people: 6, price_cents: 6000 }],
  minStudents: 3, maxStudents: 6, deadlineOffset: 3, startOffset: 6,
});
joinCourse(c2, parents[0]);
joinCourse(c2, parents[3]);

// 课程3：编程（拼团中 1 人）
const c3 = mkCourse({
  teacherId: t1, title: '少儿编程 Python 入门体验课', subject: '编程', grade: '四年级',
  tiers: [{ min_people: 1, price_cents: 12000 }, { min_people: 4, price_cents: 10000 }, { min_people: 8, price_cents: 8800 }],
  minStudents: 4, maxStudents: 8, deadlineOffset: 4, startOffset: 8,
});
joinCourse(c3, parents[1]);

// 课程4：美术（即将截止，还差 2 人，演示流局场景）
const c4 = mkCourse({
  teacherId: t2, title: '少儿创意美术水彩班', subject: '美术', grade: '幼儿园',
  tiers: [{ min_people: 1, price_cents: 6000 }, { min_people: 3, price_cents: 5000 }],
  minStudents: 3, maxStudents: 6, deadlineOffset: 0.002, startOffset: 2,
});
joinCourse(c4, parents[4]);

// 课程5：贵阳观山湖区（拼团中，演示多地区筛选）
const c5 = mkCourse({
  teacherId: t1, title: '观山湖区初中物理提分班', subject: '物理', grade: '初二',
  tiers: [{ min_people: 1, price_cents: 10000 }, { min_people: 3, price_cents: 8500 }, { min_people: 6, price_cents: 7500 }],
  minStudents: 3, maxStudents: 6, deadlineOffset: 5, startOffset: 9, city: '贵阳观山湖区', province: '贵州',
});
joinCourse(c5, parents[5]);

// 家长发单：需求1（招募中，2 位老师已投递）
const { maskAddress } = require('../services/demand');
const mkDemand = ({ parentId, subject, grade, rateCents, phone, city, address, status = 'recruiting' }) => {
  const ins = db.prepare(
    `INSERT INTO demand_orders (parent_id, subject, grade, hourly_rate_cents, phone, province, city, address,
      address_display, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '浙江', ?, ?, ?, ?, ?, ?)`
  ).run(parentId, subject, grade, rateCents, phone, city, address, maskAddress(address), status, now, now);
  return Number(ins.lastInsertRowid);
};
const mkApplication = (orderId, teacherId, note) => {
  const ins = db.prepare(
    `INSERT INTO demand_applications (order_id, teacher_id, note, status, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?)`
  ).run(orderId, teacherId, note, now, now);
  return Number(ins.lastInsertRowid);
};

const d1 = mkDemand({
  parentId: parents[0], subject: '数学', grade: '初二', rateCents: 15000,
  phone: '13800001111', city: '杭州西湖区', address: '浙江省杭州市西湖区文三路138号2单元301室',
});
mkApplication(d1, t1, '5年教龄，带过20余名初中生，擅长基础提分。');
mkApplication(d1, t2, '英语老师，可同步辅导数学作业。');

// 家长发单：需求2（已锁定，客服已跟进）
const d2 = mkDemand({
  parentId: parents[1], subject: '英语', grade: '一年级', rateCents: 12000,
  phone: '13900002222', city: '杭州西湖区', address: '浙江省杭州市西湖区学院路99号1栋502室', status: 'locked',
});
const d2App = mkApplication(d2, t2, '少儿英语教学经验丰富，亲和力强。');
db.prepare(
  `UPDATE demand_orders SET selected_teacher_id = ?, selected_application_id = ?, locked_at = ?,
     remark = '已联系家长待回复', remark_updated_at = ?, updated_at = ? WHERE id = ?`
).run(t2, d2App, now - 3600e3, now - 3600e3, now, d2);
db.prepare("UPDATE demand_applications SET status = 'selected', updated_at = ? WHERE id = ?").run(now, d2App);

// Banner
db.prepare(
  `INSERT INTO banners (title, image_url, link_type, link_value, sort_order, enabled, start_at, end_at, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, 1, NULL, NULL, ?, ?)`
).run('拼好课上线啦', '/uploads/demo-banner.jpg', 'course', String(c1), 1, now, now);

console.log('[seed] 演示数据完成：');
console.log(`  老师 3 位（2 已认证、1 待审核），家长 8 位`);
console.log(`  课程 5 门：c${c1} 数学(5/8已成团) c${c2} 英语(2/6) c${c3} 编程(1/8) c${c4} 美术(1/6即将流局) c${c5} 物理(贵阳观山湖区)`);
console.log(`  家长发单 2 个：d${d1} 数学(招募中,2人投递) d${d2} 英语(已锁定,客服跟进中)`);
console.log('  管理员：admin / admin123');
