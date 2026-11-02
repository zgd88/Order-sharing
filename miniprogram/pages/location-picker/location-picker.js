const api = require('../../utils/request');
const loc = require('../../utils/location');

// 默认地图中心（杭州，获取定位失败时使用）
const DEFAULT_CENTER = { latitude: 30.2741, longitude: 120.1551 };

Page({
  data: {
    keyword: '',
    results: [],
    searching: false,
    searched: false,
    noKey: false,
    // 地图
    mapLat: DEFAULT_CENTER.latitude,
    mapLng: DEFAULT_CENTER.longitude,
    markers: [],
    // 当前选中位置
    selection: null,       // { address, latitude, longitude, province, city }
    resolving: false,      // 逆地理解析中
  },
  onLoad() {
    this.getCurrentLocation();
  },
  // 自动获取当前位置并作为初始选中位置
  getCurrentLocation() {
    const doGet = () => {
      wx.getLocation({
        type: 'gcj02',
        success: async (r) => {
          this.setMapCenter(r.latitude, r.longitude);
          await this.resolveLocation(r.latitude, r.longitude);
        },
        fail: () => { /* 定位失败：地图停留在默认中心，可手动点选 */ },
      });
    };
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.userLocation'] === false) return; // 曾被拒绝：静默跳过
        doGet();
      },
      fail: doGet,
    });
  },
  setMapCenter(lat, lng) {
    this.setData({ mapLat: lat, mapLng: lng });
  },
  // 逆地理：坐标 → 地址（无Key时降级为坐标文本）
  async resolveLocation(lat, lng) {
    this.setData({
      resolving: true,
      markers: [{ id: 1, latitude: lat, longitude: lng, width: 34, height: 44, iconPath: '/images/location-pin.png' }],
    });
    let result;
    try {
      const geo = await api.get('/api/location/regeo', { location: `${lng},${lat}` }, { auth: false, silent: true });
      const province = loc.parseProvince(geo.province || geo.formattedAddress);
      const cityRaw = (geo.city || '').replace(/市$/, '');
      result = {
        address: geo.formattedAddress || '',
        latitude: lat,
        longitude: lng,
        province,
        city: cityRaw + (geo.district || ''),
      };
    } catch (e) {
      // 无 Key 或网络失败：用坐标占位，仍可确认选择
      result = {
        address: `坐标 ${lng.toFixed(5)}, ${lat.toFixed(5)}（未解析出地址）`,
        latitude: lat,
        longitude: lng,
        province: '',
        city: '',
      };
    }
    this.setData({ selection: result, resolving: false });
  },
  // 点击地图选点
  onMapTap(e) {
    const { latitude, longitude } = e.detail || {};
    if (!latitude || !longitude) return;
    this.setMapCenter(latitude, longitude);
    this.resolveLocation(latitude, longitude);
  },
  // 搜索
  onKeyword(e) {
    this.setData({ keyword: e.detail.value });
  },
  onClear() {
    this.setData({ keyword: '', results: [], searched: false });
  },
  async search() {
    const kw = this.data.keyword.trim();
    if (!kw) {
      wx.showToast({ title: '请输入地点关键词', icon: 'none' });
      return;
    }
    this.setData({ searching: true, noKey: false });
    try {
      const params = { keywords: kw };
      const list = await api.get('/api/location/search', params, { auth: false, silent: true });
      this.setData({
        results: list.map((p) => ({
          ...p,
          fullAddress: loc.buildAmapAddress(p),
        })),
        searched: true,
      });
    } catch (e) {
      if (e.code === 503) {
        this.setData({ noKey: true, searched: true, results: [] });
      } else {
        this.setData({ searched: true, results: [] });
      }
    }
    this.setData({ searching: false });
  },
  // 点选搜索结果 → 直接选中并返回
  onSelectPoi(e) {
    const poi = e.currentTarget.dataset.poi;
    const address = poi.fullAddress;
    const [lng, lat] = (poi.location || ',').split(',').map(Number);
    this.emitSelect({
      address,
      latitude: lat,
      longitude: lng,
      province: loc.parseProvince(poi.pname || address),
      city: poi.cityname && poi.adname
        ? poi.cityname.replace(/市$/, '') + poi.adname
        : loc.parseCity(address),
    });
  },
  closeResults() {
    this.setData({ results: [], searched: false });
  },
  // 确认当前地图选中位置
  confirmSelection() {
    const s = this.data.selection;
    if (!s) {
      wx.showToast({ title: '请点击地图选择位置', icon: 'none' });
      return;
    }
    this.emitSelect({
      address: s.address,
      latitude: s.latitude,
      longitude: s.longitude,
      province: s.province,
      city: s.city,
    });
  },
  emitSelect(result) {
    const ec = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (ec && ec.emit) {
      ec.emit('select', result);
      wx.navigateBack();
    } else {
      // 兜底：无事件通道时通过 storage 传递
      wx.setStorageSync('__picked_location', result);
      wx.navigateBack();
    }
  },
});
