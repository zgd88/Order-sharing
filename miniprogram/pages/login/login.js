const auth = require('../../utils/auth');

Page({
  data: {
    role: '',
  },
  onLoad() {
    if (auth.isLoggedIn()) {
      wx.switchTab({ url: '/pages/home/home' });
    }
  },
  selectRole(e) {
    this.setData({ role: e.currentTarget.dataset.role });
  },
  async doLogin() {
    const role = this.data.role;
    if (!role) {
      wx.showToast({ title: '请选择身份', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '登录中...' });
    try {
      await auth.login(role, role === 'teacher' ? '老师用户' : '家长用户', '');
      wx.hideLoading();
      wx.switchTab({ url: '/pages/home/home' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '登录失败，请确认后端服务已启动', icon: 'none' });
    }
  },
});
