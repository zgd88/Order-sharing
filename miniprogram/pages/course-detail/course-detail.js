const api = require('../../utils/request');
const auth = require('../../utils/auth');
const util = require('../../utils/util');

Page({
  data: {
    id: null,
    course: null,
    tiersView: [],
    loading: true,
    canJoin: false,
    isTeacher: false,
    statusText: '',
    needToFormText: '',
    joined: false,
  },
  onLoad(options) {
    this.setData({ id: options.id });
    this.setData({ isTeacher: auth.isTeacher() });
  },
  onShow() {
    this.load();
  },
  async load() {
    this.setData({ loading: true });
    try {
      const c = await api.get(`/api/courses/${this.data.id}`, {}, { auth: false });
      const tiersView = (c.tiers || []).map((t) => ({
        minPeople: t.min_people,
        priceText: util.fen2yuan(t.price_cents),
        active: !!t.active,
        isCurrent: !!t.active && (!c.tiers.some((x) => x.min_people > t.min_people && x.active)),
      }));
      const statusInfo = util.courseStatus(c.status);
      let joined = false;
      if (auth.isLoggedIn()) {
        try {
          const mine = await api.get('/api/enrollments/mine', {}, { silent: true });
          joined = (mine || []).some((m) => m.course.id === c.id && m.status === 'joined');
        } catch (e) { /* ignore */ }
      }
      this.setData({
        course: c,
        tiersView,
        loading: false,
        joined,
        statusText: statusInfo.text,
        needToFormText: c.needToForm > 0 ? `还差 ${c.needToForm} 人共学达成` : '已达共学达成人数',
        canJoin: ['recruiting', 'formed'].includes(c.status) && !joined,
        startText: util.formatTime(c.startTime),
        endText: util.formatTime(c.endTime),
        deadlineText: util.formatTime(c.deadlineAt),
        currentPriceText: util.fen2yuan(c.currentPriceCents),
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },
  async onJoin() {
    if (!auth.isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    if (this.data.isTeacher) {
      wx.showToast({ title: '请用家长身份占座', icon: 'none' });
      return;
    }
    const c = this.data.course;
    wx.showModal({
      title: '确认占座',
      content: `当前 ${c.enrolledCount} 人占座，你将按 ¥${util.fen2yuan(this.currentPrice())}/节 占座。人数增加后降价，差价自动退还。`,
      confirmText: '占座',
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '占座中...' });
        try {
          await api.post(`/api/courses/${c.id}/join`, {});
          wx.hideLoading();
          wx.redirectTo({ url: `/pages/join-success/join-success?courseId=${c.id}` });
        } catch (e) {
          wx.hideLoading();
          this.load();
        }
      },
    });
  },
  currentPrice() {
    const c = this.data.course;
    if (!c) return 0;
    return c.currentPriceCents;
  },
  onShare() {
    wx.navigateTo({ url: `/pages/poster/poster?courseId=${this.data.id}` });
  },
  onShareAppMessage() {
    const c = this.data.course;
    return {
      title: c ? `【共学课】${c.title}，当前${c.enrolledCount}人占座，越学越省！` : '共学课',
      path: `/pages/course-detail/course-detail?id=${this.data.id}`,
    };
  },
});
