const api = require('../../utils/request');

Page({
  data: {
    loading: true,
    teacher: null,
  },
  onLoad(options) {
    this.setData({ demandId: options.demandId, appId: options.appId });
  },
  onShow() {
    this.load();
  },
  async load() {
    const { demandId, appId } = this.data;
    if (!demandId || !appId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    try {
      const o = await api.get(`/api/demands/${demandId}`, {}, { silent: true });
      const app = (o.applications || []).find((a) => String(a.id) === String(appId));
      if (!app) {
        wx.showToast({ title: '该投递不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      const r = app.resume || {};
      this.setData({
        loading: false,
        demandSubject: o.subject,
        demandGrade: o.grade,
        teacher: {
          avatarUrl: app.avatarUrl,
          name: r.name || app.realName || app.nickname,
          gender: r.gender || '',
          identityTag: r.identityTag || '',
          years: r.yearsExperience != null ? r.yearsExperience : app.yearsExperience,
          education: app.education || '',
          major: app.major || '',
          graduateSchool: app.graduateSchool || '',
          subjects: r.subjects || app.teacherSubject || '',
          grades: r.grades || app.teachableGrades || '',
          address: r.address || '',
          intro: r.intro || app.teacherIntro || '',
          note: app.note || '',
          status: app.status,
        },
      });
    } catch (e) {
      this.setData({ loading: false });
      if (e.code === 403) {
        wx.showToast({ title: '无权查看', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
      }
    }
  },
});
