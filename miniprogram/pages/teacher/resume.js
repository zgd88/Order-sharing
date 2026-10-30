const api = require('../../utils/request');
const loc = require('../../utils/location');

const SUBJECT_OPTIONS = ['数学', '语文', '英语', '物理', '化学', '生物', '政治', '历史', '地理', '编程', '美术', '音乐', '书法', '舞蹈', '其他'];
const GRADE_OPTIONS = ['幼儿园', '小学一年级', '小学二年级', '小学三年级', '小学四年级', '小学五年级', '小学六年级', '初一', '初二', '初三', '高一', '高二', '高三', '成人', '其他'];

Page({
  data: {
    loading: true,
    resume: null,
    profile: null, // 教学资质（只读展示）
    form: {
      name: '',
      gender: '',
      address: '',
      subjects: [],
      grades: [],
      contact: '',
      yearsExperience: '',
      identityTag: '',
      intro: '',
    },
    genders: ['男', '女'],
    genderIndex: -1,
    tags: ['专职', '大学生'],
    tagIndex: -1,
    subjectText: '',
    gradesText: '',
    // 多选弹层
    pickerOpen: false,
    pickerOptions: [],
    saving: false,
  },
  onLoad() {
    this.load();
  },
  async load() {
    try {
      const [resume, profile] = await Promise.all([
        api.get('/api/teacher/resume', {}, { silent: true }).catch(() => null),
        api.get('/api/teacher/profile', {}, { silent: true }).catch(() => null),
      ]);
      const form = {
        name: '',
        gender: '',
        address: '',
        subjects: [],
        grades: [],
        contact: '',
        yearsExperience: '',
        identityTag: '',
        intro: '',
      };
      if (resume) {
        form.name = resume.name || '';
        form.gender = resume.gender || '';
        form.address = resume.address || '';
        form.subjects = resume.subjects ? resume.subjects.split(',') : [];
        form.grades = resume.grades ? resume.grades.split(',') : [];
        form.contact = resume.contact || '';
        form.yearsExperience = resume.yearsExperience ? String(resume.yearsExperience) : '';
        form.identityTag = resume.identityTag || '';
        form.intro = resume.intro || '';
      } else if (profile) {
        // 首次进入：用认证资料预填
        form.name = profile.realName || '';
        form.subjects = profile.subject ? profile.subject.split(',') : [];
        form.grades = profile.teachableGrades ? profile.teachableGrades.split(',') : [];
        form.yearsExperience = profile.yearsExperience ? String(profile.yearsExperience) : '';
        form.contact = profile.phone || '';
      }
      this.setData({
        resume,
        profile,
        form,
        loading: false,
        genderIndex: form.gender ? this.data.genders.indexOf(form.gender) : -1,
        tagIndex: form.identityTag ? this.data.tags.indexOf(form.identityTag) : -1,
        subjectText: form.subjects.join('、'),
        gradesText: form.grades.join('、'),
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },
  onField(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: e.detail.value });
  },
  onGender(e) {
    const idx = Number(e.detail.value);
    this.setData({ genderIndex: idx, 'form.gender': this.data.genders[idx] });
  },
  onTag(e) {
    const idx = Number(e.detail.value);
    this.setData({ tagIndex: idx, 'form.identityTag': this.data.tags[idx] });
  },
  chooseAddress() {
    loc.openLocationPicker((res) => {
      if (res && res.address) this.setData({ 'form.address': res.address });
    });
  },
  onShow() {
    const v = loc.consumePickedLocation();
    if (v && v.address) this.setData({ 'form.address': v.address });
  },
  // ---- 多选弹层（复用认证页模式） ----
  openPicker(e) {
    const key = e.currentTarget.dataset.key;
    const options = key === 'subject' ? SUBJECT_OPTIONS : GRADE_OPTIONS;
    const selected = key === 'subject' ? this.data.form.subjects : this.data.form.grades;
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
      this.setData({ 'form.subjects': selected, subjectText: selected.join('、'), pickerOpen: false });
    } else {
      this.setData({ 'form.grades': selected, gradesText: selected.join('、'), pickerOpen: false });
    }
  },
  // ---- 保存 ----
  async save() {
    const f = this.data.form;
    if (!f.name) return wx.showToast({ title: '请填写姓名', icon: 'none' });
    if (this.data.saving) return;
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...' });
    try {
      await api.put('/api/teacher/resume', {
        ...f,
        yearsExperience: Number(f.yearsExperience) || 0,
      });
      wx.hideLoading();
      wx.showToast({ title: '简历已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (e) {
      wx.hideLoading();
      this.setData({ saving: false });
    }
  },
  goCert() {
    wx.navigateTo({ url: '/pages/teacher/apply' });
  },
});
