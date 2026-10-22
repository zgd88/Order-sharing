const express = require('express');
const cors = require('cors');
const path = require('path');
require('./db');
const { startSweep } = require('./services/sweep');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => res.json({ code: 0, data: { status: 'ok', time: Date.now() } }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/teacher', require('./routes/teacher'));
app.use('/api/courses', require('./routes/course'));
app.use('/api', require('./routes/enrollment'));
app.use('/api/demands', require('./routes/demand').router);
app.use('/api/notifications', require('./routes/notification'));
app.use('/api/location', require('./routes/location'));
app.use('/api/banners', require('./routes/banner'));
app.use('/api/admin', require('./routes/admin'));

// 统一 404 与错误处理
app.use((req, res) => res.status(404).json({ code: 404, message: '接口不存在' }));
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (res.headersSent) return next(err);
  res.status(err.statusCode || 500).json({ code: err.statusCode || 500, message: err.message || '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`[server] 培学小程序后端已启动: http://localhost:${PORT}`);
  startSweep();
});
