const api = require('../../utils/request');
const util = require('../../utils/util');

Page({
  data: {
    id: null,
    course: null,
    members: [],
    loading: true,
    tiersView: [],
  },
  onLoad(options) {
    this.setData({ id: options.id });
  },
  onShow() {
    this.load();
  },
  async load() {
    try {
      const c = await api.get(`/api/teacher/courses/${this.data.id}`);
      const members = (c.members || []).map((m) => ({
        ...m,
        priceText: util.fen2yuan(m.current_price_cents),
      }));
      this.setData({
        course: c,
        members,
        loading: false,
        statusInfo: util.courseStatus(c.status),
        priceText: util.fen2yuan(c.current_unit_price_cents),
        tiersView: (c.tiers || []).map((t) => `满${t.min_people}人 ¥${util.fen2yuan(t.price_cents)}`).join(' · '),
        grossText: util.fen2yuan(members.reduce((s, m) => s + m.current_price_cents, 0)),
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },
  onCancel() {
    wx.showModal({
      title: '取消课程',
      content: '取消后家长将收到全额退款（模拟），且不可恢复。确定取消吗？',
      confirmText: '取消课程',
      confirmColor: '#F5222D',
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          await api.post(`/api/teacher/courses/${this.data.id}/cancel`, {});
          wx.hideLoading();
          wx.showToast({ title: '已取消', icon: 'success' });
          this.load();
        } catch (e) {
          wx.hideLoading();
        }
      },
    });
  },
  onShareAppMessage() {
    const c = this.data.course;
    return {
      title: c ? `【拼好课】${c.title}，${c.enrolled_count}人已参团！` : '拼好课',
      path: `/pages/course-detail/course-detail?id=${this.data.id}`,
    };
  },
});
