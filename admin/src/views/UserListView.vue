<template>
  <div>
    <div class="page-card">
      <div class="page-toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索昵称/手机号"
          style="width: 260px"
          clearable
          @keyup.enter="load"
          @clear="load"
        >
          <template #append>
            <el-button @click="load">搜索</el-button>
          </template>
        </el-input>
        <el-button @click="load">刷新</el-button>
      </div>

      <el-table :data="list" v-loading="loading" size="default">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="nickname" label="昵称" min-width="130" />
        <el-table-column prop="phone" label="手机号" width="140">
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column prop="city" label="城市" width="100">
          <template #default="{ row }">{{ row.city || '-' }}</template>
        </el-table-column>
        <el-table-column label="当前身份" width="100">
          <template #default="{ row }">
            <el-tag :type="row.role === 'teacher' ? 'warning' : 'primary'" size="small">
              {{ row.role === 'teacher' ? '老师' : '家长' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="老师认证" width="100">
          <template #default="{ row }">
            <StatusTag v-if="row.teacherAuditStatus" :status="row.teacherAuditStatus" />
            <span v-else class="sub-text">未申请</span>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { userApi } from '../api';
import StatusTag from '../components/StatusTag.vue';

const list = ref([]);
const keyword = ref('');
const loading = ref(false);

function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function load() {
  loading.value = true;
  try {
    list.value = await userApi.list(keyword.value);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.sub-text {
  color: #ccc;
  font-size: 12px;
}
</style>
