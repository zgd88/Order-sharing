const api = require('../../utils/request');
const util = require('../../utils/util');

Page({
  data: {
    list: [],
    loading: true,
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
      const rows = await api.get('/api/teacher/applications');
      const list = rows.map((a) => ({
        ...a,
        rateText: util.fen2yuan(a.hourlyRateCents),
        statusInfo: this.statusInfo(a),
        timeText: this.timeAgo(a.createdAt),
      }));
      this.setData({ list, loading: false });
    } catch (e) {
      this.setData({ loading: false });
    }
  },
  statusInfo(a) {
    if (a.status === 'pending') {
      if (a.orderStatus === 'locked') return { text: '订单已被接走', cls: 'tag-gray', desc: '该订单已被其他老师拿下' };
      return { text: '待处理', cls: 'tag-orange', desc: '家长还没选，耐心等待' };
    }
    if (a.status === 'selected') return { text: '已选中', cls: 'tag-green', desc: '恭喜！家长已选择您，客服将联系您' };
    if (a.invalidReason === 'order_closed') return { text: '已失效', cls: 'tag-gray', desc: '家长关闭了订单' };
    return { text: '已失效', cls: 'tag-gray', desc: '该订单已被其他老师拿下' };
  },
  timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 3600e3) return `${Math.max(1, Math.floor(diff / 60e3))}分钟前`;
    if (diff < 864e5) return `${Math.floor(diff / 3600e3)}小时前`;
    return `${Math.floor(diff / 864e5)}天前`;
  },
});
