<template>
  <el-tag :type="map[status] || 'info'" size="small">{{ text }}</el-tag>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  status: { type: String, required: true },
});

const MAP = {
  // 老师审核
  pending: { type: 'warning', text: '待审核' },
  approved: { type: 'success', text: '已通过' },
  rejected: { type: 'danger', text: '已驳回' },
  // 课程状态
  recruiting: { type: 'primary', text: '拼团中' },
  formed: { type: 'success', text: '已成团' },
  failed: { type: 'info', text: '已流局' },
  cancelled: { type: 'danger', text: '已取消' },
  finished: { type: 'info', text: '已结束' },
};

const map = computed(() => MAP[props.status] || { type: 'info', text: props.status });
const text = computed(() => map.value.text);
</script>
