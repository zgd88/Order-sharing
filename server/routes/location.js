const express = require('express');
const { amapKey } = require('../config');

const router = express.Router();

// 高德地图 POI 关键字搜索（后端代理，避免前端暴露 Key）
// GET /api/location/search?keywords=观山湖公园&city=贵阳
router.get('/search', async (req, res) => {
  const { keywords, city } = req.query;
  if (!keywords) return res.status(400).json({ code: 400, message: '请输入搜索关键词' });
  if (!amapKey) {
    return res.status(503).json({
      code: 503,
      message: '尚未配置高德地图 Key，请先使用"在地图上选点"，或联系管理员在 server/config.js 填入 amapKey',
    });
  }
  const params = new URLSearchParams({
    key: amapKey,
    keywords,
    offset: '20',
    page: '1',
    extensions: 'base',
  });
  if (city) params.set('city', city);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(`https://restapi.amap.com/v3/place/text?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await resp.json();
    if (data.status !== '1') {
      return res.status(502).json({ code: 502, message: `高德搜索失败：${data.info || '未知错误'}` });
    }
    res.json({
      code: 0,
      data: (data.pois || []).map((p) => ({
        id: p.id,
        name: p.name,
        address: p.address || '',
        pname: p.pname || '',
        cityname: p.cityname || '',
        adname: p.adname || '',
        location: p.location || '', // "lng,lat"
      })),
    });
  } catch (e) {
    res.status(502).json({ code: 502, message: '高德搜索请求失败，请稍后重试' });
  }
});

// 逆地理编码：坐标 → 结构化地址（备用）
// GET /api/location/regeo?location=lng,lat
router.get('/regeo', async (req, res) => {
  const { location } = req.query;
  if (!location || !/^\d+\.\d+,\d+\.\d+$/.test(String(location))) {
    return res.status(400).json({ code: 400, message: '坐标参数不正确' });
  }
  if (!amapKey) return res.status(503).json({ code: 503, message: '尚未配置高德地图 Key' });
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(
      `https://restapi.amap.com/v3/geocode/regeo?key=${amapKey}&location=${location}&extensions=base`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    const data = await resp.json();
    if (data.status !== '1') {
      return res.status(502).json({ code: 502, message: `高德逆地理失败：${data.info || '未知错误'}` });
    }
    const rc = data.regeocode;
    const ac = rc.addressComponent || {};
    res.json({
      code: 0,
      data: {
        formattedAddress: rc.formatted_address || '',
        province: ac.province || '',
        city: ac.city || '',
        district: ac.district || '',
      },
    });
  } catch (e) {
    res.status(502).json({ code: 502, message: '高德逆地理请求失败，请稍后重试' });
  }
});

module.exports = router;
