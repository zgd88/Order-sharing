import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  { path: '/login', component: () => import('../views/LoginView.vue') },
  {
    path: '/',
    component: () => import('../layout/AdminLayout.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', component: () => import('../views/DashboardView.vue'), meta: { title: '数据看板' } },
      { path: 'teachers', component: () => import('../views/TeacherListView.vue'), meta: { title: '老师资质审核' } },
      { path: 'teachers/:id', component: () => import('../views/TeacherDetailView.vue'), meta: { title: '审核详情' } },
      { path: 'demands', component: () => import('../views/DemandListView.vue'), meta: { title: '订单管理（家长发单）' } },
      { path: 'demands/:id', component: () => import('../views/DemandDetailView.vue'), meta: { title: '订单跟进' } },
      { path: 'courses', component: () => import('../views/CourseListView.vue'), meta: { title: '课程管理' } },
      { path: 'courses/:id', component: () => import('../views/CourseDetailView.vue'), meta: { title: '课程详情' } },
      { path: 'banners', component: () => import('../views/BannerListView.vue'), meta: { title: 'Banner 配置' } },
      { path: 'users', component: () => import('../views/UserListView.vue'), meta: { title: '用户管理' } },
    ],
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.path !== '/login' && !auth.isLoggedIn) return '/login';
  if (to.path === '/login' && auth.isLoggedIn) return '/dashboard';
  return true;
});

export default router;
