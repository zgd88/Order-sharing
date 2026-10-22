<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="brand">培学拼课 · 管理后台</div>
      <el-menu :default-active="$route.path" router background-color="#001529" text-color="#a6adb4" active-text-color="#fff">
        <el-menu-item index="/dashboard">📊 数据看板</el-menu-item>
        <el-menu-item index="/teachers">🎓 老师资质审核</el-menu-item>
        <el-menu-item index="/demands">📋 订单管理</el-menu-item>
        <el-menu-item index="/courses">📚 课程管理</el-menu-item>
        <el-menu-item index="/banners">🖼️ Banner 配置</el-menu-item>
        <el-menu-item index="/users">👥 用户管理</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <div class="header-title">{{ $route.meta.title }}</div>
        <div class="header-right">
          <span class="admin-name">{{ auth.admin ? auth.admin.displayName : '' }}</span>
          <el-button link type="danger" @click="logout">退出</el-button>
        </div>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.layout {
  min-height: 100vh;
}

.aside {
  background: #001529;
}

.brand {
  color: #fff;
  font-weight: 700;
  font-size: 17px;
  padding: 20px 16px;
  text-align: center;
  letter-spacing: 1px;
}

.aside :deep(.el-menu) {
  border-right: none;
}

.aside :deep(.el-menu-item.is-active) {
  background: #4a90e2;
}

.header {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.header-title {
  font-size: 16px;
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-name {
  color: #666;
  font-size: 14px;
}

.main {
  padding: 20px;
}
</style>
