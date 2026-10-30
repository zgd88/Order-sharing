const api = require('../../utils/request');
const auth = require('../../utils/auth');

Page({
  data: {
    oldPassword: '',
    newPassword: '',
    newPassword2: '',
    submitting: false,
  },
  onField(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: e.detail.value });
  },
  async submit() {
    const { oldPassword, newPassword, newPassword2 } = this.data;
    if (!oldPassword) return wx.showToast({ title: '请输入原密码', icon: 'none' });
    if (!newPassword || newPassword.length < 6) return wx.showToast({ title: '新密码至少 6 位', icon: 'none' });
    if (newPassword !== newPassword2) return wx.showToast({ title: '两次输入的新密码不一致', icon: 'none' });
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...' });
    try {
      await api.post('/api/auth/change-password', { oldPassword, newPassword });
      wx.hideLoading();
      wx.showToast({ title: '密码修改成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (e) {
      wx.hideLoading();
      this.setData({ submitting: false });
    }
  },
});
