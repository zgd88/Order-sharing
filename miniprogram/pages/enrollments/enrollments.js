const api = require('../../utils/request');
const auth = require('../../utils/auth');
const util = require('../../utils/util');

Page({
  data: {
    isTeacher: false,
    // 家长：分段
    segment: 'enroll', // enroll=拼团课 demands=我的需求
    // 家长：拼团参团
    enrollments: [],
    // 家长：我的需求
    demands: [],
    // 老师
    teacherCourses: [],
    loading: false,
    loaded: false,
  },
  onShow() {
    if (!auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const isTeacher = auth.isTeacher();
    this.setData({ isTeacher });
    if (isTeacher) this.loadTeacherCourses();
    else if (this.data.segment === 'enroll') this.loadEnrollments();
    else this.loadDemands();
  },
  async onPullDownRefresh() {
    if (this.data.isTeacher) await this.loadTeacherCourses();
    else if (this.data.segment === 'enroll') await this.loadEnrollments();
    else await this.loadDemands();
    wx.stopPullDownRefresh();
  },
  onSegment(e) {
    const segment = e.currentTarget.dataset.segment;
    this.setData({ segment });
    if (segment === 'enroll') this.loadEnrollments();
    else this.loadDemands();
  },
  async loadEnrollments() {
    this.setData({ loading: true });
    try {
      const rows = await api.get('/api/enrollments/mine');
      const list = rows.map((m) => ({
        ...m,
        priceText: util.fen2yuan(m.currentPriceCents),
        paidText: util.fen2yuan(m.priceAtJoinCents),
        courseStatusInfo: util.courseStatus(m.course.status),
        statusInfo: this.enrollStatusInfo(m),
        startText: util.formatTime(m.course.startTime),
        refundTotalCents: (m.refunds || []).reduce((s, r) => s + (r.status === 'paid' ? r.amount_cents : 0), 0),
        refundTotalText: util.fen2yuan((m.refunds || []).reduce((s, r) => s + (r.status === 'paid' ? r.amount_cents : 0), 0)),
        refundsView: (m.refunds || []).map((r) => ({
          id: r.id,
          typeText: r.type === 'tier_diff' ? '阶梯降价退差' : r.type === 'flow_refund' ? '流局退款' : '课程取消退款',
          amountText: util.fen2yuan(r.amount_cents),
          statusText: r.status === 'paid' ? '已退' : r.status === 'void' ? '已作废' : '待退',
          timeText: util.formatTime(r.created_at),
        })),
      }));
      this.setData({ enrollments: list, loaded: true });
    } catch (e) { /* ignore */ }
    this.setData({ loading: false });
  },
  enrollStatusInfo(m) {
    if (m.status === 'expired') {
      const map = { flow: '已流局退款', teacher_cancel: '老师取消已退款', admin_cancel: '平台取消已退款' };
      return { text: map[m.expiredReason] || '已失效', color: 'gray' };
    }
    return { text: '参团中', color: 'green' };
  },
  async loadDemands() {
    this.setData({ loading: true });
    try {
      const rows = await api.get('/api/demands/mine');
      const statusMap = {
        recruiting: { text: '招募中', cls: 'tag-orange' },
        locked: { text: '已锁定', cls: 'tag-green' },
        closed: { text: '已关闭', cls: 'tag-gray' },
      };
      const list = rows.map((o) => ({
        ...o,
        rateText: util.fen2yuan(o.hourlyRateCents),
        statusInfo: statusMap[o.status] || { text: o.status, cls: 'tag-gray' },
      }));
      this.setData({ demands: list, loaded: true });
    } catch (e) { /* ignore */ }
    this.setData({ loading: false });
  },
  async loadTeacherCourses() {
    this.setData({ loading: true });
    try {
      const rows = await api.get('/api/teacher/courses');
      const list = rows.map((c) => ({
        ...c,
        priceText: util.fen2yuan(c.current_unit_price_cents),
        statusInfo: util.courseStatus(c.status),
        startText: util.formatTime(c.start_time),
      }));
      this.setData({ teacherCourses: list, loaded: true });
    } catch (e) { /* ignore */ }
    this.setData({ loading: false });
  },
  onEnrollTap(e) {
    wx.navigateTo({ url: `/pages/course-detail/course-detail?id=${e.currentTarget.dataset.id}` });
  },
  onDemandTap(e) {
    wx.navigateTo({ url: `/pages/demand-detail/demand-detail?id=${e.currentTarget.dataset.id}` });
  },
  onTeacherCourseTap(e) {
    wx.navigateTo({ url: `/pages/teacher/course-members?id=${e.currentTarget.dataset.id}` });
  },
  goPublish() {
    wx.navigateTo({ url: '/pages/teacher/course-form' });
  },
  goDemandForm() {
    wx.navigateTo({ url: '/pages/demand-form/demand-form' });
  },
});
