const express = require('express');
const db = require('../db');

const router = express.Router();

// 公开：小程序首页 Banner（仅启用且在有效期内的）
router.get('/', (req, res) => {
  const now = Date.now();
  const rows = db
    .prepare(
      `SELECT id, title, image_url, link_type, link_value FROM banners
       WHERE enabled = 1 AND (start_at IS NULL OR start_at <= ?) AND (end_at IS NULL OR end_at >= ?)
       ORDER BY sort_order ASC, id ASC`
    )
    .all(now, now);
  res.json({ code: 0, data: rows.map((b) => ({ id: b.id, title: b.title, imageUrl: b.image_url, linkType: b.link_type, linkValue: b.link_value })) });
});

module.exports = router;
