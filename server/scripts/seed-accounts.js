// 批量注册账号 + 老师认证 + 发布课程/发单 + 生成 Excel 账号表
// 用法: node scripts/seed-accounts.js [老师数] [家长数] [课程数] [需求数] [Excel输出路径]
// 示例: node scripts/seed-accounts.js 8 12 10 8 账号数据.xlsx
const path = require('path');
const db = require('../db');
const { register } = require('../services/auth');
const { joinCourse } = require('../services/tier-engine');
const { maskAddress, applyOrder, selectTeacher } = require('../services/demand');
const XLSX = require('xlsx');

const TEACHER_N = Number(process.argv[2] || 8);
const PARENT_N = Number(process.argv[3] || 12);
const COURSE_N = Number(process.argv[4] || 10);
const DEMAND_N = Number(process.argv[5] || 8);
const OUT_PATH = process.argv[6] || '账号数据.xlsx';

const PASSWORD = 'peixue123'; // 统一初始密码
const now = Date.now();
const DAY = 864e5;

const SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '编程', '美术', '音乐'];
const GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '初一', '初二', '初三', '高一'];
const SURNAMES = '王李张刘陈杨赵黄周吴徐孙马朱胡郭何高林罗郑';
const EDUS = ['大专', '本科', '硕士', '博士'];
const MAJORS = ['数学教育', '汉语言文学', '英语教育', '物理学', '化学教育', '计算机科学', '美术学', '音乐教育'];
const SCHOOLS = ['浙江大学', '贵州师范大学', '杭州师范大学', '贵州大学', '华东师范大学', '西南大学', '浙江师范大学'];
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
const genPhone = () => `139${String(rnd(0, 99999999)).padStart(8, '0')}`;

// ---- 注册账号（自动去重重试） ----
const teachers = [];
const parents = [];
const accountRows = [];

function createAccount(role, nickname, subjects, grades) {
  for (let i = 0; i < 50; i++) {
    const phone = genPhone();
    try {
      const r = register({ phone, password: PASSWORD, role, nickname });
      const row = {
        序号: accountRows.length + 1,
        身份: role === 'teacher' ? '老师' : '家长',
        昵称: nickname,
        手机号: phone,
        密码: PASSWORD,
        认证状态: role === 'teacher' ? '已认证' : '—',
        发布课程数: 0,
        发布需求数: 0,
      };
      accountRows.push(row);
      return { userId: r.user.id, phone, row };
    } catch (e) {
      if (e.message.includes('已注册')) continue;
      throw e;
    }
  }
  throw new Error('生成唯一手机号失败');
}

for (let i = 1; i <= TEACHER_N; i++) {
  const nickname = `${pick([...SURNAMES])}老师`;
  const t = createAccount('teacher', nickname);
  const subjects = pickN(SUBJECTS, rnd(1, 3)).join(',');
  const grades = pickN(GRADES, rnd(2, 5)).join(',');
  // 直接认证通过
  db.prepare(
    `INSERT INTO teacher_profiles
     (user_id, real_name, id_card_no, cert_type, cert_image_url, subject, education, major,
      graduate_school, teachable_grades, intro, years_experience, audit_status, audited_at, created_at, updated_at)
     VALUES (?, ?, '', 'teacher_certificate', '', ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)`
  ).run(t.userId, nickname, subjects, pick(EDUS), pick(MAJORS), pick(SCHOOLS), grades,
    `专注教学多年，${pick(NOTES)}`, rnd(1, 15), now, now, now);
  teachers.push({ ...t, subjects, grades });
}

for (let i = 1; i <= PARENT_N; i++) {
  const nickname = `${pick(['小明', '小红', '小刚', '小雨', '小美', '小宇', '小浩', '小琳', '乐乐', '甜甜'])}${pick(['妈妈', '爸爸'])}`;
  parents.push(createAccount('parent', nickname));
}

// ---- 发布课程 ----
const courseRows = [];
function mkCourse(teacher) {
  const cityInfo = pick(CITIES);
  const base = rnd(60, 150) * 100;
  const tierCount = rnd(1, 3);
  const tiers = [{ min_people: 1, price_cents: base }];
  let prev = base;
  for (let i = 1; i <= tierCount; i++) {
    const price = Math.max(prev - rnd(5, 20) * 100, 2000);
    tiers.push({ min_people: tiers[i - 1].min_people + rnd(1, 3), price_cents: price });
    prev = price;
  }
  const minStudents = rnd(2, 5);
  const maxStudents = Math.max(tiers[tiers.length - 1].min_people, minStudents) + rnd(1, 6);
  const grade = pick(GRADES);
  const subject = pick(teacher.subjects.split(','));
  const title = `${grade}${subject}${pick(COURSE_TYPES)}`;
  const deadline = now + rnd(1, 10) * DAY;
  const start = now + rnd(5, 20) * DAY;
  const end = start + 2 * 3600e3;
  const address = cityInfo.addr.replace('{N}', rnd(1, 500));
  const ins = db.prepare(
    `INSERT INTO courses (teacher_id, title, subject, grade, cover_url, outline, province, city, address, lat, lng,
      start_time, end_time, deadline_at, min_students, max_students, current_unit_price_cents,
      status, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recruiting', ?, ?)`
  ).run(teacher.userId, title, subject, grade,
    `1. ${subject}基础巩固\n2. 重难点专项突破\n3. 真题演练与讲评\n4. 课后答疑辅导`,
    cityInfo.province, cityInfo.city, address, cityInfo.lat, cityInfo.lng,
    start, end, deadline, minStudents, maxStudents, tiers[tiers.length - 1].price_cents, now, now);
  const courseId = Number(ins.lastInsertRowid);
  const insTier = db.prepare('INSERT INTO course_tiers (course_id, min_people, price_cents) VALUES (?, ?, ?)');
  for (const t of tiers) insTier.run(courseId, t.min_people, t.price_cents);
  // 随机家长报名
  const forceFormed = rnd(1, 3) === 1;
  const target = forceFormed ? rnd(minStudents, maxStudents - 1) : rnd(0, Math.min(maxStudents - 1, 8));
  const joiners = pickN(parents.map((p) => p.userId), Math.min(target, parents.length));
  for (const pid of joiners) joinCourse(courseId, pid);
  const c = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  teacher.row.发布课程数 += 1;
  courseRows.push({
    课程ID: courseId,
    课程标题: title,
    科目: subject,
    年级: grade,
    城市: cityInfo.city,
    '阶梯价(元/节)': tiers.map((t) => `满${t.min_people}人¥${(t.price_cents / 100).toFixed(0)}`).join(' / '),
    发布老师: teacher.row.昵称,
    老师手机号: teacher.phone,
    '报名/上限': `${c.enrolled_count}/${c.max_students}`,
    状态: c.status === 'formed' ? '已成团' : c.status === 'recruiting' ? '拼团中' : c.status,
  });
}

const publishingTeachers = pickN(teachers, Math.min(COURSE_N, teachers.length));
let courseLeft = COURSE_N;
for (const t of publishingTeachers) {
  if (courseLeft <= 0) break;
  const n = Math.min(courseLeft, rnd(1, 2));
  for (let i = 0; i < n; i++) mkCourse(t);
  courseLeft -= n;
}

// ---- 发布需求 ----
const demandRows = [];
const publishingParents = pickN(parents, Math.min(DEMAND_N, parents.length));
for (const p of publishingParents) {
  const cityInfo = pick(CITIES);
  const grade = pick(GRADES);
  const subject = pick(SUBJECTS);
  const address = cityInfo.addr.replace('{N}', rnd(1, 500)) + `${rnd(1, 9)}栋${rnd(1, 30)}${pick(['01', '02', '03'])}室`;
  const ins = db.prepare(
    `INSERT INTO demand_orders
     (parent_id, subject, grade, hourly_rate_cents, phone, province, city, address, address_display,
      status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'recruiting', ?, ?)`
  ).run(p.userId, subject, grade, rnd(80, 250) * 100, p.phone,
    cityInfo.province, cityInfo.city, address, maskAddress(address), now, now);
  const orderId = Number(ins.lastInsertRowid);
  // 老师投递
  const appTeachers = pickN(teachers, Math.min(rnd(1, 4), teachers.length));
  const apps = [];
  for (const t of appTeachers) {
    const r = applyOrder(orderId, t.userId, `${pick(NOTES)}。`);
    if (r.ok) apps.push(r.id);
  }
  // 约 1/3 锁定
  let status = '招募中';
  if (apps.length && rnd(1, 3) === 1) {
    const r = selectTeacher(orderId, pick(apps), p.userId);
    if (r.ok) status = '已锁定';
  }
  p.row.发布需求数 += 1;
  demandRows.push({
    需求ID: orderId,
    需求: `${subject}${grade}家教`,
    课时费: `¥${(db.prepare('SELECT hourly_rate_cents FROM demand_orders WHERE id = ?').get(orderId).hourly_rate_cents / 100).toFixed(0)}/小时`,
    城市: cityInfo.city,
    发布家长: p.row.昵称,
    家长手机号: p.phone,
    投递数: apps.length,
    状态: status,
  });
}

// ---- 生成 Excel ----
const wb = XLSX.utils.book_new();
const ws1 = XLSX.utils.json_to_sheet(accountRows);
ws1['!cols'] = [{ wch: 6 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
XLSX.utils.book_append_sheet(wb, ws1, '账号列表');

const ws2 = XLSX.utils.json_to_sheet(courseRows);
ws2['!cols'] = [{ wch: 8 }, { wch: 28 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 36 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 }];
XLSX.utils.book_append_sheet(wb, ws2, '发布课程');

const ws3 = XLSX.utils.json_to_sheet(demandRows);
ws3['!cols'] = [{ wch: 8 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 8 }, { wch: 10 }];
XLSX.utils.book_append_sheet(wb, ws3, '发布需求');

const outPath = path.resolve(process.cwd(), OUT_PATH);
XLSX.writeFile(wb, outPath);

console.log('[seed-accounts] 完成：');
console.log(`  老师账号 ${TEACHER_N} 个（已认证）、家长账号 ${PARENT_N} 个，统一密码 ${PASSWORD}`);
console.log(`  发布课程 ${courseRows.length} 门、发布需求 ${demandRows.length} 条`);
console.log(`  Excel 已生成: ${outPath}`);
