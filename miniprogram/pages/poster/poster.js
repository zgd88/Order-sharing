const api = require('../../utils/request');
const util = require('../../utils/util');

Page({
  data: {
    courseId: null,
    course: null,
    posterPath: '',
  },
  onLoad(options) {
    this.setData({ courseId: options.courseId });
    this.load();
  },
  async load() {
    try {
      const c = await api.get(`/api/courses/${this.data.courseId}`, {}, { auth: false });
      this.setData({ course: c }, () => this.drawPoster(c));
    } catch (e) {
      wx.showToast({ title: '课程加载失败', icon: 'none' });
    }
  },
  drawPoster(c) {
    const query = wx.createSelectorQuery();
    query.select('#posterCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0]) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio;
      const W = 600;
      const H = 960;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);

      // 背景
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#4A90E2');
      grad.addColorStop(1, '#6FA8E8');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // 白色卡片
      ctx.fillStyle = '#ffffff';
      this.roundRect(ctx, 40, 40, W - 80, H - 280, 24);
      ctx.fill();

      // 标题
      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 40px sans-serif';
      this.wrapText(ctx, c.title, 80, 130, W - 160, 52, 2);

      let y = 130 + Math.min(2, Math.ceil(c.title.length / 12)) * 52 + 30;

      // 标签
      ctx.fillStyle = 'rgba(74,144,226,0.12)';
      this.roundRect(ctx, 80, y, 110, 44, 8);
      ctx.fill();
      ctx.fillStyle = '#4A90E2';
      ctx.font = '24px sans-serif';
      ctx.fillText(c.subject, 100, y + 30);
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      this.roundRect(ctx, 210, y, 130, 44, 8);
      ctx.fill();
      ctx.fillStyle = '#666';
      ctx.fillText(`${c.enrolledCount}人已参团`, 226, y + 30);

      y += 90;
      // 价格
      ctx.fillStyle = '#F5222D';
      ctx.font = 'bold 72px sans-serif';
      ctx.fillText(`¥${util.fen2yuan(c.currentPriceCents)}`, 80, y + 50);
      ctx.fillStyle = '#999';
      ctx.font = '24px sans-serif';
      ctx.fillText('/节 · 当前价', 80 + 220, y + 50);

      y += 90;
      // 阶梯价
      const tierText = (c.tiers || []).map((t) => `满${t.min_people}人 ¥${util.fen2yuan(t.price_cents)}`).join('  ');
      ctx.fillStyle = '#333';
      ctx.font = '26px sans-serif';
      this.wrapText(ctx, `阶梯价：${tierText}`, 80, y, W - 160, 40, 2);

      y += 110;
      // 提示
      ctx.fillStyle = '#FA8C16';
      ctx.font = 'bold 30px sans-serif';
      const hint = c.nextTierHint ? c.nextTierHint.text : `还差 ${c.needToForm} 人成团`;
      ctx.fillText(`🔥 ${hint}`, 80, y);

      // 底部信息区
      const qy = H - 220;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, qy, W, 220);
      ctx.fillStyle = '#333';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('长按识别小程序码', 80, qy + 50);
      ctx.fillStyle = '#999';
      ctx.font = '24px sans-serif';
      ctx.fillText('同城教培拼好课 · 越拼越省', 80, qy + 90);

      // 二维码占位（接入微信小程序码后替换为真实图片）
      ctx.strokeStyle = '#4A90E2';
      ctx.lineWidth = 6;
      ctx.strokeRect(W - 220, qy + 20, 140, 140);
      ctx.fillStyle = '#4A90E2';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('小程序码', W - 150, qy + 82);
      ctx.fillStyle = '#999';
      ctx.font = '16px sans-serif';
      ctx.fillText('(接入后自动生成)', W - 150, qy + 110);
      ctx.textAlign = 'left';

      wx.canvasToTempFilePath({
        canvas,
        success: (r) => this.setData({ posterPath: r.tempFilePath }),
      });
    });
  },
  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },
  wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    let line = '';
    let lines = 0;
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxWidth) {
        ctx.fillText(line, x, y + lines * lineHeight);
        line = ch;
        lines++;
        if (lines >= maxLines) {
          ctx.fillText(line.slice(0, line.length - 1) + '…', x, y + (lines - 1) * lineHeight);
          return lines;
        }
      } else {
        line += ch;
      }
    }
    if (line && lines < maxLines) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines++;
    }
    return lines;
  },
  savePoster() {
    if (!this.data.posterPath) return;
    wx.saveImageToPhotosAlbum({
      filePath: this.data.posterPath,
      success: () => wx.showToast({ title: '已保存到相册' }),
      fail: () => wx.showToast({ title: '保存失败，请检查相册权限', icon: 'none' }),
    });
  },
});
