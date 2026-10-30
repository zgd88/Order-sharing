const api = require('../../utils/request');
const auth = require('../../utils/auth');

Page({
  data: {
    user: null,
    isTeacher: false,
    profile: null,
    roleText: '',
  },
  onShow() {
    if (!auth.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const user = auth.getUser();
    const isTeacher = auth.isTeacher();
    this.setData({ user, isTeacher, roleText: isTeacher ? '老师' : '家长' });
    if (isTeacher) {
      api.get('/api/teacher/profile', {}, { silent: true })
        .then((p) => this.setData({ profile: p }))
        .catch(() => this.setData({ profile: null }));
    }
  },
  onEditNickname() {
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '请输入昵称',
      content: this.data.user ? this.data.user.nickname : '',
      success: async (r) => {
        if (!r.confirm || !r.content) return;
        try {
          await auth.login(this.data.isTeacher ? 'teacher' : 'parent', r.content);
          wx.showToast({ title: '已修改', icon: 'success' });
          this.onShow();
        } catch (e) {
          wx.showToast({ title: '修改失败', icon: 'none' });
        }
      },
    });
  },
  async switchRole() {
    const target = this.data.isTeacher ? 'parent' : 'teacher';
    const name = target === 'teacher' ? '老师' : '家长';
    wx.showModal({
      title: '切换身份',
      content: `切换到${name}身份？`,
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await auth.switchRole(target);
          wx.showToast({ title: `已切换为${name}`, icon: 'success' });
          setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 600);
        } catch (e) {
          wx.showToast({ title: '切换失败', icon: 'none' });
        }
      },
    });
  },
  goApply() {
    wx.navigateTo({ url: '/pages/teacher/apply' });
  },
  goEarnings() {
    wx.navigateTo({ url: '/pages/teacher/earnings' });
  },
  goResume() {
    wx.navigateTo({ url: '/pages/teacher/resume' });
  },
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前身份？',
      success: (r) => {
        if (r.confirm) {
          auth.logout();
          wx.reLaunch({ url: '/pages/login/login' });
        }
      },
    });
  },
});
