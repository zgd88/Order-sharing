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
        needToFormText: c.needToForm > 0 ? `再邀 ${c.needToForm} 人即可成团` : '已成团',
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
      title: c ? `【拼好课】${c.title}，${c.enrolledCount}人已参团，再邀${c.needToForm}人成团！` : '拼好课',
      path: `/pages/course-detail/course-detail?id=${this.data.courseId}`,
    };
  },
});
