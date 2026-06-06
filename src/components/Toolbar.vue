<template>
  <div class="toolbar">
    <div class="toolbar-group">
      <button class="toolbar-btn" :disabled="!canUndo" @click="$emit('undo')" title="撤销 (Ctrl+Z)">
        <span class="icon">↶</span>
      </button>
      <button class="toolbar-btn" :disabled="!canRedo" @click="$emit('redo')" title="重做 (Ctrl+Y)">
        <span class="icon">↷</span>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button class="toolbar-btn" @click="$emit('cut')" title="剪切 (Ctrl+X)">
        <span class="icon">✂</span>
      </button>
      <button class="toolbar-btn" @click="$emit('copy')" title="复制 (Ctrl+C)">
        <span class="icon">⎘</span>
      </button>
      <button class="toolbar-btn" @click="$emit('paste')" title="粘贴 (Ctrl+V)">
        <span class="icon">📋</span>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button class="toolbar-btn" :class="{ active: isBold }" @click="$emit('toggle-bold')" title="加粗 (Ctrl+B)">
        <span class="icon" style="font-weight: bold;">B</span>
      </button>
      <button class="toolbar-btn" :class="{ active: isItalic }" @click="$emit('toggle-italic')" title="斜体 (Ctrl+I)">
        <span class="icon" style="font-style: italic;">I</span>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <select class="toolbar-select" :value="fontSize" @change="handleFontSizeChange" title="字号">
        <option v-for="size in fontSizes" :key="size" :value="size">{{ size }}</option>
      </select>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <label class="toolbar-color" title="字体颜色">
        <span class="color-label">A</span>
        <input type="color" :value="fontColor" @input="handleFontColor" />
      </label>
      <label class="toolbar-color" title="背景颜色">
        <span class="color-label bg-label">▢</span>
        <input type="color" :value="backgroundColor" @input="handleBgColor" />
      </label>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button class="toolbar-btn" :class="{ active: textAlign === 'left' }" @click="$emit('set-align', 'left')" title="左对齐">
        <span class="icon">⬌</span>
      </button>
      <button class="toolbar-btn" :class="{ active: textAlign === 'center' }" @click="$emit('set-align', 'center')" title="居中对齐">
        <span class="icon">═</span>
      </button>
      <button class="toolbar-btn" :class="{ active: textAlign === 'right' }" @click="$emit('set-align', 'right')" title="右对齐">
        <span class="icon">⟿</span>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button class="toolbar-btn" :class="{ active: isMerge }" @click="$emit('toggle-merge')" title="合并单元格">
        <span class="icon">⬚</span>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button class="toolbar-btn" @click="$emit('insert-row-above')" title="上方插入行">
        <span class="icon">⬆</span>
      </button>
      <button class="toolbar-btn" @click="$emit('insert-row-below')" title="下方插入行">
        <span class="icon">⬇</span>
      </button>
      <button class="toolbar-btn" @click="$emit('insert-col-left')" title="左侧插入列">
        <span class="icon">⬅</span>
      </button>
      <button class="toolbar-btn" @click="$emit('insert-col-right')" title="右侧插入列">
        <span class="icon">➡</span>
      </button>
      <button class="toolbar-btn" @click="$emit('delete-row')" title="删除行">
        <span class="icon">✕</span>
      </button>
      <button class="toolbar-btn" @click="$emit('delete-col')" title="删除列">
        <span class="icon">✖</span>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button class="toolbar-btn" @click="$emit('find-replace')" title="查找替换 (Ctrl+H)">
        <span class="icon">🔍</span>
      </button>
      <button class="toolbar-btn" @click="$emit('freeze-toggle')" title="冻结窗格">
        <span class="icon">❄</span>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <div class="toolbar-group">
      <button class="toolbar-btn" @click="$emit('export-csv')" title="导出 CSV">
        <span class="icon">📤</span>
      </button>
      <button class="toolbar-btn" @click="$emit('import-csv')" title="导入 CSV">
        <span class="icon">📥</span>
      </button>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
  isBold: { type: Boolean, default: false },
  isItalic: { type: Boolean, default: false },
  isMerge: { type: Boolean, default: false },
  textAlign: { type: String, default: 'left' },
  fontSize: { type: Number, default: 12 },
  fontColor: { type: String, default: '#000000' },
  backgroundColor: { type: String, default: '#ffffff' }
})

const emit = defineEmits([
  'undo', 'redo', 'cut', 'copy', 'paste',
  'toggle-bold', 'toggle-italic', 'set-align',
  'set-font-size', 'set-font-color', 'set-bg-color',
  'toggle-merge',
  'insert-row-above', 'insert-row-below', 'insert-col-left', 'insert-col-right',
  'delete-row', 'delete-col',
  'find-replace', 'freeze-toggle',
  'export-csv', 'import-csv'
])

const fontSizes = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48]

function handleFontSizeChange(e) {
  emit('set-font-size', parseInt(e.target.value, 10))
}

function handleFontColor(e) {
  emit('set-font-color', e.target.value)
}

function handleBgColor(e) {
  emit('set-bg-color', e.target.value)
}
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 8px;
  background: #f8f9fa;
  border-bottom: 1px solid #e0e0e0;
  flex-wrap: wrap;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: #e0e0e0;
  margin: 0 6px;
}

.toolbar-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #333;
}

.toolbar-btn:hover:not(:disabled) {
  background: #e8eaed;
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-btn.active {
  background: #d2e3fc;
  color: #1a73e8;
}

.toolbar-select {
  height: 28px;
  padding: 0 6px;
  border: 1px solid #dadce0;
  border-radius: 4px;
  background: white;
  font-size: 12px;
  cursor: pointer;
}

.toolbar-select:hover {
  border-color: #9aa0a6;
}

.toolbar-color {
  position: relative;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
}

.toolbar-color:hover {
  background: #e8eaed;
}

.toolbar-color input[type="color"] {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

.color-label {
  font-size: 16px;
  font-weight: bold;
  pointer-events: none;
}

.bg-label {
  color: #999;
}

.icon {
  font-size: 14px;
  line-height: 1;
}
</style>
