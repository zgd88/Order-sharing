const api = require('../../utils/request');
const util = require('../../utils/util');

Page({
  data: {
    id: null,
    order: null,
    applied: false,
    loading: true,
    note: '',
    // 认证状态：查看无需认证，投递才需要
    certApproved: false,
    certChecked: false,
    certStatus: null, // pending / rejected / null(未申请)
  },
  onLoad(options) {
    this.setData({ id: options.id });
  },
  onShow() {
    this.load();
    this.checkCert();
  },
  async load() {
    try {
      const o = await api.get(`/api/teacher/demands/${this.data.id}`, {}, { silent: true });
      this.setData({
        order: o,
        applied: o.applied,
        loading: false,
        rateText: util.fen2yuan(o.hourlyRateCents),
      });
    } catch (e) {
      this.setData({ loading: false });
      // 订单已锁定/关闭时接口 404，提示后返回
      if (e.code === 404) {
        wx.showToast({ title: e.message || '该需求已停止招募', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1200);
      }
    }
  },
  async checkCert() {
    try {
      const p = await api.get('/api/teacher/profile', {}, { silent: true });
      this.setData({
        certChecked: true,
        certApproved: !!(p && p.auditStatus === 'approved'),
        certStatus: p ? p.auditStatus : null,
      });
    } catch (e) {
      this.setData({ certChecked: true, certApproved: false, certStatus: null });
    }
  },
  onNote(e) {
    this.setData({ note: e.detail.value });
  },
  apply() {
    if (!this.data.certApproved) {
      const tip = this.data.certStatus === 'pending'
        ? '资质认证审核中，通过后即可投递'
        : this.data.certStatus === 'rejected'
          ? '资质认证被驳回，请重新提交'
          : '投递前需先完成资质认证';
      wx.showModal({
        title: '需要资质认证',
        content: tip,
        confirmText: '去认证',
        cancelText: '取消',
        success: (r) => {
          if (r.confirm) wx.navigateTo({ url: '/pages/teacher/apply' });
        },
      });
      return;
    }
    wx.showModal({
      title: '投递简历',
      content: '投递后家长将看到您的资质与简介。一个订单只能投递一次。',
      confirmText: '确认投递',
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '投递中...' });
        try {
          await api.post(`/api/teacher/demands/${this.data.id}/apply`, { note: this.data.note });
          wx.hideLoading();
          wx.showToast({ title: '投递成功', icon: 'success' });
          this.load();
        } catch (err) {
          wx.hideLoading();
          this.load();
        }
      },
    });
  },
});
