<template>
  <div v-loading="loading">
    <div class="page-card" v-if="d">
      <div class="page-toolbar">
        <div class="detail-title">
          订单详情 #{{ d.id }}
          <el-tag
            :type="d.status === 'recruiting' ? 'primary' : d.status === 'locked' ? 'warning' : 'info'"
            style="margin-left: 12px"
          >
            {{ d.status === 'recruiting' ? '招募中' : d.status === 'locked' ? '已锁定' : '已关闭' }}
          </el-tag>
        </div>
        <el-button @click="$router.back()">返回</el-button>
      </div>

      <el-descriptions :column="2" border>
        <el-descriptions-item label="需求">{{ d.subject }}{{ d.grade ? ' · ' + d.grade : '' }}家教</el-descriptions-item>
        <el-descriptions-item label="课时费">¥{{ (d.hourlyRateCents / 100).toFixed(2) }}/小时</el-descriptions-item>
        <el-descriptions-item label="家长昵称">{{ d.parentNickname }}</el-descriptions-item>
        <el-descriptions-item label="家长电话">
          <span class="phone">{{ d.phone }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="上课地址" :span="2">{{ d.province }} · {{ d.city }} · {{ d.address }}</el-descriptions-item>
        <el-descriptions-item label="锁定时间">{{ formatTime(d.lockedAt) }}</el-descriptions-item>
        <el-descriptions-item label="发布时间">{{ formatTime(d.createdAt) }}</el-descriptions-item>
      </el-descriptions>

      <!-- 被选中老师 -->
      <div class="section" v-if="d.selectedTeacherId">
        <div class="section-title">🎯 被选中的老师</div>
        <el-descriptions :column="3" border>
          <el-descriptions-item label="姓名">{{ d.selectedTeacherRealName }}（{{ d.selectedTeacherNickname }}）</el-descriptions-item>
          <el-descriptions-item label="电话">
            <span class="phone">{{ d.selectedTeacherPhone }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="资质">{{ d.selectedTeacherEducation || '-' }} {{ d.selectedTeacherMajor || '' }} · {{ d.selectedTeacherYears }}年教龄</el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- 全部投递 -->
      <div class="section">
        <div class="section-title">投递记录（{{ d.applications.length }}）</div>
        <el-table :data="d.applications" size="default">
          <el-table-column prop="id" label="ID" width="60" />
          <el-table-column label="老师" min-width="120">
            <template #default="{ row }">{{ row.realName || row.nickname }}</template>
          </el-table-column>
          <el-table-column label="电话" width="130">
            <template #default="{ row }">{{ row.teacherPhone || '-' }}</template>
          </el-table-column>
          <el-table-column label="学历/专业" width="150">
            <template #default="{ row }">{{ row.education || '-' }} {{ row.major || '' }}</template>
          </el-table-column>
          <el-table-column prop="yearsExperience" label="教龄" width="70">
            <template #default="{ row }">{{ row.yearsExperience }}年</template>
          </el-table-column>
          <el-table-column label="投递留言" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ row.note || '-' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag
                :type="row.status === 'selected' ? 'success' : row.status === 'invalid' ? 'info' : 'warning'"
                size="small"
              >
                {{ row.status === 'selected' ? '已选中' : row.status === 'invalid' ? '已失效' : '待处理' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="投递时间" width="160">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 客服跟进备注 -->
      <div class="section">
        <div class="section-title">💬 客服跟进备注</div>
        <el-input
          v-model="remark"
          type="textarea"
          :rows="3"
          placeholder="如：已联系家长待回复 / 双方已加微信 / 已约试听时间…"
        />
        <div class="remark-footer">
          <span class="sub-text">上次更新：{{ formatTime(d.remarkUpdatedAt) }}</span>
          <el-button type="primary" :loading="saving" @click="saveRemark">保存备注</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { demandApi } from '../api';

const route = useRoute();
const d = ref(null);
const remark = ref('');
const loading = ref(false);
const saving = ref(false);

function formatTime(ts) {
  if (!ts) return '-';
  const dt = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

async function load() {
  loading.value = true;
  try {
    d.value = await demandApi.detail(route.params.id);
    remark.value = d.value.remark || '';
  } finally {
    loading.value = false;
  }
}

async function saveRemark() {
  saving.value = true;
  try {
    await demandApi.saveRemark(d.value.id, remark.value);
    ElMessage.success('备注已保存');
    load();
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.detail-title {
  font-size: 18px;
  font-weight: 700;
  display: flex;
  align-items: center;
}

.phone {
  color: #f56c6c;
  font-weight: 700;
}

.section {
  margin-top: 24px;
}

.section-title {
  font-weight: 700;
  margin-bottom: 12px;
}

.remark-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
}

.sub-text {
  font-size: 12px;
  color: #999;
}
</style>
