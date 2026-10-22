const api = require('../../utils/request');
const loc = require('../../utils/location');

Page({
  data: {
    keyword: '',
    results: [],
    searching: false,
    searched: false,
    noKey: false,
  },
  onLoad(options) {
    if (options.keyword) {
      this.setData({ keyword: options.keyword });
      this.search();
    }
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
      const list = await api.get('/api/location/search', { keywords: kw }, { auth: false });
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
  // 在地图上选点（微信自带地图：支持搜索与点选）
  chooseOnMap() {
    const doChoose = () => {
      wx.chooseLocation({
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
