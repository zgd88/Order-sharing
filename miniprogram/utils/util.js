function formatTime(ts, withDate = true) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return withDate ? `${md} ${hm}` : hm;
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fen2yuan(cents) {
  if (cents == null) return '0.00';
  return (cents / 100).toFixed(2);
}

const COURSE_STATUS = {
  recruiting: { text: '拼团中', color: '#4A90E2' },
  formed: { text: '已成团', color: '#52C41A' },
  failed: { text: '已流局', color: '#999999' },
  cancelled: { text: '已取消', color: '#999999' },
  finished: { text: '已结束', color: '#999999' },
};

function courseStatus(status) {
  return COURSE_STATUS[status] || { text: status, color: '#999' };
}

// 行政区划名称规范化：贵州省 → 贵州、广西壮族自治区 → 广西、北京市 → 北京
function normalizeRegion(name) {
  return String(name || '').replace(/(壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市)$/, '');
}

const SUBJECTS = ['全部', '数学', '语文', '英语', '物理', '化学', '生物', '政治', '历史', '地理', '编程', '美术', '音乐', '书法', '舞蹈', '其他'];
const GRADES = ['幼儿园', '一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '初一', '初二', '初三', '高一', '高二', '高三', '成人'];
const REGIONS = require('./regions.js');

module.exports = { formatTime, formatDate, fen2yuan, courseStatus, normalizeRegion, SUBJECTS, GRADES, REGIONS };
