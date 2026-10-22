import axios from 'axios';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import router from '../router';

// 开发环境走 vite 代理(/api→3000)；生产环境复用 Nginx 的 /peixue/ 反代
const baseURL = import.meta.env.PROD ? '/peixue/api' : '/api';

const http = axios.create({ baseURL, timeout: 15000 });

http.interceptors.request.use((config) => {
  const auth = useAuthStore();
  if (auth.token) config.headers.Authorization = `Bearer ${auth.token}`;
  return config;
});

http.interceptors.response.use(
  (res) => {
    if (res.data.code === 0) return res.data.data;
    ElMessage.error(res.data.message || '请求失败');
    return Promise.reject(res.data);
  },
  (err) => {
    const status = err.response && err.response.status;
    const msg = (err.response && err.response.data && err.response.data.message) || '网络异常';
    if (status === 401) {
      const auth = useAuthStore();
      auth.logout();
      router.push('/login');
    }
    ElMessage.error(msg);
    return Promise.reject(err);
  }
);

export default http;
