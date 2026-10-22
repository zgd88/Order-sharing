import { defineStore } from 'pinia';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('admin_token') || '',
    admin: JSON.parse(localStorage.getItem('admin_info') || 'null'),
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
  },
  actions: {
    setLogin(token, admin) {
      this.token = token;
      this.admin = admin;
      localStorage.setItem('admin_token', token);
      localStorage.setItem('admin_info', JSON.stringify(admin));
    },
    logout() {
      this.token = '';
      this.admin = null;
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_info');
    },
  },
});
