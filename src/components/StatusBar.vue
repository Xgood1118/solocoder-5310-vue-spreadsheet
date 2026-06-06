<template>
  <div class="statusbar">
    <div class="status-left">
      <span class="status-item" v-if="currentCell">{{ currentCell }}</span>
      <span class="status-item" v-if="editMode">编辑模式</span>
    </div>
    <div class="status-right">
      <span class="status-item" v-if="count !== null">计数: {{ count }}</span>
      <span class="status-item" v-if="sum !== null">求和: {{ formatNumber(sum) }}</span>
      <span class="status-item" v-if="average !== null">平均值: {{ formatNumber(average) }}</span>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  currentCell: {
    type: String,
    default: ''
  },
  editMode: {
    type: Boolean,
    default: false
  },
  count: {
    type: Number,
    default: null
  },
  sum: {
    type: Number,
    default: null
  },
  average: {
    type: Number,
    default: null
  }
})

function formatNumber(num) {
  if (num === null || num === undefined) return ''
  if (Math.abs(num) >= 1e12 || (Math.abs(num) < 1e-6 && num !== 0)) {
    return num.toExponential(4)
  }
  return Math.round(num * 100) / 100
}
</script>

<style scoped>
.statusbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 24px;
  padding: 0 12px;
  background: #f8f9fa;
  border-top: 1px solid #e0e0e0;
  font-size: 12px;
  color: #666;
}

.status-left, .status-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-item {
  display: inline-block;
}
</style>
