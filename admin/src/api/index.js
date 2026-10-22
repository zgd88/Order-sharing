import http from './http';

export const authApi = {
  login: (username, password) => http.post('/admin/login', { username, password }),
};

export const statsApi = {
  get: () => http.get('/admin/stats'),
};

export const teacherApi = {
  list: (status) => http.get('/admin/teachers', { params: status ? { status } : {} }),
  detail: (id) => http.get(`/admin/teachers/${id}`),
  audit: (id, action, reason) => http.post(`/admin/teachers/${id}/audit`, { action, reason }),
};

export const courseApi = {
  list: (status) => http.get('/admin/courses', { params: status ? { status } : {} }),
  detail: (id) => http.get(`/admin/courses/${id}`),
  cancel: (id) => http.post(`/admin/courses/${id}/cancel`),
};

export const bannerApi = {
  list: () => http.get('/admin/banners'),
  create: (data) => http.post('/admin/banners', data),
  update: (id, data) => http.put(`/admin/banners/${id}`, data),
  remove: (id) => http.delete(`/admin/banners/${id}`),
};

export const userApi = {
  list: (keyword) => http.get('/admin/users', { params: keyword ? { keyword } : {} }),
};

export const demandApi = {
  list: (status) => http.get('/admin/demands', { params: status ? { status } : {} }),
  detail: (id) => http.get(`/admin/demands/${id}`),
  saveRemark: (id, remark) => http.put(`/admin/demands/${id}/remark`, { remark }),
};

export const uploadApi = {
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return http.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};
