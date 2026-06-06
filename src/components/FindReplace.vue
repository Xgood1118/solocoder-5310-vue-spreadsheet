<template>
  <div class="find-replace-modal" v-if="visible" @click.self="handleClose">
    <div class="modal-content">
      <div class="modal-header">
        <h3>查找替换</h3>
        <button class="close-btn" @click="handleClose">×</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label>查找内容</label>
          <input v-model="findText" type="text" placeholder="输入查找内容" @keyup.enter="handleFindNext" />
        </div>
        <div class="field">
          <label>替换为</label>
          <input v-model="replaceText" type="text" placeholder="输入替换内容" />
        </div>
        <div class="options">
          <label class="checkbox">
            <input type="checkbox" v-model="matchCase" />
            区分大小写
          </label>
          <label class="checkbox">
            <input type="checkbox" v-model="useRegex" />
            正则表达式
          </label>
          <label class="checkbox">
            <input type="checkbox" v-model="matchWhole" />
            全字匹配
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" @click="handleFindPrev">查找上一个</button>
        <button class="btn btn-primary" @click="handleFindNext">查找下一个</button>
        <button class="btn" @click="handleReplace">替换</button>
        <button class="btn btn-primary" @click="handleReplaceAll">全部替换</button>
        <button class="btn" @click="handleClose">关闭</button>
      </div>
      <div class="status" v-if="statusText">{{ statusText }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'find', 'replace', 'replace-all'])

const findText = ref('')
const replaceText = ref('')
const matchCase = ref(false)
const useRegex = ref(false)
const matchWhole = ref(false)
const statusText = ref('')

function handleClose() {
  emit('close')
}

function handleFindNext() {
  if (!findText.value) return
  emit('find', {
    text: findText.value,
    direction: 'next',
    matchCase: matchCase.value,
    useRegex: useRegex.value,
    matchWhole: matchWhole.value
  })
}

function handleFindPrev() {
  if (!findText.value) return
  emit('find', {
    text: findText.value,
    direction: 'prev',
    matchCase: matchCase.value,
    useRegex: useRegex.value,
    matchWhole: matchWhole.value
  })
}

function handleReplace() {
  if (!findText.value) return
  emit('replace', {
    find: findText.value,
    replace: replaceText.value,
    matchCase: matchCase.value,
    useRegex: useRegex.value,
    matchWhole: matchWhole.value
  })
}

function handleReplaceAll() {
  if (!findText.value) return
  emit('replace-all', {
    find: findText.value,
    replace: replaceText.value,
    matchCase: matchCase.value,
    useRegex: useRegex.value,
    matchWhole: matchWhole.value
  })
}

watch(() => props.visible, (val) => {
  if (val) {
    statusText.value = ''
  }
})

defineExpose({
  setStatus: (text) => { statusText.value = text }
})
</script>

<style scoped>
.find-replace-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  width: 400px;
  max-width: 90vw;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e0e0e0;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
}

.close-btn {
  border: none;
  background: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 0;
  width: 24px;
  height: 24px;
  line-height: 1;
}

.close-btn:hover {
  color: #333;
}

.modal-body {
  padding: 20px;
}

.field {
  margin-bottom: 12px;
}

.field label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: #333;
}

.field input[type="text"] {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #dadce0;
  border-radius: 4px;
  font-size: 13px;
}

.field input[type="text"]:focus {
  outline: none;
  border-color: #1a73e8;
}

.options {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 12px;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}

.checkbox input[type="checkbox"] {
  cursor: pointer;
}

.modal-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid #e0e0e0;
}

.btn {
  padding: 6px 14px;
  border: 1px solid #dadce0;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.btn:hover {
  background: #f1f3f4;
}

.btn-primary {
  background: #1a73e8;
  color: white;
  border-color: #1a73e8;
}

.btn-primary:hover {
  background: #1557b0;
}

.status {
  padding: 10px 20px;
  font-size: 13px;
  color: #666;
  border-top: 1px solid #f0f0f0;
}
</style>
