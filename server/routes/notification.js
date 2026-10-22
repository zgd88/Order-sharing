const express = require('express');
const db = require('../db');
const { authUser } = require('../middleware/auth');

const router = express.Router();
router.use(authUser);

// 站内信列表（最近 50 条）
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user.id);
  const unread = db
    .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(req.user.id).c;
  res.json({
    code: 0,
    data: {
      unreadCount: unread,
      list: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        content: n.content,
        isRead: !!n.is_read,
        createdAt: n.created_at,
      })),
    },
  });
});

// 全部标记已读
router.post('/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.user.id);
  res.json({ code: 0, message: '已全部标记为已读' });
});

module.exports = router;
