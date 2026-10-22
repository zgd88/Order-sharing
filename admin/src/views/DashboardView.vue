<template>
  <div v-loading="loading">
    <el-row :gutter="16">
      <el-col :span="4" v-for="card in cards" :key="card.label">
        <div class="stat-card">
          <div class="stat-num" :style="{ color: card.color }">{{ card.value }}</div>
          <div class="stat-label">{{ card.label }}</div>
        </div>
      </el-col>
    </el-row>

    <div class="page-card">
      <div class="card-title">最新课程</div>
      <el-table :data="stats.recentCourses || []" size="default">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="title" label="课程" min-width="200" />
        <el-table-column prop="subject" label="科目" width="80" />
        <el-table-column prop="enrolledCount" label="报名" width="80" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <StatusTag :status="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="发布时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button link type="primary" @click="$router.push(`/courses/${row.id}`)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { statsApi } from '../api';
import StatusTag from '../components/StatusTag.vue';

const loading = ref(false);
const stats = ref({});

const cards = computed(() => [
  { label: '注册用户', value: stats.value.userCount ?? 0, color: '#4a90e2' },
  { label: '已认证老师', value: stats.value.teacherCount ?? 0, color: '#52c41a' },
  { label: '待审核老师', value: stats.value.pendingTeacherCount ?? 0, color: '#fa8c16' },
  { label: '课程总数', value: stats.value.courseCount ?? 0, color: '#722ed1' },
  { label: '进行中课程', value: stats.value.activeCourseCount ?? 0, color: '#13c2c2' },
  { label: '参团人次', value: stats.value.enrollmentCount ?? 0, color: '#eb2f96' },
  { label: '发单总数', value: stats.value.demandCount ?? 0, color: '#f5222d' },
  { label: '待跟进锁定单', value: stats.value.lockedDemandCount ?? 0, color: '#faad14' },
]);

function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

onMounted(async () => {
  loading.value = true;
  try {
    stats.value = await statsApi.get();
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 24px 16px;
  text-align: center;
  margin-bottom: 16px;
}

.stat-num {
  font-size: 30px;
  font-weight: 800;
}

.stat-label {
  margin-top: 8px;
  color: #999;
  font-size: 13px;
}

.card-title {
  font-weight: 700;
  margin-bottom: 16px;
}
</style>
