// 登录态管理：支持手机号+密码（注册账号）与演示模式（deviceId mock）
function getDeviceId() {
  let id = wx.getStorageSync('deviceId');
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    wx.setStorageSync('deviceId', id);
  }
  return id;
}

function getToken() {
  return wx.getStorageSync('token') || '';
}

function getUser() {
  return wx.getStorageSync('user') || null;
}

function isLoggedIn() {
  return !!getToken();
}

function isTeacher() {
  const u = getUser();
  return !!(u && u.role === 'teacher');
}

function saveSession(res) {
  wx.setStorageSync('token', res.token);
  wx.setStorageSync('user', res.user);
  return res.user;
}

// 演示模式登录（开发测试用）
function login(role, nickname, avatarUrl) {
  return new Promise((resolve, reject) => {
    wx.login({
      success: () => {
        wx.request({
          url: require('./request').BASE_URL + '/api/auth/login',
          method: 'POST',
          data: { deviceId: getDeviceId(), role, nickname, avatarUrl },
          success(res) {
            if (res.statusCode === 200 && res.data.code === 0) resolve(saveSession(res.data.data));
            else reject(res.data);
          },
          fail: reject,
        });
      },
      fail: reject,
    });
  });
}

// 手机号+密码登录
function loginByPhone(phone, password) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: require('./request').BASE_URL + '/api/auth/login',
      method: 'POST',
      data: { phone, password },
      success(res) {
        if (res.statusCode === 200 && res.data.code === 0) resolve(saveSession(res.data.data));
        else reject(res.data);
      },
      fail: reject,
    });
  });
}

// 注册（手机号+密码），成功即登录
function register(phone, password, role, nickname) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: require('./request').BASE_URL + '/api/auth/register',
      method: 'POST',
      data: { phone, password, role, nickname },
      success(res) {
        if (res.statusCode === 200 && res.data.code === 0) resolve(saveSession(res.data.data));
        else reject(res.data);
      },
      fail: reject,
    });
  });
}

function logout() {
  wx.removeStorageSync('token');
  wx.removeStorageSync('user');
}

// 切换身份：当前账号直接更新 role（支持注册账号）
function switchRole(role) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: require('./request').BASE_URL + '/api/auth/switch-role',
      method: 'POST',
      data: { role },
      header: { Authorization: `Bearer ${getToken()}` },
      success(res) {
        if (res.statusCode === 200 && res.data.code === 0) resolve(saveSession(res.data.data));
        else reject(res.data);
      },
      fail: reject,
    });
  });
}

module.exports = {
  getDeviceId, getToken, getUser, isLoggedIn, isTeacher,
  login, loginByPhone, register, logout, switchRole,
};
