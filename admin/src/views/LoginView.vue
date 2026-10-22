<template>
  <div class="login-wrap">
    <div class="login-box">
      <div class="login-logo">培学拼课</div>
      <div class="login-sub">平台管理后台</div>
      <el-form @submit.prevent="doLogin">
        <el-form-item>
          <el-input v-model="username" placeholder="管理员账号" size="large">
            <template #prefix>👤</template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-input v-model="password" type="password" placeholder="密码" size="large" show-password @keyup.enter="doLogin">
            <template #prefix>🔒</template>
          </el-input>
        </el-form-item>
        <el-button type="primary" size="large" class="login-btn" :loading="loading" @click="doLogin">
          登 录
        </el-button>
      </el-form>
      <div class="login-tip">默认账号：admin / admin123</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { authApi } from '../api';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const username = ref('admin');
const password = ref('');
const loading = ref(false);

async function doLogin() {
  if (!username.value || !password.value) {
    ElMessage.warning('请输入账号和密码');
    return;
  }
  loading.value = true;
  try {
    const data = await authApi.login(username.value, password.value);
    auth.setLogin(data.token, data.admin);
    ElMessage.success('登录成功');
    router.push('/dashboard');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #4a90e2, #6fa8e8);
}

.login-box {
  width: 380px;
  background: #fff;
  border-radius: 12px;
  padding: 48px 40px 32px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
}

.login-logo {
  text-align: center;
  font-size: 28px;
  font-weight: 800;
  color: #4a90e2;
}

.login-sub {
  text-align: center;
  color: #999;
  font-size: 14px;
  margin: 8px 0 32px;
}

.login-btn {
  width: 100%;
  margin-top: 8px;
}

.login-tip {
  margin-top: 20px;
  text-align: center;
  color: #bbb;
  font-size: 12px;
}
</style>
