// 登录态管理：开发期用随机 deviceId 模拟（生产接入 wx.login code）
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

function login(role, nickname, avatarUrl) {
  return new Promise((resolve, reject) => {
    wx.login({
      success: () => {
        wx.request({
          url: require('./request').BASE_URL + '/api/auth/login',
          method: 'POST',
          data: { deviceId: getDeviceId(), role, nickname, avatarUrl },
          success(res) {
            if (res.statusCode === 200 && res.data.code === 0) {
              const { token, user } = res.data.data;
              wx.setStorageSync('token', token);
              wx.setStorageSync('user', user);
              resolve(user);
            } else {
              reject(res.data);
            }
          },
          fail: reject,
        });
      },
      fail: reject,
    });
  });
}

function logout() {
  wx.removeStorageSync('token');
  wx.removeStorageSync('user');
}

// 切换身份：仅更新 role
function switchRole(role) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: require('./request').BASE_URL + '/api/auth/login',
      method: 'POST',
      data: { deviceId: getDeviceId(), role },
      success(res) {
        if (res.statusCode === 200 && res.data.code === 0) {
          const { token, user } = res.data.data;
          wx.setStorageSync('token', token);
          wx.setStorageSync('user', user);
          resolve(user);
        } else reject(res.data);
      },
      fail: reject,
    });
  });
}

module.exports = { getDeviceId, getToken, getUser, isLoggedIn, isTeacher, login, logout, switchRole };
