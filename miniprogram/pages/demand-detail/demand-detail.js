const api = require('../../utils/request');
const util = require('../../utils/util');

Page({
  data: {
    id: null,
    order: null,
    applications: [],
    loading: true,
    statusText: '',
    statusTagClass: '',
  },
  onLoad(options) {
    this.setData({ id: options.id });
  },
  onShow() {
    this.load();
  },
  async load() {
    try {
      const o = await api.get(`/api/demands/${this.data.id}`);
      const statusMap = {
        recruiting: { text: '招募中', cls: 'tag-orange' },
        locked: { text: '已锁定', cls: 'tag-green' },
        closed: { text: '已关闭', cls: 'tag-gray' },
      };
      const st = statusMap[o.status] || { text: o.status, cls: 'tag-gray' };
      // 简历字段预处理（老师未写简历时回退到认证资料）
      const applications = (o.applications || []).map((a) => {
        const r = a.resume || {};
        return {
          ...a,
          showName: r.name || a.realName || a.nickname,
          showYears: r.yearsExperience != null ? r.yearsExperience : a.yearsExperience,
          showGender: r.gender || '',
          showTag: r.identityTag || '',
          showAddress: r.address || '',
          showSubjects: r.subjects || a.teacherSubject || '',
          showGrades: r.grades || '',
          showIntro: r.intro || a.teacherIntro || '',
        };
      });
      this.setData({
        order: o,
        applications,
        loading: false,
        statusText: st.text,
        statusTagClass: st.cls,
        rateText: util.fen2yuan(o.hourlyRateCents),
        lockedTeacher: applications.find((a) => a.id === o.selectedApplicationId) || null,
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },
  onSelectTeacher(e) {
    const app = e.currentTarget.dataset.app;
    wx.showModal({
      title: '确定选择该老师吗？',
      content: `确定后订单将锁定并交由平台客服对接。\n\n老师：${app.nickname}（${app.yearsExperience}年教龄）`,
      confirmText: '确定选择',
      cancelText: '再想想',
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '锁定中...' });
        try {
          await api.post(`/api/demands/${this.data.id}/select`, { applicationId: app.id });
          wx.hideLoading();
          wx.showToast({ title: '订单已锁定', icon: 'success' });
          this.load();
        } catch (err) {
          wx.hideLoading();
          this.load();
        }
      },
    });
  },
  onClose() {
    wx.showModal({
      title: '关闭需求',
      content: '关闭后老师将无法继续投递，已投递的老师会收到通知。确定关闭吗？',
      confirmText: '关闭需求',
      confirmColor: '#F5222D',
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          await api.post(`/api/demands/${this.data.id}/close`, {});
          wx.hideLoading();
          wx.showToast({ title: '已关闭', icon: 'success' });
          this.load();
        } catch (err) {
          wx.hideLoading();
          this.load();
        }
      },
    });
  },
});
