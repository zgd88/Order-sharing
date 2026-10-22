const api = require('../../utils/request');
const util = require('../../utils/util');

Page({
  data: {
    list: [],
    unreadCount: 0,
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
      const data = await api.get('/api/notifications');
      this.setData({
        list: (data.list || []).map((n) => ({
          ...n,
          timeText: util.formatTime(n.createdAt),
          typeIcon: this.typeIcon(n.type),
        })),
        unreadCount: data.unreadCount,
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },
  typeIcon(type) {
    const map = {
      order_locked_by_other: '😔',
      order_closed: '🔕',
      selected: '🎉',
    };
    return map[type] || '📢';
  },
  readAll() {
    api.post('/api/notifications/read-all', {})
      .then(() => {
        wx.showToast({ title: '已全部标记已读', icon: 'success' });
        this.load();
      })
      .catch(() => {});
  },
});
