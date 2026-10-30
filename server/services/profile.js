const db = require('../db');

// 提交/更新认证资料：
// - 无资料 或 首轮审核未通过（pending/rejected）→ 直接更新原资料，进入待审核
// - 已通过 → 生成资质变更单待重新审核，原资质继续生效，审核通过后才更新
function submitProfile(userId, data) {
  const existing = db.prepare('SELECT * FROM teacher_profiles WHERE user_id = ?').get(userId);
  const now = Date.now();
  if (!existing || existing.audit_status !== 'approved') {
    if (existing) {
      db.prepare(
        `UPDATE teacher_profiles SET real_name = ?, cert_type = ?, cert_image_url = ?,
           degree_image_url = ?, other_cert_image_url = ?, subject = ?, education = ?, major = ?,
           graduate_school = ?, teachable_grades = ?, intro = ?, years_experience = ?,
           audit_status = 'pending', reject_reason = NULL, audited_by = NULL, audited_at = NULL, updated_at = ?
         WHERE user_id = ?`
      ).run(data.realName, data.certType, data.certImageUrl, data.degreeImageUrl, data.otherCertImageUrl,
        data.subject, data.education, data.major, data.graduateSchool, data.grades,
        data.intro, data.years, now, userId);
    } else {
      db.prepare(
        `INSERT INTO teacher_profiles
         (user_id, real_name, cert_type, cert_image_url, degree_image_url, other_cert_image_url,
          subject, education, major, graduate_school, teachable_grades, intro, years_experience,
          audit_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
      ).run(userId, data.realName, data.certType, data.certImageUrl, data.degreeImageUrl, data.otherCertImageUrl,
        data.subject, data.education, data.major, data.graduateSchool, data.grades,
        data.intro, data.years, now, now);
    }
    return { mode: 'direct' };
  }
  // 已通过：作废旧待审变更单，插入新变更单
  db.prepare(
    "UPDATE teacher_profile_changes SET audit_status = 'rejected', reject_reason = '被新提交覆盖', updated_at = ? WHERE user_id = ? AND audit_status = 'pending'"
  ).run(now, userId);
  db.prepare(
    `INSERT INTO teacher_profile_changes
     (user_id, real_name, cert_type, cert_image_url, degree_image_url, other_cert_image_url,
      subject, education, major, graduate_school, teachable_grades, intro, years_experience,
      audit_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).run(userId, data.realName, data.certType, data.certImageUrl, data.degreeImageUrl, data.otherCertImageUrl,
    data.subject, data.education, data.major, data.graduateSchool, data.grades,
    data.intro, data.years, now, now);
  return { mode: 'change' };
}

// 当前待审的变更单
function getPendingChange(userId) {
  return db
    .prepare("SELECT * FROM teacher_profile_changes WHERE user_id = ? AND audit_status = 'pending' ORDER BY id DESC LIMIT 1")
    .get(userId);
}

// 最近一条变更单（含已驳回的，用于页面提示）
function getLatestChange(userId) {
  return db
    .prepare('SELECT * FROM teacher_profile_changes WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(userId);
}

// 审核变更单：
// - approve：把新资料写入 teacher_profiles（audit_status 保持 approved），变更单置 approved
// - reject：只作废变更单并记录原因，原资质继续生效
function auditChange(changeId, action, reason, adminId) {
  const change = db.prepare('SELECT * FROM teacher_profile_changes WHERE id = ?').get(changeId);
  if (!change) throw Object.assign(new Error('变更单不存在'), { statusCode: 404 });
  if (change.audit_status !== 'pending') {
    throw Object.assign(new Error('该变更单已审核'), { statusCode: 400 });
  }
  const now = Date.now();
  if (action === 'approve') {
    db.prepare(
      `UPDATE teacher_profiles SET real_name = ?, cert_type = ?, cert_image_url = ?,
         degree_image_url = ?, other_cert_image_url = ?, subject = ?, education = ?, major = ?,
         graduate_school = ?, teachable_grades = ?, intro = ?, years_experience = ?,
         audit_status = 'approved', reject_reason = NULL, audited_by = ?, audited_at = ?, updated_at = ?
       WHERE user_id = ?`
    ).run(change.real_name, change.cert_type, change.cert_image_url, change.degree_image_url,
      change.other_cert_image_url, change.subject, change.education, change.major,
      change.graduate_school, change.teachable_grades, change.intro, change.years_experience,
      adminId, now, now, change.user_id);
    db.prepare(
      "UPDATE teacher_profile_changes SET audit_status = 'approved', reject_reason = NULL, audited_by = ?, audited_at = ?, updated_at = ? WHERE id = ?"
    ).run(adminId, now, now, changeId);
  } else {
    db.prepare(
      "UPDATE teacher_profile_changes SET audit_status = 'rejected', reject_reason = ?, audited_by = ?, audited_at = ?, updated_at = ? WHERE id = ?"
    ).run(reason || '', adminId, now, now, changeId);
  }
  return { ok: true };
}

module.exports = { submitProfile, getPendingChange, getLatestChange, auditChange };
