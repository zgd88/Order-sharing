// 网络请求封装：BASE_URL 可按需修改（微信开发者工具需勾选"不校验合法域名"）
// 开发环境：http://localhost:3000
// 生产环境：https://你的域名/peixue （Nginx 配置了 location /peixue/ 反代到后端端口）
const BASE_URL = 'http://localhost:3000';

// 把后端返回的相对路径（/uploads/xxx）拼成完整地址，供 <image> 使用
function fullUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return BASE_URL + path;
}

function request(method, url, data, { auth = true, silent = false } = {}) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token');
    wx.request({
      url: BASE_URL + url,
      method,
      data,
      header: {
        'content-type': 'application/json',
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success(res) {
        if (res.statusCode === 401) {
          wx.removeStorageSync('token');
          wx.removeStorageSync('user');
          if (!silent) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            setTimeout(() => wx.reLaunch({ url: '/pages/login/login' }), 800);
          }
          reject(res.data);
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.code === 0) {
          resolve(res.data.data);
        } else {
          const msg = (res.data && res.data.message) || `请求失败(${res.statusCode})`;
          if (!silent) wx.showToast({ title: msg, icon: 'none' });
          reject(res.data || { message: msg });
        }
      },
      fail(err) {
        if (!silent) wx.showToast({ title: '网络异常，请确认后端服务已启动', icon: 'none' });
        reject(err);
      },
    });
  });
}

module.exports = {
  BASE_URL,
  fullUrl,
  get: (url, data, opts) => request('GET', url, data, opts),
  post: (url, data, opts) => request('POST', url, data, opts),
  put: (url, data, opts) => request('PUT', url, data, opts),
  del: (url, data, opts) => request('DELETE', url, data, opts),
  // 上传图片
  upload(filePath) {
    return new Promise((resolve, reject) => {
      const token = wx.getStorageSync('token');
      wx.uploadFile({
        url: BASE_URL + '/api/upload',
        filePath,
        name: 'file',
        header: token ? { Authorization: `Bearer ${token}` } : {},
        success(res) {
          try {
            const data = JSON.parse(res.data);
            if (data.code === 0) resolve(fullUrl(data.data.url));
            else {
              wx.showToast({ title: data.message || '上传失败', icon: 'none' });
              reject(data);
            }
          } catch (e) {
            reject(e);
          }
        },
        fail(err) {
          wx.showToast({ title: '上传失败', icon: 'none' });
          reject(err);
        },
      });
    });
  },
};
