// 批量测试数据生成器（追加式，可重复执行，不清空现有数据）
// 用法: node scripts/seed-bulk.js [教师数] [家长数] [课程数] [需求单数]
// 示例: node scripts/seed-bulk.js 10 30 20 20
const db = require('../db');
const { joinCourse } = require('../services/tier-engine');
const { maskAddress, applyOrder, selectTeacher } = require('../services/demand');

const T = Number(process.argv[2] || 10);
const P = Number(process.argv[3] || 30);
const C = Number(process.argv[4] || 20);
const D = Number(process.argv[5] || 20);

const now = Date.now();
const DAY = 864e5;
const TAG = `b${now.toString(36)}`; // 每次运行独立标识，避免 openid 冲突

const SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '政治', '历史', '地理', '编程', '美术', '音乐'];
const GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '初一', '初二', '初三', '高一', '高二', '高三'];
const SURNAMES = '王李张刘陈杨赵黄周吴徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾萧田董潘袁蔡蒋余于杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤';
const EDUS = ['大专', '本科', '硕士', '博士'];
const SCHOOLS = ['浙江大学', '贵州师范大学', '杭州师范大学', '贵州大学', '华东师范大学', '西南大学', '浙江师范大学', '贵阳学院'];
const COURSE_TYPES = ['同步辅导班', '提分冲刺班', '启蒙兴趣班', '思维训练班', '专项突破班'];
const NOTES = ['多年教学经验，耐心负责', '擅长基础巩固与提分', '带过多名学生，成绩提升明显', '可上门授课，时间灵活', '有竞赛辅导经验'];
const CITIES = [
  { city: '杭州西湖区', province: '浙江', addr: '浙江省杭州市西湖区文三路{N}号', lat: 30.2741, lng: 120.1551 },
  { city: '杭州拱墅区', province: '浙江', addr: '浙江省杭州市拱墅区湖墅南路{N}号', lat: 30.3191, lng: 120.1412 },
  { city: '贵阳观山湖区', province: '贵州', addr: '贵州省贵阳市观山湖区长岭北路{N}号', lat: 26.6477, lng: 106.6302 },
  { city: '贵阳南明区', province: '贵州', addr: '贵州省贵阳市南明区花果园大街{N}号', lat: 26.5681, lng: 106.7145 },
  { city: '上海浦东新区', province: '上海', addr: '上海市浦东新区张江路{N}号', lat: 31.2216, lng: 121.615 },
];

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickN = (arr, n) => {
  const s = new Set();
  while (s.size < n) s.add(pick(arr));
  return [...s];
};

function mkUser(openid, nickname, role) {
  const ins = db.prepare(
    'INSERT INTO users (openid, nickname, avatar_url, role, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)'
  ).run(openid, nickname, role, now, now);
  return Number(ins.lastInsertRowid);
}

// ---- 1. 批量老师（认证通过） ----
const teachers = [];
for (let i = 1; i <= T; i++) {
  const nickname = `${pick([...SURNAMES])}老师${i}`;
  const uid = mkUser(`${TAG}_teacher_${i}`, nickname, 'teacher');
  const subject = pickN(SUBJECTS, rnd(1, 3)).join(',');
  const grades = pickN(GRADES, rnd(2, 5)).join(',');
  db.prepare(
    `INSERT INTO teacher_profiles
     (user_id, real_name, id_card_no, cert_type, cert_image_url, degree_image_url, subject, education, major,
      graduate_school, teachable_grades, intro, years_experience, audit_status, audited_at, created_at, updated_at)
     VALUES (?, ?, NULL, 'teacher_certificate', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)`
  ).run(uid, nickname.replace(/老师\d+$/, ''), subject, pick(EDUS), `${pick(SUBJECTS)}教育`,
    pick(SCHOOLS), grades, `专注教学多年，${pick(NOTES)}`, rnd(1, 15), now, now, now);
  db.prepare('UPDATE users SET phone = ? WHERE id = ?')
    .run(`1${pick(['35', '36', '37', '38', '39', '50', '51', '58', '59', '88', '86'])}${String(rnd(0, 99999999)).padStart(8, '0')}`, uid);
  teachers.push(uid);
}

// ---- 2. 批量家长 ----
const parents = [];
for (let i = 1; i <= P; i++) {
  const uid = mkUser(`${TAG}_parent_${i}`, `${pick(['小明', '小红', '小刚', '小雨', '小美', '小宇', '小浩', '小琳', '乐乐', '甜甜', '轩轩', '悦悦'])}${pick(['妈妈', '爸爸'])}${i}`, 'parent');
  parents.push(uid);
}

// ---- 3. 批量拼好课 ----
const mkCourse = ({ teacherId, title, subject, grade, tiers, minStudents, maxStudents, cityInfo, deadlineOffset, startOffset }) => {
  const deadline = now + deadlineOffset * DAY;
  const start = now + startOffset * DAY;
  const end = start + 2 * 3600e3;
  const address = cityInfo.addr.replace('{N}', rnd(1, 500));
  const ins = db.prepare(
    `INSERT INTO courses (teacher_id, title, subject, grade, cover_url, outline, province, city, address, lat, lng,
      start_time, end_time, deadline_at, min_students, max_students, current_unit_price_cents,
      status, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recruiting', ?, ?)`
  ).run(teacherId, title, subject, grade,
    `1. ${subject}基础巩固\n2. 重难点专项突破\n3. 真题演练与讲评\n4. 课后答疑辅导`,
    cityInfo.province, cityInfo.city, address, cityInfo.lat, cityInfo.lng,
    start, end, deadline, minStudents, maxStudents, tiers[tiers.length - 1].price_cents, now, now);
  const courseId = Number(ins.lastInsertRowid);
  const insTier = db.prepare('INSERT INTO course_tiers (course_id, min_people, price_cents) VALUES (?, ?, ?)');
  for (const t of tiers) insTier.run(courseId, t.min_people, t.price_cents);
  return courseId;
};

const genTiers = () => {
  const base = rnd(60, 150) * 100;
  const n = rnd(1, 3);
  const tiers = [{ min_people: 1, price_cents: base }];
  let prev = base;
  for (let i = 1; i <= n; i++) {
    const price = Math.max(prev - rnd(5, 20) * 100, 2000);
    tiers.push({ min_people: tiers[i - 1].min_people + rnd(1, 3), price_cents: price });
    prev = price;
  }
  return tiers;
};

let formedCount = 0;
const courseIds = [];
for (let i = 1; i <= C; i++) {
  const tiers = genTiers();
  const minStudents = rnd(2, 5);
  const maxStudents = Math.max(tiers[tiers.length - 1].min_people, minStudents) + rnd(1, 6);
  const grade = pick(GRADES);
  const subject = pick(SUBJECTS);
  // 报名截止必须早于开课时间
  const startOffset = rnd(5, 20);
  const cid = mkCourse({
    teacherId: pick(teachers),
    title: `${grade}${subject}${pick(COURSE_TYPES)}${TAG.slice(-3)}${i}`,
    subject, grade, tiers, minStudents, maxStudents,
    cityInfo: pick(CITIES),
    deadlineOffset: rnd(1, Math.max(1, startOffset - 1)),
    startOffset,
  });
  courseIds.push(cid);
  // 随机报名：约 1/3 的课报名到成团
  const forceFormed = i % 3 === 0;
  const target = forceFormed ? rnd(minStudents, maxStudents - 1) : rnd(0, Math.min(maxStudents - 1, 8));
  const joiners = pickN(parents, Math.min(target, parents.length));
  for (const p of joiners) joinCourse(cid, p);
  const c = db.prepare('SELECT status FROM courses WHERE id = ?').get(cid);
  if (c.status === 'formed') formedCount++;
}

// ---- 4. 批量家长发单 ----
let lockedCount = 0;
const demandIds = [];
for (let i = 1; i <= D; i++) {
  const cityInfo = pick(CITIES);
  const grade = pick(GRADES);
  const subject = pick(SUBJECTS);
  const address = cityInfo.addr.replace('{N}', rnd(1, 500)) + `${rnd(1, 9)}栋${rnd(1, 30)}${pick(['01', '02', '03'])}室`;
  const ins = db.prepare(
    `INSERT INTO demand_orders
     (parent_id, subject, grade, hourly_rate_cents, phone, province, city, address, address_display,
      status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'recruiting', ?, ?)`
  ).run(pick(parents), subject, grade, rnd(80, 250) * 100,
    `1${pick(['35', '36', '37', '38', '39', '50', '51', '58', '59', '88', '86'])}${String(rnd(0, 99999999)).padStart(8, '0')}`,
    cityInfo.province, cityInfo.city, address, maskAddress(address), now, now);
  const orderId = Number(ins.lastInsertRowid);
  demandIds.push(orderId);
  // 随机老师投递
  const appCount = rnd(0, 5);
  const apps = [];
  for (const t of pickN(teachers, Math.min(appCount, teachers.length))) {
    const r = applyOrder(orderId, t, `${pick(NOTES)}。`);
    if (r.ok) apps.push(r.id);
  }
  // 约 1/3 的订单被家长锁定
  if (apps.length && i % 3 === 0) {
    const r = selectTeacher(orderId, pick(apps), db.prepare('SELECT parent_id FROM demand_orders WHERE id = ?').get(orderId).parent_id);
    if (r.ok) lockedCount++;
  }
}

console.log('[seed-bulk] 批量测试数据完成（追加式，未清空原数据）：');
console.log(`  老师 ${T} 位（已认证）、家长 ${P} 位`);
console.log(`  拼好课 ${C} 门（其中已成团 ${formedCount} 门）`);
console.log(`  家长发单 ${D} 条（其中已锁定 ${lockedCount} 条）`);
console.log('  数据标识:', TAG, '（重复执行不会冲突）');
