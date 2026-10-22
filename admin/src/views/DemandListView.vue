<template>
  <div>
    <div class="page-card">
      <div class="page-toolbar">
        <el-radio-group v-model="status" @change="load">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="recruiting">招募中</el-radio-button>
          <el-radio-button value="locked">已锁定</el-radio-button>
          <el-radio-button value="closed">已关闭</el-radio-button>
        </el-radio-group>
        <div>
          <el-tag v-if="status === 'locked'" type="warning" effect="plain" style="margin-right: 12px">
            已锁定订单是客服核心工作台，请尽快电话跟进
          </el-tag>
          <el-button @click="load">刷新</el-button>
        </div>
      </div>

      <el-table :data="list" v-loading="loading" size="default">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="需求" min-width="150">
          <template #default="{ row }">
            {{ row.subject }}{{ row.grade ? ' · ' + row.grade : '' }}家教
          </template>
        </el-table-column>
        <el-table-column label="课时费" width="100">
          <template #default="{ row }">¥{{ (row.hourlyRateCents / 100).toFixed(2) }}/h</template>
        </el-table-column>
        <el-table-column label="家长" width="150">
          <template #default="{ row }">
            <div>{{ row.parentNickname }}</div>
            <div class="sub-text">{{ row.phone }}</div>
          </template>
        </el-table-column>
        <el-table-column label="上课地址" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.province }} · {{ row.city }} · {{ row.address }}</template>
        </el-table-column>
        <el-table-column label="投递" width="70">
          <template #default="{ row }">{{ row.applicationCount }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'recruiting' ? 'primary' : row.status === 'locked' ? 'warning' : 'info'" size="small">
              {{ row.status === 'recruiting' ? '招募中' : row.status === 'locked' ? '已锁定' : '已关闭' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="选中老师" width="130">
          <template #default="{ row }">
            <template v-if="row.selectedTeacherRealName">
              {{ row.selectedTeacherRealName }}
              <div class="sub-text">{{ row.selectedTeacherPhone }}</div>
            </template>
            <span v-else class="sub-text">-</span>
          </template>
        </el-table-column>
        <el-table-column label="客服备注" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="$router.push(`/demands/${row.id}`)">跟进</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { demandApi } from '../api';

const status = ref('locked');
const list = ref([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    list.value = await demandApi.list(status.value);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.sub-text {
  font-size: 12px;
  color: #999;
}
</style>
