<template>
  <div class="sheet-tabs">
    <div class="tabs-container" ref="tabsContainer">
      <div
        v-for="(sheet, index) in sheets"
        :key="sheet.id"
        class="sheet-tab"
        :class="{ active: currentSheet === sheet.id, editing: editingSheet === sheet.id }"
        @click="handleSheetClick(sheet.id)"
        @dblclick="startRename(sheet.id)"
        draggable="true"
        @dragstart="handleDragStart($event, index)"
        @dragover="handleDragOver($event, index)"
        @drop="handleDrop($event, index)"
        @dragend="handleDragEnd"
      >
        <span v-if="editingSheet !== sheet.id" class="tab-name">{{ sheet.name }}</span>
        <input
          v-else
          ref="renameInput"
          class="rename-input"
          :value="sheet.name"
          @blur="finishRename"
          @keydown="handleRenameKeydown"
          @click.stop
        />
      </div>
    </div>
    <button class="add-sheet-btn" @click="$emit('add-sheet')" title="新建工作表">
      <span>+</span>
    </button>
    <div class="sheet-menu" v-if="contextMenu.visible">
      <div class="menu-item" @click="handleRename">重命名</div>
      <div class="menu-item danger" @click="handleDelete">删除</div>
      <div class="menu-item" @click="$emit('duplicate-sheet', contextMenu.sheetId)">复制</div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, nextTick, computed } from 'vue'

const props = defineProps({
  sheets: {
    type: Array,
    required: true
  },
  currentSheet: {
    type: String,
    required: true
  }
})

const emit = defineEmits([
  'change-sheet', 'add-sheet', 'rename-sheet', 'delete-sheet', 'reorder-sheets', 'duplicate-sheet'
])

const tabsContainer = ref(null)
const renameInput = ref(null)
const editingSheet = ref(null)
const contextMenu = reactive({
  visible: false,
  sheetId: null,
  x: 0,
  y: 0
})

const dragIndex = ref(null)

function handleSheetClick(id) {
  emit('change-sheet', id)
}

function startRename(id) {
  editingSheet.value = id
  nextTick(() => {
    if (renameInput.value && renameInput.value[0]) {
      renameInput.value[0].focus()
      renameInput.value[0].select()
    }
  })
}

function finishRename(e) {
  const newName = e.target.value.trim()
  if (newName && editingSheet.value) {
    emit('rename-sheet', { id: editingSheet.value, name: newName })
  }
  editingSheet.value = null
}

function handleRenameKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    finishRename(e)
  } else if (e.key === 'Escape') {
    editingSheet.value = null
  }
}

function handleRename() {
  if (contextMenu.sheetId) {
    startRename(contextMenu.sheetId)
  }
  contextMenu.visible = false
}

function handleDelete() {
  if (contextMenu.sheetId && props.sheets.length > 1) {
    if (confirm('确定要删除这个工作表吗？')) {
      emit('delete-sheet', contextMenu.sheetId)
    }
  }
  contextMenu.visible = false
}

function handleDragStart(e, index) {
  dragIndex.value = index
  e.dataTransfer.effectAllowed = 'move'
}

function handleDragOver(e, index) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
}

function handleDrop(e, index) {
  e.preventDefault()
  if (dragIndex.value !== null && dragIndex.value !== index) {
    emit('reorder-sheets', { from: dragIndex.value, to: index })
  }
  dragIndex.value = null
}

function handleDragEnd() {
  dragIndex.value = null
}
</script>

<style scoped>
.sheet-tabs {
  display: flex;
  align-items: center;
  height: 32px;
  background: #f8f9fa;
  border-top: 1px solid #e0e0e0;
  padding: 0 8px;
  position: relative;
}

.tabs-container {
  display: flex;
  align-items: flex-end;
  flex: 1;
  overflow-x: auto;
  gap: 2px;
}

.sheet-tab {
  position: relative;
  padding: 4px 16px;
  background: #e8eaed;
  border: 1px solid #dadce0;
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
  min-width: 80px;
  text-align: center;
  user-select: none;
}

.sheet-tab:hover {
  background: #dadce0;
}

.sheet-tab.active {
  background: white;
  border-color: #dadce0;
  font-weight: 500;
}

.sheet-tab.editing {
  padding: 2px 8px;
}

.tab-name {
  display: block;
}

.rename-input {
  width: 100%;
  border: 1px solid #1a73e8;
  padding: 2px 4px;
  font-size: 12px;
  outline: none;
}

.add-sheet-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 18px;
  color: #666;
  margin-left: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-sheet-btn:hover {
  background: #e8eaed;
}

.sheet-menu {
  position: absolute;
  bottom: 100%;
  background: white;
  border: 1px solid #dadce0;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 120px;
}

.menu-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
}

.menu-item:hover {
  background: #f1f3f4;
}

.menu-item.danger {
  color: #d93025;
}
</style>
