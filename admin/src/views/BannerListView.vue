<template>
  <div>
    <div class="page-card">
      <div class="page-toolbar">
        <div class="page-desc">小程序首页轮播图，最多建议 5 张</div>
        <el-button type="primary" @click="openEdit(null)">＋ 新增 Banner</el-button>
      </div>

      <el-table :data="list" v-loading="loading" size="default">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="图片" width="140">
          <template #default="{ row }">
            <img :src="row.imageUrl" class="img-cell" @click="window.open(row.imageUrl)" />
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="140" />
        <el-table-column label="跳转" width="130">
          <template #default="{ row }">
            {{ row.linkType === 'course' ? `课程 #${row.linkValue}` : '无跳转' }}
          </template>
        </el-table-column>
        <el-table-column prop="sortOrder" label="排序" width="70" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑 Banner' : '新增 Banner'" width="480px">
      <el-form label-width="90px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="Banner 标题" />
        </el-form-item>
        <el-form-item label="图片" required>
          <ImageUpload v-model="form.imageUrl" />
        </el-form-item>
        <el-form-item label="跳转课程">
          <el-select v-model="form.linkType" style="width: 100%">
            <el-option label="无跳转" value="none" />
            <el-option label="跳转课程详情" value="course" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.linkType === 'course'" label="课程 ID">
          <el-input v-model="form.linkValue" placeholder="填写课程 ID" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" :max="99" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { bannerApi } from '../api';
import ImageUpload from '../components/ImageUpload.vue';

const list = ref([]);
const loading = ref(false);
const dialogVisible = ref(false);
const form = ref({});

async function load() {
  loading.value = true;
  try {
    list.value = await bannerApi.list();
  } finally {
    loading.value = false;
  }
}

function openEdit(row) {
  form.value = row
    ? { ...row, enabled: !!row.enabled }
    : { title: '', imageUrl: '', linkType: 'none', linkValue: '', sortOrder: 0, enabled: true };
  dialogVisible.value = true;
}

async function save() {
  if (!form.value.title || !form.value.imageUrl) {
    ElMessage.warning('标题和图片必填');
    return;
  }
  if (form.value.id) {
    await bannerApi.update(form.value.id, form.value);
  } else {
    await bannerApi.create(form.value);
  }
  ElMessage.success('已保存');
  dialogVisible.value = false;
  load();
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确认删除 Banner「${row.title}」？`, '删除', { type: 'warning' });
  } catch (e) {
    return;
  }
  await bannerApi.remove(row.id);
  ElMessage.success('已删除');
  load();
}

onMounted(load);
</script>

<style scoped>
.page-desc {
  color: #999;
  font-size: 13px;
}
</style>
