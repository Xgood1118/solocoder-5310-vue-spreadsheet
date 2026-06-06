<template>
  <div
    class="cell"
    :class="cellClass"
    :style="cellStyle"
    @click="handleClick"
    @dblclick="handleDoubleClick"
  >
    <span v-if="!isEditing" class="cell-content">{{ displayValue }}</span>
    <div
      v-if="isEditing"
      ref="editorRef"
      class="cell-editor"
      contenteditable="true"
      @blur="handleBlur"
      @keydown="handleKeyDown"
      @input="handleInput"
    ></div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { getCellDisplayValue, getCellDataType } from '../utils/helpers.js'

const props = defineProps({
  cell: {
    type: Object,
    default: null
  },
  computedValue: {
    type: [String, Number, Boolean, Date, Object],
    default: null
  },
  isSelected: {
    type: Boolean,
    default: false
  },
  isEditing: {
    type: Boolean,
    default: false
  },
  isHighlighted: {
    type: Boolean,
    default: false
  },
  row: {
    type: Number,
    required: true
  },
  col: {
    type: Number,
    required: true
  }
})

const emit = defineEmits(['click', 'dblclick', 'edit-start', 'edit-commit', 'edit-cancel'])

const editorRef = ref(null)
const editValue = ref('')

const displayValue = computed(() => {
  if (props.cell && props.isEditing) {
    return props.cell.formula || props.cell.value
  }
  return getCellDisplayValue(props.cell, props.computedValue)
})

const dataType = computed(() => {
  return getCellDataType(props.cell, props.computedValue)
})

const cellClass = computed(() => {
  return {
    'cell-selected': props.isSelected,
    'cell-editing': props.isEditing,
    'cell-highlighted': props.isHighlighted,
    'cell-error': displayValue.value && typeof displayValue.value === 'string' && displayValue.value.startsWith('#'),
    [`cell-type-${dataType.value}`]: true,
    'cell-bold': props.cell?.bold,
    'cell-italic': props.cell?.italic,
    'cell-underline': props.cell?.underline,
    [`cell-align-${props.cell?.textAlign || 'left'}`]: true,
    [`cell-valign-${props.cell?.verticalAlign || 'middle'}`]: true,
    'cell-wrap': props.cell?.wrap
  }
})

const cellStyle = computed(() => {
  const style = {}
  if (props.cell) {
    if (props.cell.fontSize) {
      style.fontSize = props.cell.fontSize + 'px'
    }
    if (props.cell.fontColor) {
      style.color = props.cell.fontColor
    }
    if (props.cell.backgroundColor) {
      style.backgroundColor = props.cell.backgroundColor
    }
    if (props.cell.fontFamily) {
      style.fontFamily = props.cell.fontFamily
    }
  }
  return style
})

function handleClick(e) {
  emit('click', { row: props.row, col: props.col, event: e })
}

function handleDoubleClick(e) {
  emit('dblclick', { row: props.row, col: props.col, event: e })
}

function handleBlur() {
  if (props.isEditing && editorRef.value) {
    const value = editorRef.value.innerText
    commitEdit(value)
  }
}

function handleKeyDown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('edit-cancel', { row: props.row, col: props.col })
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (editorRef.value) {
      const value = editorRef.value.innerText
      commitEdit(value)
    }
  } else if (e.key === 'Tab') {
    e.preventDefault()
    if (editorRef.value) {
      const value = editorRef.value.innerText
      emit('edit-commit', { row: props.row, col: props.col, value, direction: e.shiftKey ? 'left' : 'right' })
    }
  }
}

function handleInput() {
  if (editorRef.value) {
    editValue.value = editorRef.value.innerText
  }
}

function commitEdit(value) {
  emit('edit-commit', { row: props.row, col: props.col, value, direction: 'down' })
}

function focusEditor() {
  nextTick(() => {
    if (editorRef.value) {
      editorRef.value.innerText = props.cell?.formula || props.cell?.value || ''
      editorRef.value.focus()
      const range = document.createRange()
      range.selectNodeContents(editorRef.value)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    }
  })
}

watch(() => props.isEditing, (newVal) => {
  if (newVal) {
    focusEditor()
  }
})

onMounted(() => {
  if (props.isEditing) {
    focusEditor()
  }
})

defineExpose({
  focusEditor
})
</script>

<style scoped>
.cell {
  position: relative;
  width: 100%;
  height: 100%;
  border-right: 1px solid #e0e0e0;
  border-bottom: 1px solid #e0e0e0;
  padding: 2px 4px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
  cursor: cell;
  user-select: none;
  background: white;
  display: flex;
  align-items: center;
}

.cell-content {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-selected {
  outline: 2px solid #1a73e8;
  outline-offset: -2px;
  z-index: 10;
}

.cell-editing {
  overflow: visible;
  z-index: 20;
  background: white;
}

.cell-highlighted {
  outline: 2px solid #4285f4;
  outline-offset: -2px;
  background: rgba(66, 133, 244, 0.1);
}

.cell-error {
  color: #d93025 !important;
  background: #fce8e6;
}

.cell-type-number {
  text-align: right;
}

.cell-type-boolean {
  text-align: center;
}

.cell-type-string {
  text-align: left;
}

.cell-bold {
  font-weight: bold;
}

.cell-italic {
  font-style: italic;
}

.cell-underline {
  text-decoration: underline;
}

.cell-align-left {
  justify-content: flex-start;
}

.cell-align-center {
  justify-content: center;
}

.cell-align-right {
  justify-content: flex-end;
}

.cell-valign-top {
  align-items: flex-start;
}

.cell-valign-middle {
  align-items: center;
}

.cell-valign-bottom {
  align-items: flex-end;
}

.cell-wrap {
  white-space: normal;
  word-wrap: break-word;
}

.cell-editor {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 2px 4px;
  background: white;
  border: none;
  outline: none;
  font-size: inherit;
  font-family: inherit;
  color: inherit;
  min-width: 100%;
  box-sizing: border-box;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow: auto;
}

.cell-editor:focus {
  outline: none;
}
</style>
