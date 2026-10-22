// 平台配置
// 高德开放平台 Web 服务 API Key（https://console.amap.com 申请"Web服务"类型）
// 配置优先级：环境变量 AMAP_KEY > server/config.local.js（已 gitignore，适合本地填写）> 空
let local = {};
try {
  local = require('./config.local');
} catch (e) {
  /* 无本地配置 */
}

module.exports = {
  amapKey: process.env.AMAP_KEY || local.amapKey || '',
};
