<template>
  <div>
    <div class="page-card">
      <div class="page-toolbar">
        <el-radio-group v-model="status" @change="load">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="recruiting">拼团中</el-radio-button>
          <el-radio-button value="formed">已成团</el-radio-button>
          <el-radio-button value="failed">已流局</el-radio-button>
          <el-radio-button value="cancelled">已取消</el-radio-button>
          <el-radio-button value="finished">已结束</el-radio-button>
        </el-radio-group>
        <el-button @click="load">刷新</el-button>
      </div>

      <el-table :data="list" v-loading="loading" size="default">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="title" label="课程" min-width="180" show-overflow-tooltip />
        <el-table-column prop="subject" label="科目" width="80" />
        <el-table-column label="老师" width="130">
          <template #default="{ row }">{{ row.teacherRealName || row.teacherName }}</template>
        </el-table-column>
        <el-table-column label="阶梯" width="200">
          <template #default="{ row }">
            <span class="tier-text">{{ (row.tiers || []).map((t) => `满${t.min_people}人¥${(t.price_cents / 100).toFixed(0)}`).join(' / ') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="报名" width="100">
          <template #default="{ row }">{{ row.enrolledCount }}/{{ row.maxStudents }}</template>
        </el-table-column>
        <el-table-column label="当前价" width="90">
          <template #default="{ row }">¥{{ (row.currentPriceCents / 100).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <StatusTag :status="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="$router.push(`/courses/${row.id}`)">详情</el-button>
            <el-button
              v-if="['recruiting', 'formed'].includes(row.status)"
              link
              type="danger"
              @click="cancel(row)"
            >取消</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { courseApi } from '../api';
import StatusTag from '../components/StatusTag.vue';

const status = ref('');
const list = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    list.value = await courseApi.list(status.value);
  } finally {
    loading.value = false;
  }
}

async function cancel(row) {
  try {
    await ElMessageBox.confirm(
      `确认取消课程「${row.title}」？取消后 ${row.enrolledCount} 位家长将收到全额退款（模拟）。`,
      '取消课程',
      { confirmButtonText: '确认取消', cancelButtonText: '再想想', type: 'warning' }
    );
  } catch (e) {
    return;
  }
  await courseApi.cancel(row.id);
  ElMessage.success('课程已取消');
  load();
}

onMounted(load);
</script>

<style scoped>
.tier-text {
  font-size: 12px;
  color: #666;
}
</style>
