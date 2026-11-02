const api = require('../../utils/request');
const util = require('../../utils/util');

Page({
  data: {
    list: [],
    loading: true,
  },
  onShow() {
    this.load();
  },
  async load() {
    try {
      const rows = await api.get('/api/teacher/courses');
      this.setData({
        list: rows.map((c) => ({
          ...c,
          priceText: util.fen2yuan(c.current_unit_price_cents),
          statusInfo: util.courseStatus(c.status),
          startText: util.formatTime(c.start_time),
        })),
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },
  onCourseTap(e) {
    wx.navigateTo({ url: `/pages/teacher/course-members?id=${e.currentTarget.dataset.id}` });
  },
  goPublish() {
    wx.navigateTo({ url: '/pages/teacher/course-form' });
  },
});
