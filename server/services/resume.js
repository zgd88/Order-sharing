// 简历联系方式过滤：文本中出现的手机号/座机/微信号/QQ/邮箱一律替换为占位符
const HIDDEN = '[联系方式已过滤]';

const PHONE_PATTERNS = [
  /1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}/g, // 手机号（含 138 1234 5678 等分隔写法）
  /(?<!\d)0\d{2,3}[-—]?\d{7,8}(?!\d)/g, // 座机
  /(?:微信|weixin|wechat|vx|wx|v信)[:：\s是号]*[a-zA-Z][a-zA-Z0-9_-]{5,19}/gi, // 微信号（覆盖"微信是xxx"/"微信号xxx"写法）
  /QQ[:：\s]*\d{5,12}/gi, // QQ 号
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // 邮箱
];

function filterContactInfo(text) {
  let s = String(text || '');
  for (const re of PHONE_PATTERNS) {
    s = s.replace(re, HIDDEN);
  }
  return s;
}

module.exports = { filterContactInfo };
