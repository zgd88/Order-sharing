const auth = require('../../utils/auth');

Page({
  data: {
    mode: 'login', // login / register
    phone: '',
    password: '',
    password2: '',
    nickname: '',
    role: 'parent',
    demoRole: '',
    submitting: false,
  },
  onLoad() {
    if (auth.isLoggedIn()) {
      wx.switchTab({ url: '/pages/home/home' });
    }
  },
  onField(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: e.detail.value });
  },
  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },
  selectRole(e) {
    this.setData({ role: e.currentTarget.dataset.role });
  },
  selectDemoRole(e) {
    this.setData({ demoRole: e.currentTarget.dataset.role });
  },
  async doLogin() {
    const { phone, password } = this.data;
    if (!/^1\d{10}$/.test(phone)) return wx.showToast({ title: '请填写正确的手机号', icon: 'none' });
    if (!password) return wx.showToast({ title: '请输入密码', icon: 'none' });
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    wx.showLoading({ title: '登录中...' });
    try {
      await auth.loginByPhone(phone, password);
      wx.hideLoading();
      wx.switchTab({ url: '/pages/home/home' });
    } catch (e) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: (e && e.message) || '登录失败', icon: 'none' });
    }
  },
  async doRegister() {
    const { phone, password, password2, nickname, role } = this.data;
    if (!/^1\d{10}$/.test(phone)) return wx.showToast({ title: '请填写正确的手机号', icon: 'none' });
    if (!password || password.length < 6) return wx.showToast({ title: '密码至少 6 位', icon: 'none' });
    if (password !== password2) return wx.showToast({ title: '两次输入的密码不一致', icon: 'none' });
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    wx.showLoading({ title: '注册中...' });
    try {
      await auth.register(phone, password, role, nickname);
      wx.hideLoading();
      wx.showToast({ title: '注册成功', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 800);
    } catch (e) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: (e && e.message) || '注册失败', icon: 'none' });
    }
  },
  async doDemoLogin() {
    const role = this.data.demoRole;
    if (!role) {
      wx.showToast({ title: '请选择演示身份', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '登录中...' });
    try {
      await auth.login(role, role === 'teacher' ? '演示老师' : '演示家长', '');
      wx.hideLoading();
      wx.switchTab({ url: '/pages/home/home' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '登录失败，请确认后端服务已启动', icon: 'none' });
    }
  },
});
