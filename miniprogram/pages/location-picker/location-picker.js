const api = require('../../utils/request');
const loc = require('../../utils/location');

Page({
  data: {
    keyword: '',
    results: [],
    searching: false,
    searched: false,
    noKey: false,
    current: null,        // 当前位置 { address, latitude, longitude, province, city }
    currentCity: '',      // 当前城市（搜索默认范围）
    locating: false,
  },
  onLoad(options) {
    if (options.keyword) {
      this.setData({ keyword: options.keyword });
    }
    this.getCurrentLocation();
  },
  // 自动获取当前位置坐标并逆地理解析出地址
  getCurrentLocation() {
    const doGet = () => {
      this.setData({ locating: true });
      wx.getLocation({
        type: 'gcj02',
        success: async (r) => {
          const loca = { latitude: r.latitude, longitude: r.longitude };
          try {
            const geo = await api.get(
              '/api/location/regeo',
              { location: `${r.longitude},${r.latitude}` },
              { auth: false, silent: true }
            );
            const province = loc.parseProvince(geo.province || geo.formattedAddress);
            const cityRaw = (geo.city || '').replace(/市$/, '');
            const city = cityRaw + (geo.district || '');
            this.setData({
              current: {
                address: geo.formattedAddress || `纬度${r.latitude.toFixed(4)}, 经度${r.longitude.toFixed(4)}`,
                latitude: r.latitude,
                longitude: r.longitude,
                province,
                city,
              },
              currentCity: geo.district || geo.city || '',
            });
          } catch (e) {
            // 逆地理失败（无Key/网络）时，仅记录坐标用于地图居中
            this.setData({
              current: {
                address: '当前位置（点击地图选点确认）',
                latitude: r.latitude,
                longitude: r.longitude,
                province: '',
                city: '',
              },
            });
          }
          this.setData({ locating: false });
        },
        fail: () => {
          // 定位失败（未授权等）不打扰用户，搜索与地图选点仍可用
          this.setData({ locating: false });
        },
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
      if (this.data.currentCity) params.city = this.data.currentCity;
      const list = await api.get('/api/location/search', params, { auth: false });
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
  // 快速选择当前位置
  onSelectCurrent() {
    const c = this.data.current;
    if (!c) return;
    this.emitSelect({
      address: c.address,
      latitude: c.latitude,
      longitude: c.longitude,
      province: c.province,
      city: c.city,
    });
  },
  // 点选搜索结果
  onSelectPoi(e) {
    const poi = e.currentTarget.dataset.poi;
    const address = poi.fullAddress;
    const [lng, lat] = (poi.location || ',').split(',').map(Number);
    const result = {
      address,
      latitude: lat,
      longitude: lng,
      // 结构化信息（表单提交与筛选使用）
      province: loc.parseProvince(poi.pname || address),
      city: poi.cityname && poi.adname
        ? poi.cityname.replace(/市$/, '') + poi.adname
        : loc.parseCity(address),
    };
    this.emitSelect(result);
  },
  // 在地图上选点（微信自带地图：支持搜索与点选；有当前位置时地图自动居中）
  chooseOnMap() {
    const doChoose = () => {
      const opts = {};
      if (this.data.current) {
        opts.latitude = this.data.current.latitude;
        opts.longitude = this.data.current.longitude;
      }
      wx.chooseLocation({
        ...opts,
        success: (r) => {
          const address = r.address || r.name || '';
          this.emitSelect({
            address,
            latitude: r.latitude,
            longitude: r.longitude,
            province: loc.parseProvince(address),
            city: loc.parseCity(address),
          });
        },
        fail: (e) => {
          console.error('[chooseLocation] fail:', e);
          const msg = (e && e.errMsg) || '';
          if (msg.includes('auth') || msg.includes('permission')) {
            wx.showModal({
              title: '需要位置权限',
              content: '在地图上选点需要使用您的位置权限，请在设置中开启',
              confirmText: '去设置',
              cancelText: '取消',
              success: (r2) => {
                if (r2.confirm) wx.openSetting();
              },
            });
          } else {
            wx.showToast({ title: `打开地图失败：${msg || '未知错误'}`, icon: 'none', duration: 2500 });
          }
        },
      });
    };
    // 先检查授权状态：曾拒绝过则引导去设置，否则直接唤起（首次会弹系统授权框）
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.userLocation'] === false) {
          wx.showModal({
            title: '需要位置权限',
            content: '在地图上选点需要使用您的位置权限，请在设置中开启',
            confirmText: '去设置',
            cancelText: '取消',
            success: (r2) => {
              if (r2.confirm) wx.openSetting();
            },
          });
        } else {
          doChoose();
        }
      },
      fail: doChoose,
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
