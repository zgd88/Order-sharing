const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'peixue.db');
const db = new DatabaseSync(DB_PATH);

db.exec(fs.readFileSync(path.join(__dirname, 'sql', '001_schema.sql'), 'utf8'));

// 轻量迁移：为旧库补充 courses.province 列
const courseCols = db.prepare('PRAGMA table_info(courses)').all().map((c) => c.name);
if (!courseCols.includes('province')) {
  db.exec("ALTER TABLE courses ADD COLUMN province TEXT NOT NULL DEFAULT ''");
  console.log('[db] 已迁移：courses 表新增 province 列');
}

// 轻量迁移：teacher_profiles 增加 education/major/graduate_school/teachable_grades/证书照片列
const profileCols = db.prepare('PRAGMA table_info(teacher_profiles)').all().map((c) => c.name);
for (const [col, def] of [
  ['education', 'TEXT'], ['major', 'TEXT'], ['graduate_school', 'TEXT'], ['teachable_grades', 'TEXT'],
  ['other_cert_image_url', 'TEXT'], ['cert_image_url4', 'TEXT'], ['cert_image_url5', 'TEXT'],
]) {
  if (!profileCols.includes(col)) {
    db.exec(`ALTER TABLE teacher_profiles ADD COLUMN ${col} ${def}`);
    console.log(`[db] 已迁移：teacher_profiles 表新增 ${col} 列`);
  }
}

// 轻量迁移：teacher_profile_changes 增加证书照片4/5列
if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='teacher_profile_changes'").get()) {
  const changeCols = db.prepare('PRAGMA table_info(teacher_profile_changes)').all().map((c) => c.name);
  for (const [col, def] of [['cert_image_url4', 'TEXT'], ['cert_image_url5', 'TEXT']]) {
    if (!changeCols.includes(col)) {
      db.exec(`ALTER TABLE teacher_profile_changes ADD COLUMN ${col} ${def}`);
      console.log(`[db] 已迁移：teacher_profile_changes 表新增 ${col} 列`);
    }
  }
}

function seedAdmin() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM admins').get();
  if (row.c > 0) return;
  const now = Date.now();
  db.prepare(
    'INSERT INTO admins (username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)'
  ).run('admin', bcrypt.hashSync('admin123', 10), '平台管理员', now);
  console.log('[db] 已创建初始管理员 admin / admin123');
}

seedAdmin();

module.exports = db;
