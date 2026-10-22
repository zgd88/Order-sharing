const api = require('../../utils/request');
const auth = require('../../utils/auth');
const util = require('../../utils/util');

Page({
  data: {
    isTeacher: false,
    // 家长：大厅
    banners: [],
    subjects: util.SUBJECTS,
    subject: '全部',
    subjectIndex: 0,
    grades: ['全部', ...util.GRADES],
    grade: '全部',
    gradeIndex: 0,
    // 地区三级联动：省 → 市 → 区县（区县可选）
    region: null,
    regionText: '全部地区',
    showRegion: false,
    provinces: util.REGIONS,
    provinceIndex: 0,
    citiesView: ['全部城市', ...(util.REGIONS[0] ? util.REGIONS[0].cities.map((c) => c.name) : [])],
    cityIndex: 0,
    areasView: ['全部区县'],
    areaIndex: 0,
    list: [],
    loading: false,
    loaded: false,
    // 老师：工作台
    profile: null,
    teacherCourses: [],
    recentCourses: [],
    stats: { totalGrossCents: 0, totalNetCents: 0, platformRate: 0.05, grossYuan: '0', netYuan: '0', ratePercent: '5' },
  },

  onShow() {
    if (!auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const isTeacher = auth.isTeacher();
    this.setData({ isTeacher });
    if (isTeacher) this.loadTeacherHome();
    else this.loadParentHome();
  },

  async onPullDownRefresh() {
    if (this.data.isTeacher) await this.loadTeacherHome();
    else await this.loadParentHome();
    wx.stopPullDownRefresh();
  },

  // ---------------- 家长大厅 ----------------
  async loadParentHome() {
    this.setData({ loading: true });
    try {
      const [bannerData] = await Promise.all([
        api.get('/api/banners', {}, { auth: false }).catch(() => []),
        this.fetchCourses(),
      ]);
      const banners = (bannerData || []).map((b) => ({ ...b, imageUrl: api.fullUrl(b.imageUrl) }));
      this.setData({ banners, loaded: true });
      // fetchCourses 内部已 setData
    } catch (e) {
      this.setData({ loaded: true });
    }
    this.setData({ loading: false });
  },

  async fetchCourses() {
    const params = {};
    if (this.data.subject !== '全部') params.subject = this.data.subject;
    if (this.data.grade !== '全部') params.grade = this.data.grade;
    const region = this.data.region;
    if (region) {
      if (region.province) params.province = region.province;
      if (region.area) params.city = region.area;
      else if (region.city) params.city = region.city;
    }
    // 尝试获取定位用于距离排序
    try {
      const loc = await this.getLocation();
      params.lat = loc.latitude;
      params.lng = loc.longitude;
    } catch (e) { /* 无定位权限则按默认排序 */ }
    const data = await api.get('/api/courses', params, { auth: false });
    const list = (data.list || []).map((c) => ({
      ...c,
      priceText: util.fen2yuan(c.currentPriceCents),
      lowestPriceText: util.fen2yuan(c.lowestPriceCents),
      statusInfo: util.courseStatus(c.status),
      startText: util.formatTime(c.startTime),
      needToFormText: c.needToForm > 0 ? `还差${c.needToForm}人成团` : '已成团',
    }));
    this.setData({ list });
    return data;
  },

  getLocation() {
    return new Promise((resolve, reject) => {
      wx.getLocation({ type: 'gcj02', success: resolve, fail: reject });
    });
  },

  onSubjectChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ subject: this.data.subjects[idx], subjectIndex: idx });
    this.fetchCourses();
  },

  onGradeChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ grade: this.data.grades[idx], gradeIndex: idx });
    this.fetchCourses();
  },

  // ---- 地区三级联动选择 ----
  openRegion() {
    const region = this.data.region;
    if (region) {
      // 按已选值还原三列索引
      let provinceIndex = 0;
      const pIdx = this.data.provinces.findIndex((p) => util.normalizeRegion(p.name) === region.province);
      if (pIdx >= 0) provinceIndex = pIdx;
      const p = this.data.provinces[provinceIndex];
      const citiesView = ['全部城市', ...(p.cities || []).map((c) => c.name)];
      let cityIndex = 0;
      const cIdx = (p.cities || []).findIndex((c) => util.normalizeRegion(c.name) === region.city);
      if (cIdx >= 0) cityIndex = cIdx + 1;
      let areasView = ['全部区县'];
      let areaIndex = 0;
      if (cityIndex > 0) {
        areasView = ['全部区县', ...(p.cities[cityIndex - 1].areas || [])];
        const aIdx = areasView.findIndex((a) => a === region.area);
        if (aIdx > 0) areaIndex = aIdx;
      }
      this.setData({ provinceIndex, citiesView, cityIndex, areasView, areaIndex, showRegion: true });
    } else {
      this.setData({ showRegion: true });
    }
  },

  closeRegion() {
    this.setData({ showRegion: false });
  },

  noop() {},

  onColTap(e) {
    const { col, idx } = e.currentTarget.dataset;
    const i = Number(idx);
    if (col === 'province') {
      const p = this.data.provinces[i];
      this.setData({
        provinceIndex: i,
        citiesView: ['全部城市', ...(p.cities || []).map((c) => c.name)],
        cityIndex: 0,
        areasView: ['全部区县'],
        areaIndex: 0,
      });
    } else if (col === 'city') {
      const p = this.data.provinces[this.data.provinceIndex];
      this.setData({
        cityIndex: i,
        areasView: i > 0 ? ['全部区县', ...(p.cities[i - 1].areas || [])] : ['全部区县'],
        areaIndex: 0,
      });
    } else {
      this.setData({ areaIndex: i });
    }
  },

  confirmRegion() {
    const p = this.data.provinces[this.data.provinceIndex];
    const provinceName = util.normalizeRegion(p.name);
    let cityName = '';
    let areaName = '';
    if (this.data.cityIndex > 0) {
      cityName = util.normalizeRegion(p.cities[this.data.cityIndex - 1].name);
      if (this.data.areaIndex > 0) areaName = this.data.areasView[this.data.areaIndex];
    }
    const region = { province: provinceName, city: cityName, area: areaName };
    const parts = [(cityName || provinceName), areaName].filter(Boolean);
    this.setData({
      region,
      regionText: parts.join(' · ') || '全部地区',
      showRegion: false,
    });
    this.fetchCourses();
  },

  resetRegion() {
    this.setData({
      region: null,
      regionText: '全部地区',
      provinceIndex: 0,
      citiesView: ['全部城市', ...(util.REGIONS[0] ? util.REGIONS[0].cities.map((c) => c.name) : [])],
      cityIndex: 0,
      areasView: ['全部区县'],
      areaIndex: 0,
      showRegion: false,
    });
    this.fetchCourses();
  },

  onCourseTap(e) {
    wx.navigateTo({ url: `/pages/course-detail/course-detail?id=${e.currentTarget.dataset.id}` });
  },

  onBannerTap(e) {
    const { linkType, linkValue } = e.currentTarget.dataset;
    if (linkType === 'course' && linkValue) {
      wx.navigateTo({ url: `/pages/course-detail/course-detail?id=${linkValue}` });
    }
  },

  // ---------------- 老师工作台 ----------------
  async loadTeacherHome() {
    try {
      const [profile, courses, earnings] = await Promise.all([
        api.get('/api/teacher/profile', {}, { silent: true }),
        api.get('/api/teacher/courses', {}, { silent: true }),
        api.get('/api/teacher/earnings', {}, { silent: true }),
      ]);
      const list = (courses || []).map((c) => ({
        ...c,
        priceText: util.fen2yuan(c.current_unit_price_cents),
        statusInfo: util.courseStatus(c.status),
      }));
      const e2 = earnings || { totalGrossCents: 0, totalNetCents: 0, platformRate: 0.05 };
      this.setData({
        profile,
        teacherCourses: list,
        recentCourses: list.slice(0, 3),
        stats: {
          ...e2,
          grossYuan: (e2.totalGrossCents / 100).toFixed(0),
          netYuan: (e2.totalNetCents / 100).toFixed(0),
          ratePercent: (e2.platformRate * 100).toFixed(0),
        },
      });
    } catch (e) {
      // 未认证时 teacher/courses 会 403，静默处理，profile 已获取
      this.setData({ profile: null, teacherCourses: [] });
    }
  },

  goPublish() {
    wx.navigateTo({ url: '/pages/teacher/course-form' });
  },

  goApply() {
    wx.navigateTo({ url: '/pages/teacher/apply' });
  },

  goMyCourses() {
    wx.navigateTo({ url: '/pages/teacher/my-courses' });
  },

  goEarnings() {
    wx.navigateTo({ url: '/pages/teacher/earnings' });
  },

  goDemandHall() {
    wx.navigateTo({ url: '/pages/teacher/demand-hall' });
  },

  goMyApplications() {
    wx.navigateTo({ url: '/pages/teacher/my-applications' });
  },

  goNotifications() {
    wx.navigateTo({ url: '/pages/notifications/notifications' });
  },
});
