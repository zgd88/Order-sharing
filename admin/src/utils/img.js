// 图片地址适配：生产环境图片统一走 /peixue/uploads 反代，开发环境走 vite 代理
const imgPrefix = import.meta.env.PROD ? '/peixue/uploads' : '/uploads';

export function imgUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  if (path.startsWith('/uploads/')) return imgPrefix + path.slice(8);
  return path;
}
