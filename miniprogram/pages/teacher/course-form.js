const api = require('../../utils/request');
const util = require('../../utils/util');
const loc = require('../../utils/location');

Page({
  data: {
    subjects: util.SUBJECTS.filter((s) => s !== '全部'),
    grades: util.GRADES,
    subjectIndex: 0,
    gradeIndex: 0,
    form: {
      title: '',
      subject: '数学',
      grade: '',
      coverUrl: '',
      outline: '',
      province: '',
      city: '',
      address: '',
    },
    // 阶梯档位：第一档固定为满1人
    tiers: [
      { min_people: 1, price_cents: '' },
      { min_people: 3, price_cents: '' },
      { min_people: 5, price_cents: '' },
    ],
    maxStudents: 8,
    minStudents: 3,
    startTime: '',
    endTime: '',
    deadlineAt: '',
    startDate: '',
    endDate: '',
    deadlineDate: '',
    submitting: false,
  },
  onLoad() {
    // 默认时间：3天后开课
    const now = Date.now();
    const start = now + 3 * 864e5;
    const end = start + 2 * 3600e3;
    const deadline = start - 2 * 864e5;
    this.setData({
      startTime: util.formatDate(start),
      endTime: util.formatDate(end),
      deadlineAt: util.formatDate(deadline),
      startDate: util.formatDate(start).slice(0, 10),
      endDate: util.formatDate(end).slice(0, 10),
      deadlineDate: util.formatDate(deadline).slice(0, 10),
    });
  },
  onField(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: e.detail.value });
  },
  onSubject(e) {
    const idx = Number(e.detail.value);
    this.setData({ subjectIndex: idx, 'form.subject': this.data.subjects[idx] });
  },
  onGrade(e) {
    const idx = Number(e.detail.value);
    this.setData({ gradeIndex: idx, 'form.grade': this.data.grades[idx] });
  },
  onTime(e) {
    const key = e.currentTarget.dataset.key;
    const dateKey = { startTime: 'startDate', endTime: 'endDate', deadlineAt: 'deadlineDate' }[key];
    this.setData({ [key]: e.detail.value, [dateKey]: e.detail.value });
  },
  chooseCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: async (r) => {
        wx.showLoading({ title: '上传中...' });
        try {
          const url = await api.upload(r.tempFiles[0].tempFilePath);
          this.setData({ 'form.coverUrl': url });
          wx.hideLoading();
        } catch (err) {
          wx.hideLoading();
        }
      },
    });
  },
  // ---- 阶梯定价设置器 ----
  addTier() {
    if (this.data.tiers.length >= 5) {
      wx.showToast({ title: '最多 5 个档位', icon: 'none' });
      return;
    }
    const last = this.data.tiers[this.data.tiers.length - 1];
    this.setData({
      tiers: [...this.data.tiers, { min_people: last.min_people + 2, price_cents: '' }],
    });
  },
  removeTier(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    if (idx === 0) return; // 第一档不可删
    const tiers = this.data.tiers.filter((_, i) => i !== idx);
    this.setData({ tiers });
  },
  onTierCount(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    this.setData({ [`tiers[${idx}].min_people`]: Number(e.detail.value) || '' });
  },
  onTierPrice(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    this.setData({ [`tiers[${idx}].price_cents`]: e.detail.value });
  },
  onMinStudents(e) {
    this.setData({ minStudents: Number(e.detail.value) || '' });
  },
  onMaxStudents(e) {
    this.setData({ maxStudents: Number(e.detail.value) || '' });
  },
  chooseLocation() {
    loc.openLocationPicker((res) => this.applyLocation(res));
  },
  applyLocation(res) {
    if (!res) return;
    this.setData({
      'form.province': res.province || '',
      'form.city': res.city || '',
      'form.address': res.address || '',
      lat: res.latitude,
      lng: res.longitude,
    });
  },
  onShow() {
    // 兜底：事件通道不可用时从 storage 消费
    const v = loc.consumePickedLocation();
    if (v) this.applyLocation(v);
  },
  async submit() {
    const f = this.data.form;
    if (this.data.submitting) return;
    if (!f.title) return wx.showToast({ title: '请填写课程标题', icon: 'none' });
    if (!f.province || !f.city || !f.address) return wx.showToast({ title: '请选择课程地点', icon: 'none' });
    if (!f.outline) return wx.showToast({ title: '请填写课程大纲', icon: 'none' });
    if (!this.data.startTime || !this.data.endTime || !this.data.deadlineAt) {
      return wx.showToast({ title: '请选择课程时间', icon: 'none' });
    }
    const tiers = this.data.tiers
      .filter((t) => t.min_people && t.price_cents)
      .map((t) => ({ min_people: Number(t.min_people), price_cents: Math.round(Number(t.price_cents) * 100) }));
    if (!tiers.length) return wx.showToast({ title: '请至少填写第一档价格', icon: 'none' });

    const payload = {
      ...f,
      tiers,
      minStudents: Number(this.data.minStudents),
      maxStudents: Number(this.data.maxStudents),
      startTime: new Date(this.data.startTime.replace(/-/g, '/')).getTime(),
      endTime: new Date(this.data.endTime.replace(/-/g, '/')).getTime(),
      deadlineAt: new Date(this.data.deadlineAt.replace(/-/g, '/')).getTime(),
      lat: this.data.lat,
      lng: this.data.lng,
    };
    this.setData({ submitting: true });
    wx.showLoading({ title: '发布中...' });
    try {
      await api.post('/api/courses', payload);
      wx.hideLoading();
      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1200);
    } catch (e) {
      wx.hideLoading();
      this.setData({ submitting: false });
    }
  },
});
