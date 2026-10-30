<template>
  <div v-loading="loading">
    <div class="page-card" v-if="t">
      <div class="page-toolbar">
        <div class="detail-title">
          认证详情
          <StatusTag :status="t.auditStatus" style="margin-left: 12px" />
        </div>
        <div>
          <el-button v-if="t.auditStatus === 'pending'" type="success" @click="audit('approve')">通过审核</el-button>
          <el-button v-if="t.auditStatus === 'pending'" type="danger" @click="audit('reject')">驳回</el-button>
          <el-button @click="$router.back()">返回</el-button>
        </div>
      </div>

      <el-descriptions :column="2" border>
        <el-descriptions-item label="用户昵称">{{ t.nickname }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ t.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="真实姓名">{{ t.realName }}</el-descriptions-item>
        <el-descriptions-item label="身份证号">{{ t.idCardNo }}</el-descriptions-item>
        <el-descriptions-item label="证件类型">{{ t.certType === 'teacher_certificate' ? '教师资格证' : '学历证书' }}</el-descriptions-item>
        <el-descriptions-item label="授课科目">{{ t.subject || '-' }}</el-descriptions-item>
        <el-descriptions-item label="教龄">{{ t.yearsExperience }} 年</el-descriptions-item>
        <el-descriptions-item label="学历">{{ t.education || '-' }}</el-descriptions-item>
        <el-descriptions-item label="专业">{{ t.major || '-' }}</el-descriptions-item>
        <el-descriptions-item label="毕业院校">{{ t.graduateSchool || '-' }}</el-descriptions-item>
        <el-descriptions-item label="可授年级">{{ t.teachableGrades || '-' }}</el-descriptions-item>
        <el-descriptions-item label="提交时间">{{ formatTime(t.updatedAt) }}</el-descriptions-item>
        <el-descriptions-item label="个人简介" :span="2">{{ t.intro || '-' }}</el-descriptions-item>
        <el-descriptions-item v-if="t.rejectReason" label="驳回原因" :span="2">
          <span style="color: #f56c6c">{{ t.rejectReason }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <div class="img-section">
        <div class="img-title">证书照片（{{ t.certImages ? t.certImages.length : 0 }} 张）</div>
        <div class="img-list" v-if="t.certImages && t.certImages.length">
          <div class="img-item">
            <el-image
              v-for="(img, i) in t.certImages"
              :key="img"
              :src="imgUrl(img)"
              :preview-src-list="t.certImages.map((u) => imgUrl(u))"
              :initial-index="i"
              fit="contain"
              class="cert-img"
            />
          </div>
        </div>
        <div class="img-list" v-else>
          <div class="cert-img empty">未上传</div>
        </div>
      </div>

      <!-- 资质变更单（已认证老师修改资质后待审） -->
      <div class="img-section" v-if="t.pendingChange">
        <div class="img-title">
          ⚠️ 资质修改待审（新资料，审核通过后生效；驳回不影响原资质）
          <el-button type="success" size="small" style="margin-left: 12px" @click="changeAudit('approve')">通过修改</el-button>
          <el-button type="danger" size="small" @click="changeAudit('reject')">驳回修改</el-button>
        </div>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="新学历">{{ t.pendingChange.education || '-' }}</el-descriptions-item>
          <el-descriptions-item label="新专业">{{ t.pendingChange.major || '-' }}</el-descriptions-item>
          <el-descriptions-item label="新毕业院校">{{ t.pendingChange.graduateSchool || '-' }}</el-descriptions-item>
          <el-descriptions-item label="新授课科目">{{ t.pendingChange.subject || '-' }}</el-descriptions-item>
          <el-descriptions-item label="新可授年级">{{ t.pendingChange.teachableGrades || '-' }}</el-descriptions-item>
          <el-descriptions-item label="提交时间">{{ formatTime(t.pendingChange.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="新个人简介" :span="2">{{ t.pendingChange.intro || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div class="img-list" style="margin-top: 12px" v-if="t.pendingChange.certImages && t.pendingChange.certImages.length">
          <div class="img-item">
            <el-image
              v-for="(img, i) in t.pendingChange.certImages"
              :key="img"
              :src="imgUrl(img)"
              :preview-src-list="t.pendingChange.certImages.map((u) => imgUrl(u))"
              :initial-index="i"
              fit="contain"
              class="cert-img small"
            />
            <div class="img-label">新证书照片（{{ t.pendingChange.certImages.length }} 张）</div>
          </div>
        </div>
      </div>

      <!-- 老师简历 -->
      <div class="img-section" v-if="t.resume">
        <div class="img-title">老师简历</div>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="姓名">{{ t.resume.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="性别">{{ t.resume.gender || '-' }}</el-descriptions-item>
          <el-descriptions-item label="身份标签">{{ t.resume.identityTag || '-' }}</el-descriptions-item>
          <el-descriptions-item label="教龄">{{ t.resume.yearsExperience }} 年</el-descriptions-item>
          <el-descriptions-item label="联系方式">
            <span class="phone">{{ t.resume.contact || '-' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="常驻地址">{{ t.resume.address || '-' }}</el-descriptions-item>
          <el-descriptions-item label="授课科目">{{ t.resume.subjects || '-' }}</el-descriptions-item>
          <el-descriptions-item label="可教年级">{{ t.resume.grades || '-' }}</el-descriptions-item>
          <el-descriptions-item label="个人简介" :span="2">{{ t.resume.intro || '-' }}</el-descriptions-item>
        </el-descriptions>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { teacherApi } from '../api';
import StatusTag from '../components/StatusTag.vue';
import { imgUrl } from '../utils/img';

const route = useRoute();
const t = ref(null);
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
    t.value = await teacherApi.detail(route.params.id);
  } finally {
    loading.value = false;
  }
}

async function audit(action) {
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
      await ElMessageBox.confirm(`确认通过「${t.value.realName}」的资质认证？`, '通过审核', {
        confirmButtonText: '确认通过',
        cancelButtonText: '取消',
        type: 'success',
      });
    } catch (e) {
      return;
    }
  }
  await teacherApi.audit(t.value.id, action, reason);
  ElMessage.success(action === 'approve' ? '已通过' : '已驳回');
  load();
}

// 审核资质变更单：驳回不影响原已通过资质
async function changeAudit(action) {
  let reason = '';
  if (action === 'reject') {
    try {
      const r = await ElMessageBox.prompt('请填写驳回原因（原资质将继续有效）', '驳回修改', {
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
      await ElMessageBox.confirm(
        `确认通过「${t.value.realName}」的资质修改？新资料将替换现有资质并保持已认证状态。`,
        '通过修改',
        { confirmButtonText: '确认通过', cancelButtonText: '取消', type: 'success' }
      );
    } catch (e) {
      return;
    }
  }
  await teacherApi.changeAudit(t.value.id, t.value.pendingChange.id, action, reason);
  ElMessage.success(action === 'approve' ? '修改已通过，新资料已生效' : '已驳回修改，原资质继续有效');
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

.img-section {
  margin-top: 24px;
}

.img-title {
  font-weight: 700;
  margin-bottom: 12px;
}

.img-list {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.img-item {
  text-align: center;
}

.cert-img {
  width: 280px;
  height: 200px;
  border: 1px solid #eee;
  border-radius: 6px;
  background: #fafafa;
}

.cert-img.small {
  width: 200px;
  height: 140px;
}

.cert-img.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ccc;
}

.img-label {
  margin-top: 8px;
  color: #999;
  font-size: 13px;
}
</style>
