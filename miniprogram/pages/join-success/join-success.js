const api = require('../../utils/request');
const util = require('../../utils/util');

Page({
  data: {
    courseId: null,
    course: null,
    formed: false,
  },
  onLoad(options) {
    this.setData({ courseId: options.courseId });
  },
  onShow() {
    this.load();
  },
  async load() {
    try {
      const c = await api.get(`/api/courses/${this.data.courseId}`, {}, { auth: false });
      this.setData({
        course: c,
        formed: c.status === 'formed',
        priceText: util.fen2yuan(c.currentPriceCents),
        needToFormText: c.needToForm > 0 ? `再邀 ${c.needToForm} 人即可共学达成` : '共学达成',
      });
    } catch (e) { /* ignore */ }
  },
  goHome() {
    wx.switchTab({ url: '/pages/home/home' });
  },
  goMine() {
    wx.switchTab({ url: '/pages/enrollments/enrollments' });
  },
  goPoster() {
    wx.navigateTo({ url: `/pages/poster/poster?courseId=${this.data.courseId}` });
  },
  onShareAppMessage() {
    const c = this.data.course;
    return {
      title: c ? `【共学课】${c.title}，${c.enrolledCount}人已占座，再邀${c.needToForm}人共学达成！` : '共学课',
      path: `/pages/course-detail/course-detail?id=${this.data.courseId}`,
    };
  },
});
