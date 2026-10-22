<template>
  <div class="img-upload">
    <img v-if="modelValue" :src="modelValue" class="preview" alt="图片" />
    <el-upload
      :show-file-list="false"
      :http-request="doUpload"
      accept="image/*"
    >
      <el-button size="small">{{ modelValue ? '更换图片' : '上传图片' }}</el-button>
    </el-upload>
  </div>
</template>

<script setup>
import { ElMessage } from 'element-plus';
import { uploadApi } from '../api';

defineProps({ modelValue: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue']);

async function doUpload({ file }) {
  try {
    const data = await uploadApi.upload(file);
    emit('update:modelValue', data.url);
    ElMessage.success('上传成功');
  } catch (e) {
    /* 拦截器已提示 */
  }
}
</script>

<style scoped>
.img-upload {
  display: flex;
  align-items: center;
  gap: 12px;
}

.preview {
  width: 120px;
  height: 68px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #eee;
}
</style>
