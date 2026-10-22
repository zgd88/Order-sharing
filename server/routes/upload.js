const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authUser } = require('../middleware/auth');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持图片上传'));
  },
});

const router = express.Router();

router.post('/', authUser, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '未收到文件' });
  res.json({ code: 0, data: { url: `/uploads/${req.file.filename}` } });
});

module.exports = router;
