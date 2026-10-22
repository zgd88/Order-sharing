<template>
  <div>
    <div class="page-card">
      <div class="page-toolbar">
        <el-radio-group v-model="status" @change="load">
          <el-radio-button value="pending">待审核</el-radio-button>
          <el-radio-button value="approved">已通过</el-radio-button>
          <el-radio-button value="rejected">已驳回</el-radio-button>
          <el-radio-button value="">全部</el-radio-button>
        </el-radio-group>
        <el-button @click="load">刷新</el-button>
      </div>

      <el-table :data="list" v-loading="loading" size="default">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="用户" min-width="140">
          <template #default="{ row }">
            <div>{{ row.nickname }}</div>
            <div class="sub-text">{{ row.phone || '未留电话' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="realName" label="姓名" width="100" />
        <el-table-column label="证件" width="110">
          <template #default="{ row }">{{ row.certType === 'teacher_certificate' ? '教师资格证' : '学历证书' }}</template>
        </el-table-column>
        <el-table-column prop="subject" label="科目" width="90" />
        <el-table-column prop="yearsExperience" label="教龄" width="70">
          <template #default="{ row }">{{ row.yearsExperience }}年</template>
        </el-table-column>
        <el-table-column label="证件照片" width="110">
          <template #default="{ row }">
            <img v-if="row.certImageUrl" :src="row.certImageUrl" class="img-cell" @click="preview(row.certImageUrl)" />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <StatusTag :status="row.auditStatus" />
          </template>
        </el-table-column>
        <el-table-column label="提交时间" width="160">
          <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="$router.push(`/teachers/${row.id}`)">查看</el-button>
            <el-button v-if="row.auditStatus === 'pending'" link type="success" @click="audit(row, 'approve')">通过</el-button>
            <el-button v-if="row.auditStatus === 'pending'" link type="danger" @click="audit(row, 'reject')">驳回</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { teacherApi } from '../api';
import StatusTag from '../components/StatusTag.vue';

const status = ref('pending');
const list = ref([]);
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
    list.value = await teacherApi.list(status.value);
  } finally {
    loading.value = false;
  }
}

function preview(url) {
  window.open(url, '_blank');
}

async function audit(row, action) {
  let reason = '';
  if (action === 'reject') {
    try {
      const r = await ElMessageBox.prompt('请填写驳回原因', '驳回认证', {
        confirmButtonText: '确认驳回',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '驳回原因不能为空',
      });
      reason = r.value;
    } catch (e) {
      return;
    }
  } else {
    try {
      await ElMessageBox.confirm(`确认通过「${row.realName}」的资质认证？`, '通过审核', {
        confirmButtonText: '确认通过',
        cancelButtonText: '取消',
        type: 'success',
      });
    } catch (e) {
      return;
    }
  }
  await teacherApi.audit(row.id, action, reason);
  ElMessage.success(action === 'approve' ? '已通过' : '已驳回');
  load();
}

onMounted(load);
</script>

<style scoped>
.sub-text {
  font-size: 12px;
  color: #999;
}
</style>
