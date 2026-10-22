const api = require('../../utils/request');
const util = require('../../utils/util');

Page({
  data: {
    list: [],
    loading: true,
    subjects: util.SUBJECTS,
    subjectIndex: 0,
  },
  onShow() {
    this.load();
  },
  async onPullDownRefresh() {
    await this.load();
    wx.stopPullDownRefresh();
  },
  async load() {
    this.setData({ loading: true });
    try {
      const rows = await api.get('/api/teacher/demands');
      let list = rows.map((o) => ({
        ...o,
        rateText: util.fen2yuan(o.hourlyRateCents),
        timeText: this.timeAgo(o.createdAt),
      }));
      const subject = this.data.subjects[this.data.subjectIndex];
      if (subject !== '全部') list = list.filter((o) => o.subject === subject);
      this.setData({ list, loading: false });
    } catch (e) {
      this.setData({ loading: false });
    }
  },
  timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 3600e3) return `${Math.max(1, Math.floor(diff / 60e3))}分钟前`;
    if (diff < 864e5) return `${Math.floor(diff / 3600e3)}小时前`;
    return `${Math.floor(diff / 864e5)}天前`;
  },
  onSubject(e) {
    this.setData({ subjectIndex: Number(e.detail.value) });
    this.load();
  },
  onDemandTap(e) {
    wx.navigateTo({ url: `/pages/teacher/demand-detail?id=${e.currentTarget.dataset.id}` });
  },
});
