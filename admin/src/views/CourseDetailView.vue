<template>
  <div v-loading="loading">
    <div class="page-card" v-if="c">
      <div class="page-toolbar">
        <div class="detail-title">
          课程详情
          <StatusTag :status="c.status" style="margin-left: 12px" />
        </div>
        <div>
          <el-button v-if="['recruiting', 'formed'].includes(c.status)" type="danger" @click="cancel">取消课程</el-button>
          <el-button @click="$router.back()">返回</el-button>
        </div>
      </div>

      <el-descriptions :column="2" border>
        <el-descriptions-item label="课程标题" :span="2">{{ c.title }}</el-descriptions-item>
        <el-descriptions-item label="科目">{{ c.subject }}</el-descriptions-item>
        <el-descriptions-item label="年级">{{ c.grade || '-' }}</el-descriptions-item>
        <el-descriptions-item label="老师">{{ c.teacherRealName || c.teacherName }}</el-descriptions-item>
        <el-descriptions-item label="地点">{{ c.city }} · {{ c.address }}</el-descriptions-item>
        <el-descriptions-item label="开课时间">{{ formatTime(c.startTime) }}</el-descriptions-item>
        <el-descriptions-item label="结束时间">{{ formatTime(c.endTime) }}</el-descriptions-item>
        <el-descriptions-item label="报名截止">{{ formatTime(c.deadlineAt) }}</el-descriptions-item>
        <el-descriptions-item label="成团/上限">{{ c.minStudents }} / {{ c.maxStudents }} 人</el-descriptions-item>
        <el-descriptions-item label="报名人数">{{ c.enrolledCount }} 人</el-descriptions-item>
        <el-descriptions-item label="当前单价">¥{{ (c.currentPriceCents / 100).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="课程大纲" :span="2">{{ c.outline }}</el-descriptions-item>
        <el-descriptions-item v-if="c.cancelReason" label="取消原因" :span="2">{{ c.cancelReason }}</el-descriptions-item>
      </el-descriptions>

      <div class="section">
        <div class="section-title">阶梯定价</div>
        <el-table :data="c.tiers || []" size="small" style="max-width: 400px">
          <el-table-column prop="min_people" label="满 N 人" />
          <el-table-column label="单价">
            <template #default="{ row }">¥{{ (row.price_cents / 100).toFixed(2) }}/节</template>
          </el-table-column>
        </el-table>
      </div>

      <div class="section">
        <div class="section-title">报名成员（{{ c.members.length }}）</div>
        <el-table :data="c.members" size="default">
          <el-table-column prop="join_seq" label="序号" width="70" />
          <el-table-column prop="nickname" label="昵称" min-width="130" />
          <el-table-column prop="phone" label="电话" width="140">
            <template #default="{ row }">{{ row.phone || '-' }}</template>
          </el-table-column>
          <el-table-column label="入团价" width="110">
            <template #default="{ row }">¥{{ (row.priceAtJoinCents / 100).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="当前价" width="110">
            <template #default="{ row }">¥{{ (row.currentPriceCents / 100).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'joined' ? 'success' : 'info'" size="small">
                {{ row.status === 'joined' ? '参团中' : '已失效' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="section">
        <div class="section-title">退款台账（{{ c.refunds.length }}）</div>
        <el-table :data="c.refunds" size="default">
          <el-table-column label="类型" width="130">
            <template #default="{ row }">
              {{ row.type === 'tier_diff' ? '阶梯降价退差' : row.type === 'flow_refund' ? '流局退款' : '取消退款' }}
            </template>
          </el-table-column>
          <el-table-column label="金额" width="110">
            <template #default="{ row }">¥{{ (row.amountCents / 100).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'paid' ? 'success' : row.status === 'void' ? 'info' : 'warning'" size="small">
                {{ row.status === 'paid' ? '已退' : row.status === 'void' ? '已作废' : '待退' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" min-width="220" />
          <el-table-column label="时间" width="160">
            <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { courseApi } from '../api';
import StatusTag from '../components/StatusTag.vue';

const route = useRoute();
const c = ref(null);
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
    c.value = await courseApi.detail(route.params.id);
  } finally {
    loading.value = false;
  }
}

async function cancel() {
  try {
    await ElMessageBox.confirm(
      `确认取消课程「${c.value.title}」？取消后 ${c.value.enrolledCount} 位家长将收到全额退款（模拟）。`,
      '取消课程',
      { confirmButtonText: '确认取消', cancelButtonText: '再想想', type: 'warning' }
    );
  } catch (e) {
    return;
  }
  await courseApi.cancel(c.value.id);
  ElMessage.success('课程已取消');
  load();
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

.section {
  margin-top: 24px;
}

.section-title {
  font-weight: 700;
  margin-bottom: 12px;
}
</style>
