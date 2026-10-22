// 位置解析工具：从地址字符串解析省/市+区县（与后端 normalizeProvince/maskAddress 规则配套）
const util = require('./util');

// 打开"选择地图位置"页，选中后回调 {address, latitude, longitude, province, city}
function openLocationPicker(onSelect) {
  wx.navigateTo({
    url: '/pages/location-picker/location-picker',
    events: {
      select: (res) => {
        if (typeof onSelect === 'function') onSelect(res);
      },
    },
  });
}

// 兜底：无事件通道时通过 storage 传递，调用方在 onShow 中消费
function consumePickedLocation() {
  const v = wx.getStorageSync('__picked_location');
  if (v) wx.removeStorageSync('__picked_location');
  return v || null;
}

// "贵州省贵阳市观山湖区…" → "贵州"；直辖市直接识别
function parseProvince(address) {
  const s = String(address || '').trim();
  if (!s) return '';
  const mu = s.match(/^(北京|上海|天津|重庆)/);
  if (mu) return mu[1];
  const pm = s.match(/([一-龥]{2,10}?(?:省|自治区|特别行政区))/);
  return pm ? util.normalizeRegion(pm[1]) : '';
}

// "贵州省贵阳市观山湖区…" → "贵阳观山湖区"（市+区县，不带"市"字）
function parseCity(address) {
  const s = String(address || '').trim();
  if (!s) return '';
  const m = s.match(/([一-龥]{2,10}?(?:市|州|地区))([一-龥]{2,10}?(?:区|县|旗|市))/);
  if (m) return m[1].replace(/市$/, '') + m[2];
  return s.split(/省|市/)[0] || '';
}

// 高德 POI → 一行完整地址（直辖市去重："北京市北京市朝阳区" → "北京市朝阳区"）
function buildAmapAddress(poi) {
  const { pname, cityname, adname, address, name } = poi || {};
  let s = '';
  if (pname && pname !== cityname) s += pname;
  if (cityname) s += cityname;
  if (adname) s += adname;
  if (address) s += address;
  return s || name || '';
}

module.exports = { parseProvince, parseCity, buildAmapAddress, openLocationPicker, consumePickedLocation };
