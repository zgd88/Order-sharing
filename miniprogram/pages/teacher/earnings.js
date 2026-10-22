const api = require('../../utils/request');
const util = require('../../utils/util');

Page({
  data: {
    stats: null,
    courses: [],
    loading: true,
  },
  onShow() {
    this.load();
  },
  async load() {
    try {
      const data = await api.get('/api/teacher/earnings');
      this.setData({
        stats: {
          totalGrossText: util.fen2yuan(data.totalGrossCents),
          totalNetText: util.fen2yuan(data.totalNetCents),
          platformRate: data.platformRate,
          ratePercent: (data.platformRate * 100).toFixed(0),
        },
        courses: (data.courses || []).map((c) => ({
          ...c,
          grossText: util.fen2yuan(c.grossCents),
          netText: util.fen2yuan(c.netCents),
          priceText: util.fen2yuan(c.current_unit_price_cents),
          statusInfo: util.courseStatus(c.status),
        })),
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },
});
