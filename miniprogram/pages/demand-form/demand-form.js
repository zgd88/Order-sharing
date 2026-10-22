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
      subject: '数学',
      grade: '',
      hourlyRate: '',
      phone: '',
      province: '',
      city: '',
      address: '',
    },
    lat: null,
    lng: null,
    submitting: false,
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
    if (!f.phone) return wx.showToast({ title: '请填写联系电话', icon: 'none' });
    if (!/^1\d{10}$/.test(f.phone)) return wx.showToast({ title: '请填写正确的手机号', icon: 'none' });
    if (!f.hourlyRate || Number(f.hourlyRate) <= 0) return wx.showToast({ title: '请填写课时费', icon: 'none' });
    if (!f.province || !f.city || !f.address) return wx.showToast({ title: '请选择上课地点', icon: 'none' });
    this.setData({ submitting: true });
    wx.showLoading({ title: '发布中...' });
    try {
      await api.post('/api/demands', {
        subject: f.subject,
        grade: f.grade,
        hourlyRateCents: Math.round(Number(f.hourlyRate) * 100),
        phone: f.phone,
        province: f.province,
        city: f.city,
        address: f.address,
        lat: this.data.lat,
        lng: this.data.lng,
      });
      wx.hideLoading();
      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1200);
    } catch (e) {
      wx.hideLoading();
      this.setData({ submitting: false });
    }
  },
});
