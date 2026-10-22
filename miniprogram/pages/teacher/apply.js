const api = require('../../utils/request');

const SUBJECT_OPTIONS = ['数学', '语文', '英语', '物理', '化学', '生物', '政治', '历史', '地理', '编程', '美术', '音乐', '书法', '舞蹈', '其他'];
const GRADE_OPTIONS = ['幼儿园', '小学一年级', '小学二年级', '小学三年级', '小学四年级', '小学五年级', '小学六年级', '初一', '初二', '初三', '高一', '高二', '高三', '成人', '其他'];

Page({
  data: {
    loading: true,
    profile: null,
    form: {
      realName: '',
      phone: '',
      certType: 'teacher_certificate',
      subject: [],            // 多选
      education: '本科',
      major: '',
      graduateSchool: '',
      teachableGrades: [],    // 多选
      intro: '',
      yearsExperience: '',
      certImageUrl: '',
      degreeImageUrl: '',
    },
    certTypes: [
      { value: 'teacher_certificate', label: '教师资格证' },
      { value: 'degree', label: '学历证书' },
    ],
    certTypeIndex: 0,
    educations: ['大专', '本科', '硕士', '博士', '其他'],
    educationIndex: 1,
    // 多选弹层
    pickerOpen: false,       // 哪个多选框：subject / grades
    pickerOptions: [],       // [{name, checked}]
    subjectText: '',
    gradesText: '',
  },
  onLoad() {
    this.load();
  },
  async load() {
    try {
      const p = await api.get('/api/teacher/profile', {}, { silent: true });
      this.setData({ profile: p, loading: false });
      if (p && (p.auditStatus === 'rejected' || !p.auditStatus)) {
        const eduIdx = this.data.educations.findIndex((e) => e === p.education);
        const subject = p.subject ? p.subject.split(',') : [];
        const teachableGrades = p.teachableGrades ? p.teachableGrades.split(',') : [];
        this.setData({
          form: {
            realName: p.realName || '',
            phone: p.phone || '',
            certType: p.certType || 'teacher_certificate',
            subject,
            education: p.education || '本科',
            major: p.major || '',
            graduateSchool: p.graduateSchool || '',
            teachableGrades,
            intro: p.intro || '',
            yearsExperience: p.yearsExperience ? String(p.yearsExperience) : '',
            certImageUrl: p.certImageUrl || '',
            degreeImageUrl: p.degreeImageUrl || '',
          },
          certTypeIndex: this.data.certTypes.findIndex((t) => t.value === (p.certType || 'teacher_certificate')),
          educationIndex: eduIdx >= 0 ? eduIdx : 1,
          subjectText: subject.join('、') || '',
          gradesText: teachableGrades.join('、') || '',
        });
      }
    } catch (e) {
      this.setData({ loading: false });
    }
  },
  onField(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: e.detail.value });
  },
  onCertType(e) {
    const idx = Number(e.detail.value);
    this.setData({ certTypeIndex: idx, 'form.certType': this.data.certTypes[idx].value });
  },
  onEducation(e) {
    const idx = Number(e.detail.value);
    this.setData({ educationIndex: idx, 'form.education': this.data.educations[idx] });
  },
  // ---- 多选弹层 ----
  openPicker(e) {
    const key = e.currentTarget.dataset.key; // subject / grades
    const options = key === 'subject' ? SUBJECT_OPTIONS : GRADE_OPTIONS;
    const selected = key === 'subject' ? this.data.form.subject : this.data.form.teachableGrades;
    // 预计算勾选状态（WXML 不支持 indexOf 等方法调用）
    const pickerOptions = options.map((name) => ({ name, checked: selected.indexOf(name) >= 0 }));
    this.setData({ pickerOpen: key, pickerOptions });
  },
  closePicker() {
    this.setData({ pickerOpen: false });
  },
  noop() {},
  toggleOption(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    this.setData({ [`pickerOptions[${idx}].checked`]: !this.data.pickerOptions[idx].checked });
  },
  confirmPicker() {
    const key = this.data.pickerOpen;
    const selected = this.data.pickerOptions.filter((o) => o.checked).map((o) => o.name);
    if (key === 'subject') {
      this.setData({
        'form.subject': selected,
        subjectText: selected.join('、'),
        pickerOpen: false,
      });
    } else if (key === 'grades') {
      this.setData({
        'form.teachableGrades': selected,
        gradesText: selected.join('、'),
        pickerOpen: false,
      });
    }
  },
  chooseImage(e) {
    const key = e.currentTarget.dataset.key;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: async (r) => {
        wx.showLoading({ title: '上传中...' });
        try {
          const url = await api.upload(r.tempFiles[0].tempFilePath);
          this.setData({ [`form.${key}`]: url });
          wx.hideLoading();
        } catch (err) {
          wx.hideLoading();
        }
      },
    });
  },
  async submit() {
    const f = this.data.form;
    if (!f.realName) return wx.showToast({ title: '请填写真实姓名', icon: 'none' });
    if (!f.phone) return wx.showToast({ title: '请填写联系电话', icon: 'none' });
    if (!/^1\d{10}$/.test(f.phone)) return wx.showToast({ title: '请填写正确的手机号', icon: 'none' });
    if (!f.subject.length) return wx.showToast({ title: '请选择授课科目', icon: 'none' });
    wx.showLoading({ title: '提交中...' });
    try {
      await api.post('/api/teacher/profile', { ...f, yearsExperience: Number(f.yearsExperience) || 0 });
      wx.hideLoading();
      wx.showToast({ title: '已提交审核', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1200);
    } catch (e) {
      wx.hideLoading();
    }
  },
});
