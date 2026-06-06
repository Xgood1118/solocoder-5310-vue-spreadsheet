<template>
  <div class="spreadsheet-container" tabindex="0" @keydown="handleKeydown" ref="containerRef">
    <Toolbar
      :can-undo="history.canUndo()"
      :can-redo="history.canRedo()"
      :is-bold="selectionBold"
      :is-italic="selectionItalic"
      :text-align="selectionAlign"
      :font-size="selectionFontSize"
      :font-color="selectionFontColor"
      :background-color="selectionBgColor"
      :is-merge="selectionMerged"
      @undo="handleUndo"
      @redo="handleRedo"
      @cut="handleCut"
      @copy="handleCopy"
      @paste="handlePaste"
      @toggle-bold="handleToggleBold"
      @toggle-italic="handleToggleItalic"
      @set-align="handleSetAlign"
      @set-font-size="handleSetFontSize"
      @set-font-color="handleSetFontColor"
      @set-bg-color="handleSetBgColor"
      @toggle-merge="handleToggleMerge"
      @insert-row-above="handleInsertRowAbove"
      @insert-row-below="handleInsertRowBelow"
      @insert-col-left="handleInsertColLeft"
      @insert-col-right="handleInsertColRight"
      @delete-row="handleDeleteRow"
      @delete-col="handleDeleteCol"
      @find-replace="showFindReplace = true"
      @freeze-toggle="handleToggleFreeze"
      @export-csv="handleExportCsv"
      @import-csv="handleImportCsv"
    />

    <div class="formula-bar">
      <div class="cell-reference">{{ currentCellRef }}</div>
      <div class="formula-input-wrapper">
        <span class="fx-label">fx</span>
        <input
          ref="formulaInput"
          class="formula-input"
          type="text"
          :value="currentCellFormula"
          @input="handleFormulaInput"
          @keydown="handleFormulaKeydown"
          @focus="handleFormulaFocus"
          placeholder="输入值或公式（以 = 开头）"
        />
      </div>
    </div>

    <div class="grid-wrapper" ref="gridWrapper">
      <div class="corner-header"></div>

      <div class="col-headers" ref="colHeaders">
        <div
          v-for="col in visibleCols"
          :key="col.index"
          class="col-header"
          :class="{ selected: isColSelected(col.index) }"
          :style="{
            left: col.left + 'px',
            width: col.width + 'px'
          }"
          @click="handleColHeaderClick(col.index)"
        >
          {{ col.name }}
          <div class="col-resize-handle" @mousedown.stop="startColResize(col.index, $event)"></div>
        </div>
      </div>

      <div class="row-headers" ref="rowHeaders">
        <div
          v-for="row in visibleRows"
          :key="row.index"
          class="row-header"
          :class="{ selected: isRowSelected(row.index) }"
          :style="{
            top: row.top + 'px',
            height: row.height + 'px'
          }"
          @click="handleRowHeaderClick(row.index)"
        >
          {{ row.index + 1 }}
          <div class="row-resize-handle" @mousedown.stop="startRowResize(row.index, $event)"></div>
        </div>
      </div>

      <div class="cells-container" ref="cellsContainer" @scroll="handleScroll" @mousedown="handleGridMouseDown">
        <div class="cells-content" :style="cellsContentStyle">
          <div
            v-for="row in visibleRows"
            :key="row.index"
            class="grid-row"
            :style="{
              top: row.top + 'px',
              height: row.height + 'px'
            }"
          >
            <div
              v-for="col in visibleCols"
              :key="col.index + '-' + row.index"
              class="cell-wrapper"
              :style="{
                position: 'absolute',
                left: col.left + 'px',
                width: col.width + 'px',
                height: row.height + 'px'
              }"
            >
              <CellRenderer
                :cell="getCell(row.index, col.index)"
                :computed-value="getComputedValue(row.index, col.index)"
                :is-selected="isCellSelected(row.index, col.index)"
                :is-editing="isEditing && editingRow === row.index && editingCol === col.index"
                :is-highlighted="isHighlighted(row.index, col.index)"
                :row="row.index"
                :col="col.index"
                @click="handleCellClick"
                @dblclick="handleCellDblClick"
                @edit-start="handleEditStart"
                @edit-commit="handleEditCommit"
                @edit-cancel="handleEditCancel"
              />
            </div>
          </div>

          <div class="selection-highlight" v-if="selectionActive" :style="selectionStyle"></div>
          <div class="fill-handle" v-if="selectionActive && !isEditing" :style="fillHandleStyle" @mousedown="startFill"></div>
        </div>
      </div>
    </div>

    <StatusBar
      :current-cell="currentCellRef"
      :edit-mode="isEditing"
      :count="selectionCount"
      :sum="selectionSum"
      :average="selectionAverage"
    />

    <SheetTabs
      :sheets="sheets"
      :current-sheet="currentSheetId"
      @change-sheet="handleChangeSheet"
      @add-sheet="handleAddSheet"
      @rename-sheet="handleRenameSheet"
      @delete-sheet="handleDeleteSheet"
      @reorder-sheets="handleReorderSheets"
      @duplicate-sheet="handleDuplicateSheet"
    />

    <FindReplace
      :visible="showFindReplace"
      @close="showFindReplace = false"
      @find="handleFind"
      @replace="handleReplace"
      @replace-all="handleReplaceAll"
      ref="findReplaceRef"
    />

    <input type="file" ref="csvFileInput" accept=".csv" style="display: none" @change="handleCsvFileSelect" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'
import Toolbar from './Toolbar.vue'
import StatusBar from './StatusBar.vue'
import SheetTabs from './SheetTabs.vue'
import CellRenderer from './CellRenderer.vue'
import FindReplace from './FindReplace.vue'
import { FormulaEngine, colIndexToName, colNameToIndex, parseCellRef, isError } from '../utils/formulaParser.js'
import { HistoryManager } from '../utils/history.js'
import { saveToStorage, loadFromStorage } from '../utils/storage.js'
import { deepClone, debounce, generateId } from '../utils/helpers.js'

const STORAGE_KEY = 'spreadsheet_main'
const DEFAULT_ROW_COUNT = 1000
const DEFAULT_COL_COUNT = 100
const DEFAULT_ROW_HEIGHT = 24
const DEFAULT_COL_WIDTH = 80
const HEADER_HEIGHT = 24
const HEADER_WIDTH = 40

const containerRef = ref(null)
const gridWrapper = ref(null)
const cellsContainer = ref(null)
const formulaInput = ref(null)
const csvFileInput = ref(null)
const findReplaceRef = ref(null)

const scrollTop = ref(0)
const scrollLeft = ref(0)
const viewportHeight = ref(600)
const viewportWidth = ref(800)

const currentSheetId = ref(null)
const sheets = ref([])
const sheetData = reactive({})

const history = reactive(new HistoryManager())

const formulaEngine = new FormulaEngine()

const selectionStart = reactive({ row: 0, col: 0 })
const selectionEnd = reactive({ row: 0, col: 0 })
const selectionActive = ref(true)
const isSelecting = ref(false)

const isEditing = ref(false)
const editingRow = ref(0)
const editingCol = ref(0)

const showFindReplace = ref(false)

const rowHeights = reactive({})
const colWidths = reactive({})

const mergedCells = ref([])

const freezeRows = ref(0)
const freezeCols = ref(0)

const highlightedCells = ref([])

function createDefaultSheet(name) {
  const id = generateId()
  return {
    id,
    name,
    data: {},
    rowCount: DEFAULT_ROW_COUNT,
    colCount: DEFAULT_COL_COUNT
  }
}

function initSheets() {
  const saved = loadFromStorage(STORAGE_KEY)
  if (saved && saved.sheets && saved.sheets.length > 0) {
    sheets.value = saved.sheets
    currentSheetId.value = saved.currentSheetId || sheets.value[0].id
    
    for (const sheet of saved.sheets) {
      sheetData[sheet.id] = sheet.data || {}
    }
    
    if (saved.rowHeights) Object.assign(rowHeights, saved.rowHeights)
    if (saved.colWidths) Object.assign(colWidths, saved.colWidths)
    if (saved.mergedCells) mergedCells.value = saved.mergedCells
    if (saved.freezeRows !== undefined) freezeRows.value = saved.freezeRows
    if (saved.freezeCols !== undefined) freezeCols.value = saved.freezeCols
  } else {
    const sheet1 = createDefaultSheet('Sheet1')
    const sheet2 = createDefaultSheet('Sheet2')
    sheets.value = [sheet1, sheet2]
    currentSheetId.value = sheet1.id
    sheetData[sheet1.id] = {}
    sheetData[sheet2.id] = {}
    
    setCell(0, 0, { value: '项目' })
    setCell(0, 1, { value: '1月' })
    setCell(0, 2, { value: '2月' })
    setCell(0, 3, { value: '合计' })
    setCell(1, 0, { value: '餐饮' })
    setCell(1, 1, { value: 1200 })
    setCell(1, 2, { value: 1500 })
    setCell(1, 3, { value: '=SUM(B2:C2)' })
    setCell(2, 0, { value: '交通' })
    setCell(2, 1, { value: 300 })
    setCell(2, 2, { value: 450 })
    setCell(2, 3, { value: '=SUM(B3:C3)' })
    setCell(3, 0, { value: '住宿' })
    setCell(3, 1, { value: 2000 })
    setCell(3, 2, { value: 2000 })
    setCell(3, 3, { value: '=SUM(B4:C4)' })
    setCell(4, 0, { value: '总计' })
    setCell(4, 1, { value: '=SUM(B2:B4)' })
    setCell(4, 2, { value: '=SUM(C2:C4)' })
    setCell(4, 3, { value: '=SUM(D2:D4)' })
  }
  
  updateFormulaEngine()
}

function updateFormulaEngine() {
  for (const sheet of sheets.value) {
    formulaEngine.setSheet(sheet.name, getSheetDataArray(sheet.id))
  }
}

function getSheetDataArray(sheetId) {
  const data = sheetData[sheetId] || {}
  const result = []
  const sheet = sheets.value.find(s => s.id === sheetId)
  const rowCount = sheet?.rowCount || DEFAULT_ROW_COUNT
  const colCount = sheet?.colCount || DEFAULT_COL_COUNT
  
  for (let r = 0; r < rowCount; r++) {
    const row = []
    for (let c = 0; c < colCount; c++) {
      const key = `${r},${c}`
      row.push(data[key] || null)
    }
    result.push(row)
  }
  return result
}

function getCell(row, col) {
  const data = sheetData[currentSheetId.value] || {}
  return data[`${row},${col}`] || null
}

function setCell(row, col, cell) {
  if (!sheetData[currentSheetId.value]) {
    sheetData[currentSheetId.value] = {}
  }
  const key = `${row},${col}`
  if (cell === null || cell === undefined) {
    delete sheetData[currentSheetId.value][key]
  } else {
    sheetData[currentSheetId.value][key] = cell
  }
}

function getComputedValue(row, col) {
  const cell = getCell(row, col)
  if (!cell || cell.value === undefined || cell.value === null) {
    return undefined
  }
  if (typeof cell.value !== 'string' || !cell.value.startsWith('=')) {
    return cell.value
  }
  
  const sheetName = currentSheet.value?.name
  if (!sheetName) return cell.value
  
  try {
    const result = formulaEngine.getCellValue(sheetName, col, row)
    return result
  } catch (e) {
    return '#ERROR!'
  }
}

const currentSheet = computed(() => {
  return sheets.value.find(s => s.id === currentSheetId.value)
})

const currentCellRef = computed(() => {
  const col = colIndexToName(selectionStart.col)
  const row = selectionStart.row + 1
  return `${col}${row}`
})

const currentCellFormula = computed(() => {
  const cell = getCell(selectionStart.row, selectionStart.col)
  if (!cell) return ''
  if (cell.value === undefined || cell.value === null) return ''
  return String(cell.value)
})

const visibleRows = computed(() => {
  const sheet = currentSheet.value
  if (!sheet) return []
  
  const rowCount = sheet.rowCount || DEFAULT_ROW_COUNT
  const rows = []
  let currentTop = 0
  
  const startRow = Math.max(0, Math.floor(scrollTop.value / DEFAULT_ROW_HEIGHT) - 10)
  const visibleCount = Math.ceil(viewportHeight.value / DEFAULT_ROW_HEIGHT) + 20
  const endRow = Math.min(rowCount, startRow + visibleCount)
  
  for (let i = 0; i < startRow; i++) {
    currentTop += rowHeights[i] || DEFAULT_ROW_HEIGHT
  }
  
  for (let i = startRow; i < endRow; i++) {
    const height = rowHeights[i] || DEFAULT_ROW_HEIGHT
    rows.push({
      index: i,
      top: currentTop,
      height
    })
    currentTop += height
  }
  
  return rows
})

const visibleCols = computed(() => {
  const sheet = currentSheet.value
  if (!sheet) return []
  
  const colCount = sheet.colCount || DEFAULT_COL_COUNT
  const cols = []
  let currentLeft = 0
  
  const startCol = Math.max(0, Math.floor(scrollLeft.value / DEFAULT_COL_WIDTH) - 10)
  const visibleCount = Math.ceil(viewportWidth.value / DEFAULT_COL_WIDTH) + 20
  const endCol = Math.min(colCount, startCol + visibleCount)
  
  for (let i = 0; i < startCol; i++) {
    currentLeft += colWidths[i] || DEFAULT_COL_WIDTH
  }
  
  for (let i = startCol; i < endCol; i++) {
    const width = colWidths[i] || DEFAULT_COL_WIDTH
    cols.push({
      index: i,
      left: currentLeft,
      width,
      name: colIndexToName(i)
    })
    currentLeft += width
  }
  
  return cols
})

const totalWidth = computed(() => {
  const sheet = currentSheet.value
  if (!sheet) return 0
  const colCount = sheet.colCount || DEFAULT_COL_COUNT
  let total = 0
  for (let i = 0; i < colCount; i++) {
    total += colWidths[i] || DEFAULT_COL_WIDTH
  }
  return total
})

const totalHeight = computed(() => {
  const sheet = currentSheet.value
  if (!sheet) return 0
  const rowCount = sheet.rowCount || DEFAULT_ROW_COUNT
  let total = 0
  for (let i = 0; i < rowCount; i++) {
    total += rowHeights[i] || DEFAULT_ROW_HEIGHT
  }
  return total
})

const cellsContentStyle = computed(() => ({
  width: totalWidth.value + 'px',
  height: totalHeight.value + 'px',
  position: 'relative'
}))

function isCellSelected(row, col) {
  const minRow = Math.min(selectionStart.row, selectionEnd.row)
  const maxRow = Math.max(selectionStart.row, selectionEnd.row)
  const minCol = Math.min(selectionStart.col, selectionEnd.col)
  const maxCol = Math.max(selectionStart.col, selectionEnd.col)
  
  return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol
}

function isColSelected(col) {
  const minCol = Math.min(selectionStart.col, selectionEnd.col)
  const maxCol = Math.max(selectionStart.col, selectionEnd.col)
  return col >= minCol && col <= maxCol
}

function isRowSelected(row) {
  const minRow = Math.min(selectionStart.row, selectionEnd.row)
  const maxRow = Math.max(selectionStart.row, selectionEnd.row)
  return row >= minRow && row <= maxRow
}

function isHighlighted(row, col) {
  return highlightedCells.value.some(h => h.row === row && h.col === col)
}

const selectionStyle = computed(() => {
  const minRow = Math.min(selectionStart.row, selectionEnd.row)
  const maxRow = Math.max(selectionStart.row, selectionEnd.row)
  const minCol = Math.min(selectionStart.col, selectionEnd.col)
  const maxCol = Math.max(selectionStart.col, selectionEnd.col)
  
  let top = 0
  let left = 0
  let height = 0
  let width = 0
  
  for (let i = 0; i < minRow; i++) {
    top += rowHeights[i] || DEFAULT_ROW_HEIGHT
  }
  for (let i = 0; i < minCol; i++) {
    left += colWidths[i] || DEFAULT_COL_WIDTH
  }
  for (let i = minRow; i <= maxRow; i++) {
    height += rowHeights[i] || DEFAULT_ROW_HEIGHT
  }
  for (let i = minCol; i <= maxCol; i++) {
    width += colWidths[i] || DEFAULT_COL_WIDTH
  }
  
  return {
    left: left + 'px',
    top: top + 'px',
    width: width + 'px',
    height: height + 'px'
  }
})

const fillHandleStyle = computed(() => {
  const style = selectionStyle.value
  return {
    left: (parseFloat(style.left) + parseFloat(style.width) - 4) + 'px',
    top: (parseFloat(style.top) + parseFloat(style.height) - 4) + 'px',
    width: '8px',
    height: '8px'
  }
})

function getSelectionBounds() {
  return {
    startRow: Math.min(selectionStart.row, selectionEnd.row),
    endRow: Math.max(selectionStart.row, selectionEnd.row),
    startCol: Math.min(selectionStart.col, selectionEnd.col),
    endCol: Math.max(selectionStart.col, selectionEnd.col)
  }
}

const selectionBold = computed(() => {
  const { startRow, endRow, startCol, endCol } = getSelectionBounds()
  let hasBold = false
  let hasNormal = false
  
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = getCell(r, c)
      if (cell && cell.bold) hasBold = true
      else hasNormal = true
      if (hasBold && hasNormal) return false
    }
  }
  return hasBold
})

const selectionItalic = computed(() => {
  const { startRow, endRow, startCol, endCol } = getSelectionBounds()
  let hasItalic = false
  let hasNormal = false
  
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = getCell(r, c)
      if (cell && cell.italic) hasItalic = true
      else hasNormal = true
      if (hasItalic && hasNormal) return false
    }
  }
  return hasItalic
})

const selectionAlign = computed(() => {
  const { startRow, endRow, startCol, endCol } = getSelectionBounds()
  let align = null
  
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = getCell(r, c)
      const cellAlign = cell?.textAlign || 'left'
      if (align === null) align = cellAlign
      else if (align !== cellAlign) return 'left'
    }
  }
  return align || 'left'
})

const selectionFontSize = computed(() => {
  const { startRow, endRow, startCol, endCol } = getSelectionBounds()
  let size = null
  
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = getCell(r, c)
      const cellSize = cell?.fontSize || 12
      if (size === null) size = cellSize
      else if (size !== cellSize) return 12
    }
  }
  return size || 12
})

const selectionFontColor = computed(() => {
  const { startRow, endRow, startCol, endCol } = getSelectionBounds()
  let color = null
  
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = getCell(r, c)
      const cellColor = cell?.fontColor || '#000000'
      if (color === null) color = cellColor
      else if (color !== cellColor) return '#000000'
    }
  }
  return color || '#000000'
})

const selectionBgColor = computed(() => {
  const { startRow, endRow, startCol, endCol } = getSelectionBounds()
  let color = null
  
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = getCell(r, c)
      const cellColor = cell?.backgroundColor || '#ffffff'
      if (color === null) color = cellColor
      else if (color !== cellColor) return '#ffffff'
    }
  }
  return color || '#ffffff'
})

const selectionMerged = computed(() => {
  const { startRow, endRow, startCol, endCol } = getSelectionBounds()
  return mergedCells.value.some(m => 
    m.startRow === startRow && m.endRow === endRow &&
    m.startCol === startCol && m.endCol === endCol
  )
})

const selectionCount = computed(() => {
  const { startRow, endRow, startCol, endCol } = getSelectionBounds()
  let count = 0
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const val = getComputedValue(r, c)
      if (val !== undefined && val !== null && val !== '') {
        const num = Number(val)
        if (!isNaN(num) && typeof val !== 'boolean') count++
      }
    }
  }
  return count
})

const selectionSum = computed(() => {
  const { startRow, endRow, startCol, endCol } = getSelectionBounds()
  let sum = 0
  let hasValue = false
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const val = getComputedValue(r, c)
      if (val !== undefined && val !== null && val !== '') {
        const num = Number(val)
        if (!isNaN(num) && typeof val !== 'boolean') {
          sum += num
          hasValue = true
        }
      }
    }
  }
  return hasValue ? sum : null
})

const selectionAverage = computed(() => {
  const count = selectionCount.value
  const sum = selectionSum.value
  if (count === 0 || sum === null) return null
  return sum / count
})

function handleScroll(e) {
  scrollTop.value = e.target.scrollTop
  scrollLeft.value = e.target.scrollLeft
  
  const colHeaders = document.querySelector('.col-headers')
  const rowHeaders = document.querySelector('.row-headers')
  if (colHeaders) colHeaders.scrollLeft = e.target.scrollLeft
  if (rowHeaders) rowHeaders.scrollTop = e.target.scrollTop
}

function handleCellClick({ row, col }) {
  if (isEditing.value) {
    commitCurrentEdit()
  }
  selectionStart.row = row
  selectionStart.col = col
  selectionEnd.row = row
  selectionEnd.col = col
  selectionActive.value = true
  
  updateHighlightedCells()
}

function handleCellDblClick({ row, col }) {
  startEditing(row, col)
}

function handleGridMouseDown(e) {
  if (e.target.closest('.cell')) return
  if (e.target.closest('.col-header') || e.target.closest('.row-header')) return
  
  isSelecting.value = true
  
  const rect = cellsContainer.value.getBoundingClientRect()
  const x = e.clientX - rect.left + scrollLeft.value
  const y = e.clientY - rect.top + scrollTop.value
  
  const col = Math.floor(x / DEFAULT_COL_WIDTH)
  const row = Math.floor(y / DEFAULT_ROW_HEIGHT)
  
  selectionStart.row = Math.max(0, Math.min((currentSheet.value?.rowCount || DEFAULT_ROW_COUNT) - 1, row))
  selectionStart.col = Math.max(0, Math.min((currentSheet.value?.colCount || DEFAULT_COL_COUNT) - 1, col))
  selectionEnd.row = selectionStart.row
  selectionEnd.col = selectionStart.col
  selectionActive.value = true
  
  document.addEventListener('mousemove', handleGridMouseMove)
  document.addEventListener('mouseup', handleGridMouseUp)
}

function handleGridMouseMove(e) {
  if (!isSelecting.value) return
  
  const rect = cellsContainer.value.getBoundingClientRect()
  const x = e.clientX - rect.left + scrollLeft.value
  const y = e.clientY - rect.top + scrollTop.value
  
  const col = Math.max(0, Math.min((currentSheet.value?.colCount || DEFAULT_COL_COUNT) - 1, Math.floor(x / DEFAULT_COL_WIDTH)))
  const row = Math.max(0, Math.min((currentSheet.value?.rowCount || DEFAULT_ROW_COUNT) - 1, Math.floor(y / DEFAULT_ROW_HEIGHT)))
  
  selectionEnd.row = row
  selectionEnd.col = col
}

function handleGridMouseUp() {
  isSelecting.value = false
  document.removeEventListener('mousemove', handleGridMouseMove)
  document.removeEventListener('mouseup', handleGridMouseUp)
}

function startEditing(row, col) {
  isEditing.value = true
  editingRow.value = row
  editingCol.value = col
}

function handleEditStart({ row, col }) {
  startEditing(row, col)
}

function handleEditCommit({ row, col, value, direction }) {
  commitEdit(row, col, value)
  isEditing.value = false
  
  if (direction === 'down') {
    moveSelection(1, 0)
  } else if (direction === 'right') {
    moveSelection(0, 1)
  } else if (direction === 'left') {
    moveSelection(0, -1)
  }
}

function handleEditCancel() {
  isEditing.value = false
}

function commitEdit(row, col, value) {
  const oldCell = getCell(row, col)
  
  let parsedValue = value
  if (value && typeof value === 'string' && !value.startsWith('=')) {
    const num = Number(value)
    if (!isNaN(num) && value.trim() !== '') {
      parsedValue = num
    }
  }
  
  const newCell = { ...oldCell, value: parsedValue }
  
  pushHistory({
    type: 'edit',
    sheetId: currentSheetId.value,
    row,
    col,
    oldValue: oldCell ? oldCell.value : null,
    newValue: parsedValue
  })
  
  setCell(row, col, newCell)
  
  formulaEngine.invalidateAll()
  updateHighlightedCells()
  scheduleSave()
}

function commitCurrentEdit() {
  if (!isEditing.value) return
  
  const editor = document.querySelector('.cell-editor')
  if (editor) {
    const value = editor.innerText
    commitEdit(editingRow.value, editingCol.value, value)
  }
  
  isEditing.value = false
}

function handleKeydown(e) {
  if (showFindReplace.value) return
  
  const isCtrl = e.ctrlKey || e.metaKey
  
  if (isCtrl && e.key === 'z') {
    e.preventDefault()
    handleUndo()
    return
  }
  
  if (isCtrl && e.key === 'y') {
    e.preventDefault()
    handleRedo()
    return
  }
  
  if (isCtrl && e.key === 'c') {
    e.preventDefault()
    handleCopy()
    return
  }
  
  if (isCtrl && e.key === 'x') {
    e.preventDefault()
    handleCut()
    return
  }
  
  if (isCtrl && e.key === 'v') {
    e.preventDefault()
    handlePaste()
    return
  }
  
  if (isCtrl && e.key === 'b') {
    e.preventDefault()
    handleToggleBold()
    return
  }
  
  if (isCtrl && e.key === 'i') {
    e.preventDefault()
    handleToggleItalic()
    return
  }
  
  if (isCtrl && e.key === 'h') {
    e.preventDefault()
    showFindReplace.value = true
    return
  }
  
  if (e.key === 'F2') {
    e.preventDefault()
    startEditing(selectionStart.row, selectionStart.col)
    return
  }
  
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (isEditing.value) return
    e.preventDefault()
    clearSelection()
    return
  }
  
  if (isEditing.value) {
    return
  }
  
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || 
      e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault()
    
    let dr = 0, dc = 0
    if (e.key === 'ArrowUp') dr = -1
    if (e.key === 'ArrowDown') dr = 1
    if (e.key === 'ArrowLeft') dc = -1
    if (e.key === 'ArrowRight') dc = 1
    
    if (e.shiftKey) {
      selectionEnd.row = Math.max(0, Math.min((currentSheet.value?.rowCount || DEFAULT_ROW_COUNT) - 1, selectionEnd.row + dr))
      selectionEnd.col = Math.max(0, Math.min((currentSheet.value?.colCount || DEFAULT_COL_COUNT) - 1, selectionEnd.col + dc))
    } else {
      moveSelection(dr, dc)
    }
    
    ensureSelectionVisible()
    return
  }
  
  if (e.key === 'Tab') {
    e.preventDefault()
    if (e.shiftKey) {
      moveSelection(0, -1)
    } else {
      moveSelection(0, 1)
    }
    return
  }
  
  if (e.key === 'Enter') {
    e.preventDefault()
    startEditing(selectionStart.row, selectionStart.col)
    return
  }
  
  if (e.key === 'Escape') {
    if (isEditing.value) {
      isEditing.value = false
    }
    return
  }
  
  if (!isCtrl && e.key && e.key.length === 1) {
    e.preventDefault()
    startEditing(selectionStart.row, selectionStart.col)
    
    nextTick(() => {
      const editor = document.querySelector('.cell-editor')
      if (editor) {
        editor.innerText = e.key
        const range = document.createRange()
        range.selectNodeContents(editor)
        range.collapse(false)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
      }
    })
    return
  }
}

function moveSelection(dr, dc) {
  const newRow = Math.max(0, Math.min((currentSheet.value?.rowCount || DEFAULT_ROW_COUNT) - 1, selectionStart.row + dr))
  const newCol = Math.max(0, Math.min((currentSheet.value?.colCount || DEFAULT_COL_COUNT) - 1, selectionStart.col + dc))
  
  selectionStart.row = newRow
  selectionStart.col = newCol
  selectionEnd.row = newRow
  selectionEnd.col = newCol
  
  updateHighlightedCells()
}

function ensureSelectionVisible() {
  const row = selectionStart.row
  const col = selectionStart.col
  
  let rowTop = 0
  for (let i = 0; i < row; i++) {
    rowTop += rowHeights[i] || DEFAULT_ROW_HEIGHT
  }
  const rowHeight = rowHeights[row] || DEFAULT_ROW_HEIGHT
  
  let colLeft = 0
  for (let i = 0; i < col; i++) {
    colLeft += colWidths[i] || DEFAULT_COL_WIDTH
  }
  const colWidth = colWidths[col] || DEFAULT_COL_WIDTH
  
  if (cellsContainer.value) {
    if (rowTop < scrollTop.value) {
      cellsContainer.value.scrollTop = rowTop
    } else if (rowTop + rowHeight > scrollTop.value + viewportHeight.value) {
      cellsContainer.value.scrollTop = rowTop + rowHeight - viewportHeight.value
    }
    
    if (colLeft < scrollLeft.value) {
      cellsContainer.value.scrollLeft = colLeft
    } else if (colLeft + colWidth > scrollLeft.value + viewportWidth.value) {
      cellsContainer.value.scrollLeft = colLeft + colWidth - viewportWidth.value
    }
  }
}

function handleColHeaderClick(col) {
  const rowCount = currentSheet.value?.rowCount || DEFAULT_ROW_COUNT
  selectionStart.col = col
  selectionStart.row = 0
  selectionEnd.col = col
  selectionEnd.row = rowCount - 1
  selectionActive.value = true
}

function handleRowHeaderClick(row) {
  const colCount = currentSheet.value?.colCount || DEFAULT_COL_COUNT
  selectionStart.row = row
  selectionStart.col = 0
  selectionEnd.row = row
  selectionEnd.col = colCount - 1
  selectionActive.value = true
}

let resizingCol = null
let resizeStartX = 0
let resizeStartWidth = 0

function startColResize(col, e) {
  resizingCol = col
  resizeStartX = e.clientX
  resizeStartWidth = colWidths[col] || DEFAULT_COL_WIDTH
  document.addEventListener('mousemove', handleColResize)
  document.addEventListener('mouseup', stopColResize)
  e.preventDefault()
}

function handleColResize(e) {
  if (resizingCol === null) return
  const delta = e.clientX - resizeStartX
  const newWidth = Math.max(20, resizeStartWidth + delta)
  colWidths[resizingCol] = newWidth
}

function stopColResize() {
  resizingCol = null
  document.removeEventListener('mousemove', handleColResize)
  document.removeEventListener('mouseup', stopColResize)
  scheduleSave()
}

let resizingRow = null
let resizeStartY = 0
let resizeStartHeight = 0

function startRowResize(row, e) {
  resizingRow = row
  resizeStartY = e.clientY
  resizeStartHeight = rowHeights[row] || DEFAULT_ROW_HEIGHT
  document.addEventListener('mousemove', handleRowResize)
  document.addEventListener('mouseup', stopRowResize)
  e.preventDefault()
}

function handleRowResize(e) {
  if (resizingRow === null) return
  const delta = e.clientY - resizeStartY
  const newHeight = Math.max(16, resizeStartHeight + delta)
  rowHeights[resizingRow] = newHeight
}

function stopRowResize() {
  resizingRow = null
  document.removeEventListener('mousemove', handleRowResize)
  document.removeEventListener('mouseup', stopRowResize)
  scheduleSave()
}

function handleCopy() {
  const { startRow, endRow, startCol, endCol } = getSelectionBounds()
  const rows = []
  
  for (let r = startRow; r <= endRow; r++) {
    const row = []
    for (let c = startCol; c <= endCol; c++) {
      const cell = getCell(r, c)
      row.push(cell?.value !== undefined ? String(cell.value) : '')
    }
    rows.push(row.join('\t'))
  }
  
  const text = rows.join('\n')
  
  navigator.clipboard.writeText(text).then(() => {
  }).catch(() => {
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  })
}

function handleCut() {
  handleCopy()
  
  const { startRow, endRow, startCol, endCol } = getSelectionBounds()
  const oldData = {}
  
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = getCell(r, c)
      oldData[`${r},${c}`] = deepClone(cell)
      if (cell) {
        const newCell = { ...cell, value: '' }
        setCell(r, c, newCell)
      }
    }
  }
  
  pushHistory({
    type: 'cut',
    sheetId: currentSheetId.value,
    range: { startRow, endRow, startCol, endCol },
    oldData
  })
  
  formulaEngine.invalidateAll()
  scheduleSave()
}

function handlePaste() {
  navigator.clipboard.readText().then(text => {
    pasteText(text)
  }).catch(() => {
    console.warn('Clipboard read not available')
  })
}

function pasteText(text) {
  const rows = text.split('\n').filter(r => r !== undefined).map(row => row.split('\t'))
  
  const startRow = selectionStart.row
  const startCol = selectionStart.col
  
  const oldData = {}
  const newData = {}
  
  for (let r = 0; r < rows.length; r++) {
    if (!rows[r]) continue
    for (let c = 0; c < rows[r].length; c++) {
      const targetRow = startRow + r
      const targetCol = startCol + c
      
      if (targetRow >= (currentSheet.value?.rowCount || DEFAULT_ROW_COUNT)) continue
      if (targetCol >= (currentSheet.value?.colCount || DEFAULT_COL_COUNT)) continue
      
      const oldCell = getCell(targetRow, targetCol)
      oldData[`${targetRow},${targetCol}`] = deepClone(oldCell)
      
      let value = rows[r][c]
      if (typeof value === 'string' && value.startsWith('=')) {
        const adjusted = formulaEngine.adjustFormulaReference(value, c, r)
        newData[`${targetRow},${targetCol}`] = { ...oldCell, value: adjusted }
      } else {
        const num = Number(value)
        const cellValue = (!isNaN(num) && value !== '' && value !== null) ? num : value
        newData[`${targetRow},${targetCol}`] = { ...oldCell, value: cellValue }
      }
    }
  }
  
  for (const key in newData) {
    const [r, c] = key.split(',').map(Number)
    setCell(r, c, newData[key])
  }
  
  pushHistory({
    type: 'paste',
    sheetId: currentSheetId.value,
    startRow,
    startCol,
    oldData,
    newData
  })
  
  formulaEngine.invalidateAll()
  scheduleSave()
}

function handleUndo() {
  const action = history.undo()
  if (!action) return
  
  applyAction(action, true)
}

function handleRedo() {
  const action = history.redo()
  if (!action) return
  
  applyAction(action, false)
}

function pushHistory(action) {
  history.push(deepClone(action))
}

function applyAction(action, isUndo) {
  switch (action.type) {
    case 'edit': {
      const value = isUndo ? action.oldValue : action.newValue
      const cell = getCell(action.row, action.col) || {}
      setCell(action.row, action.col, { ...cell, value })
      break
    }
    case 'format': {
      const data = isUndo ? action.oldFormat : action.newFormat
      for (const key in data) {
        const [r, c] = key.split(',').map(Number)
        const cell = getCell(r, c) || {}
        setCell(r, c, { ...cell, ...data[key] })
      }
      break
    }
    case 'cut': {
      const { startRow, endRow, startCol, endCol } = action.range
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          if (isUndo) {
            setCell(r, c, action.oldData[`${r},${c}`])
          } else {
            const cell = getCell(r, c) || {}
            setCell(r, c, { ...cell, value: '' })
          }
        }
      }
      break
    }
    case 'paste': {
      const data = isUndo ? action.oldData : action.newData
      for (const key in data) {
        const [r, c] = key.split(',').map(Number)
        setCell(r, c, data[key])
      }
      break
    }
    case 'clear': {
      if (isUndo) {
        for (const key in action.oldData) {
          const [r, c] = key.split(',').map(Number)
          setCell(r, c, action.oldData[key])
        }
      } else {
        const { startRow, endRow, startCol, endCol } = action.range
        for (let r = startRow; r <= endRow; r++) {
          for (let c = startCol; c <= endCol; c++) {
            const cell = getCell(r, c) || {}
            setCell(r, c, { ...cell, value: '' })
          }
        }
      }
      break
    }
    case 'add-sheet': {
      if (isUndo) {
        const idx = sheets.value.findIndex(s => s.id === action.sheetId)
        if (idx >= 0) {
          sheets.value.splice(idx, 1)
          delete sheetData[action.sheetId]
          if (currentSheetId.value === action.sheetId) {
            currentSheetId.value = sheets.value[0]?.id
          }
        }
      } else {
        const sheet = { id: action.sheetId, name: action.sheetName, rowCount: DEFAULT_ROW_COUNT, colCount: DEFAULT_COL_COUNT }
        sheets.value.push(sheet)
        sheetData[action.sheetId] = {}
        formulaEngine.setSheet(action.sheetName, [])
        currentSheetId.value = action.sheetId
      }
      break
    }
    case 'delete-sheet': {
      if (isUndo) {
        sheets.value.splice(action.index, 0, action.sheet)
        sheetData[action.sheetId] = action.data
        formulaEngine.setSheet(action.sheet.name, getSheetDataArray(action.sheetId))
        currentSheetId.value = action.sheetId
      } else {
        const idx = sheets.value.findIndex(s => s.id === action.sheetId)
        if (idx >= 0) {
          sheets.value.splice(idx, 1)
          delete sheetData[action.sheetId]
          if (currentSheetId.value === action.sheetId) {
            currentSheetId.value = sheets.value[0]?.id
          }
        }
      }
      break
    }
    case 'rename-sheet': {
      const sheet = sheets.value.find(s => s.id === action.sheetId)
      if (sheet) {
        sheet.name = isUndo ? action.oldName : action.newName
        updateFormulaEngine()
      }
      break
    }
  }
  
  formulaEngine.invalidateAll()
  scheduleSave()
}

function handleToggleBold() {
  applyFormatChange({ bold: !selectionBold.value })
}

function handleToggleItalic() {
  applyFormatChange({ italic: !selectionItalic.value })
}

function handleSetAlign(align) {
  applyFormatChange({ textAlign: align })
}

function handleSetFontSize(size) {
  applyFormatChange({ fontSize: size })
}

function handleSetFontColor(color) {
  applyFormatChange({ fontColor: color })
}

function handleSetBgColor(color) {
  applyFormatChange({ backgroundColor: color })
}

function applyFormatChange(format) {
  const { startRow, endRow, startCol, endCol } = getSelectionBounds()
  const oldFormat = {}
  const newFormat = {}
  
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = getCell(r, c) || {}
      oldFormat[`${r},${c}`] = {
        bold: cell.bold,
        italic: cell.italic,
        textAlign: cell.textAlign,
        fontSize: cell.fontSize,
        fontColor: cell.fontColor,
        backgroundColor: cell.backgroundColor
      }
      
      const newCell = { ...cell, ...format }
      newFormat[`${r},${c}`] = {
        bold: newCell.bold,
        italic: newCell.italic,
        textAlign: newCell.textAlign,
        fontSize: newCell.fontSize,
        fontColor: newCell.fontColor,
        backgroundColor: newCell.backgroundColor
      }
      setCell(r, c, newCell)
    }
  }
  
  pushHistory({
    type: 'format',
    sheetId: currentSheetId.value,
    range: { startRow, endRow, startCol, endCol },
    oldFormat,
    newFormat
  })
  
  scheduleSave()
}

function clearSelection() {
  const { startRow, endRow, startCol, endCol } = getSelectionBounds()
  const oldData = {}
  
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = getCell(r, c)
      oldData[`${r},${c}`] = deepClone(cell)
      if (cell) {
        const newCell = { ...cell, value: '' }
        setCell(r, c, newCell)
      }
    }
  }
  
  pushHistory({
    type: 'clear',
    sheetId: currentSheetId.value,
    range: { startRow, endRow, startCol, endCol },
    oldData
  })
  
  formulaEngine.invalidateAll()
  scheduleSave()
}

function handleToggleMerge() {
  const { startRow, endRow, startCol, endCol } = getSelectionBounds()
  
  const existingIndex = mergedCells.value.findIndex(m =>
    m.startRow === startRow && m.endRow === endRow &&
    m.startCol === startCol && m.endCol === endCol
  )
  
  if (existingIndex >= 0) {
    mergedCells.value.splice(existingIndex, 1)
  } else {
    mergedCells.value.push({ startRow, endRow, startCol, endCol })
  }
  
  scheduleSave()
}

function handleInsertRowAbove() {
  insertRow(selectionStart.row)
}

function handleInsertRowBelow() {
  insertRow(selectionEnd.row + 1)
}

function insertRow(index) {
  const sheet = currentSheet.value
  if (!sheet) return
  
  const oldRowHeights = { ...rowHeights }
  
  const newRowHeights = {}
  for (const key in rowHeights) {
    const r = parseInt(key)
    if (r >= index) {
      newRowHeights[r + 1] = rowHeights[key]
    } else {
      newRowHeights[r] = rowHeights[key]
    }
  }
  Object.keys(rowHeights).forEach(k => delete rowHeights[k])
  Object.assign(rowHeights, newRowHeights)
  
  const newSheetData = {}
  for (const key in sheetData[sheet.id]) {
    const [r, c] = key.split(',').map(Number)
    if (r >= index) {
      newSheetData[`${r + 1},${c}`] = sheetData[sheet.id][key]
    } else {
      newSheetData[key] = sheetData[sheet.id][key]
    }
  }
  sheetData[sheet.id] = newSheetData
  
  sheet.rowCount = (sheet.rowCount || DEFAULT_ROW_COUNT) + 1
  
  updateFormulaEngine()
  
  pushHistory({
    type: 'insert-row',
    sheetId: sheet.id,
    index,
    oldRowCount: sheet.rowCount - 1,
    oldRowHeights
  })
  
  scheduleSave()
}

function handleInsertColLeft() {
  insertCol(selectionStart.col)
}

function handleInsertColRight() {
  insertCol(selectionEnd.col + 1)
}

function insertCol(index) {
  const sheet = currentSheet.value
  if (!sheet) return
  
  const oldColWidths = { ...colWidths }
  
  const newColWidths = {}
  for (const key in colWidths) {
    const c = parseInt(key)
    if (c >= index) {
      newColWidths[c + 1] = colWidths[key]
    } else {
      newColWidths[c] = colWidths[key]
    }
  }
  Object.keys(colWidths).forEach(k => delete colWidths[k])
  Object.assign(colWidths, newColWidths)
  
  const newSheetData = {}
  for (const key in sheetData[sheet.id]) {
    const [r, c] = key.split(',').map(Number)
    if (c >= index) {
      newSheetData[`${r},${c + 1}`] = sheetData[sheet.id][key]
    } else {
      newSheetData[key] = sheetData[sheet.id][key]
    }
  }
  sheetData[sheet.id] = newSheetData
  
  sheet.colCount = (sheet.colCount || DEFAULT_COL_COUNT) + 1
  
  updateFormulaEngine()
  
  pushHistory({
    type: 'insert-col',
    sheetId: sheet.id,
    index,
    oldColCount: sheet.colCount - 1,
    oldColWidths
  })
  
  scheduleSave()
}

function handleDeleteRow() {
  const { startRow, endRow } = getSelectionBounds()
  deleteRows(startRow, endRow)
}

function deleteRows(start, end) {
  const sheet = currentSheet.value
  if (!sheet) return
  
  const count = end - start + 1
  const oldRowHeights = { ...rowHeights }
  const oldData = deepClone(sheetData[sheet.id])
  
  const newRowHeights = {}
  for (const key in rowHeights) {
    const r = parseInt(key)
    if (r < start) {
      newRowHeights[r] = rowHeights[key]
    } else if (r > end) {
      newRowHeights[r - count] = rowHeights[key]
    }
  }
  Object.keys(rowHeights).forEach(k => delete rowHeights[k])
  Object.assign(rowHeights, newRowHeights)
  
  const newSheetData = {}
  for (const key in sheetData[sheet.id]) {
    const [r, c] = key.split(',').map(Number)
    if (r < start) {
      newSheetData[key] = sheetData[sheet.id][key]
    } else if (r > end) {
      newSheetData[`${r - count},${c}`] = sheetData[sheet.id][key]
    }
  }
  sheetData[sheet.id] = newSheetData
  
  sheet.rowCount = Math.max(1, (sheet.rowCount || DEFAULT_ROW_COUNT) - count)
  
  updateFormulaEngine()
  
  pushHistory({
    type: 'delete-row',
    sheetId: sheet.id,
    start,
    end,
    oldRowCount: sheet.rowCount + count,
    oldRowHeights,
    oldData
  })
  
  if (selectionStart.row >= sheet.rowCount) {
    selectionStart.row = sheet.rowCount - 1
    selectionEnd.row = sheet.rowCount - 1
  }
  
  scheduleSave()
}

function handleDeleteCol() {
  const { startCol, endCol } = getSelectionBounds()
  deleteCols(startCol, endCol)
}

function deleteCols(start, end) {
  const sheet = currentSheet.value
  if (!sheet) return
  
  const count = end - start + 1
  const oldColWidths = { ...colWidths }
  const oldData = deepClone(sheetData[sheet.id])
  
  const newColWidths = {}
  for (const key in colWidths) {
    const c = parseInt(key)
    if (c < start) {
      newColWidths[c] = colWidths[key]
    } else if (c > end) {
      newColWidths[c - count] = colWidths[key]
    }
  }
  Object.keys(colWidths).forEach(k => delete colWidths[k])
  Object.assign(colWidths, newColWidths)
  
  const newSheetData = {}
  for (const key in sheetData[sheet.id]) {
    const [r, c] = key.split(',').map(Number)
    if (c < start) {
      newSheetData[key] = sheetData[sheet.id][key]
    } else if (c > end) {
      newSheetData[`${r},${c - count}`] = sheetData[sheet.id][key]
    }
  }
  sheetData[sheet.id] = newSheetData
  
  sheet.colCount = Math.max(1, (sheet.colCount || DEFAULT_COL_COUNT) - count)
  
  updateFormulaEngine()
  
  pushHistory({
    type: 'delete-col',
    sheetId: sheet.id,
    start,
    end,
    oldColCount: sheet.colCount + count,
    oldColWidths,
    oldData
  })
  
  if (selectionStart.col >= sheet.colCount) {
    selectionStart.col = sheet.colCount - 1
    selectionEnd.col = sheet.colCount - 1
  }
  
  scheduleSave()
}

function handleFormulaInput(e) {
  const value = e.target.value
  updateHighlightedCells(value)
}

function handleFormulaKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    const value = e.target.value
    commitEdit(selectionStart.row, selectionStart.col, value)
    moveSelection(1, 0)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    formulaInput.value.blur()
  }
}

function handleFormulaFocus() {
  updateHighlightedCells(formulaInput.value?.value || '')
}

function updateHighlightedCells(formulaText) {
  const value = formulaText !== undefined ? formulaText : currentCellFormula.value
  
  if (!value || !value.startsWith('=')) {
    highlightedCells.value = []
    return
  }
  
  const refs = formulaEngine.getReferencedCells(value, currentSheet.value?.name)
  const cells = []
  
  for (const ref of refs) {
    if (ref.sheet !== currentSheet.value?.name) continue
    
    const refStr = ref.ref
    if (refStr.includes(':')) {
      const parts = refStr.split(':')
      const start = parseCellRef(parts[0])
      const end = parseCellRef(parts[1])
      if (start && end) {
        for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
          for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
            cells.push({ row: r, col: c })
          }
        }
      }
    } else {
      const cell = parseCellRef(refStr)
      if (cell) {
        cells.push({ row: cell.row, col: cell.col })
      }
    }
  }
  
  highlightedCells.value = cells
}

function handleFind(options) {
  const { text, direction, matchCase, useRegex, matchWhole } = options
  const sheet = currentSheet.value
  if (!sheet) return
  
  let r = selectionStart.row
  let c = selectionStart.col
  
  if (direction === 'next') {
    c++
  } else {
    c--
  }
  
  const rowCount = sheet.rowCount || DEFAULT_ROW_COUNT
  const colCount = sheet.colCount || DEFAULT_COL_COUNT
  
  let found = false
  let iterations = 0
  const maxIterations = rowCount * colCount
  
  while (!found && iterations < maxIterations) {
    iterations++
    
    if (c >= colCount) {
      c = 0
      r++
    }
    if (c < 0) {
      c = colCount - 1
      r--
    }
    if (r >= rowCount) r = 0
    if (r < 0) r = rowCount - 1
    
    const cell = getCell(r, c)
    const cellValue = cell?.value ? String(cell.value) : ''
    const computedVal = getComputedValue(r, c)
    const displayValue = computedVal !== undefined && computedVal !== null ? String(computedVal) : ''
    
    if (matchesPattern(cellValue, text, matchCase, useRegex, matchWhole) ||
        matchesPattern(displayValue, text, matchCase, useRegex, matchWhole)) {
      found = true
      selectionStart.row = r
      selectionStart.col = c
      selectionEnd.row = r
      selectionEnd.col = c
      ensureSelectionVisible()
    }
    
    if (direction === 'next') {
      c++
    } else {
      c--
    }
    
    if (r === selectionStart.row && c === selectionStart.col) break
  }
  
  if (!found && findReplaceRef.value) {
    findReplaceRef.value.setStatus('未找到匹配内容')
  }
}

function matchesPattern(str, pattern, matchCase, useRegex, matchWhole) {
  if (!str || !pattern) return false
  
  let regex
  try {
    if (useRegex) {
      regex = new RegExp(pattern, matchCase ? '' : 'i')
    } else {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const wrapped = matchWhole ? `^${escaped}$` : escaped
      regex = new RegExp(wrapped, matchCase ? '' : 'i')
    }
    return regex.test(str)
  } catch (e) {
    return false
  }
}

function handleReplace(options) {
  const { find, replace, matchCase, useRegex, matchWhole } = options
  
  const cell = getCell(selectionStart.row, selectionStart.col)
  const cellValue = cell?.value ? String(cell.value) : ''
  
  if (matchesPattern(cellValue, find, matchCase, useRegex, matchWhole)) {
    let newValue
    if (useRegex) {
      try {
        const regex = new RegExp(find, matchCase ? 'g' : 'gi')
        newValue = cellValue.replace(regex, replace)
      } catch (e) {
        return
      }
    } else if (matchWhole) {
      newValue = replace
    } else {
      newValue = cellValue.split(find).join(replace)
    }
    
    commitEdit(selectionStart.row, selectionStart.col, newValue)
  }
  
  handleFind({ text: find, direction: 'next', matchCase, useRegex, matchWhole })
}

function handleReplaceAll(options) {
  const { find, replace, matchCase, useRegex, matchWhole } = options
  const sheet = currentSheet.value
  if (!sheet) return
  
  let count = 0
  const rowCount = sheet.rowCount || DEFAULT_ROW_COUNT
  const colCount = sheet.colCount || DEFAULT_COL_COUNT
  
  const oldData = {}
  
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const cell = getCell(r, c)
      const cellValue = cell?.value ? String(cell.value) : ''
      
      if (matchesPattern(cellValue, find, matchCase, useRegex, matchWhole)) {
        oldData[`${r},${c}`] = deepClone(cell)
        
        let newValue
        if (useRegex) {
          try {
            const regex = new RegExp(find, matchCase ? 'g' : 'gi')
            newValue = cellValue.replace(regex, replace)
          } catch (e) {
            continue
          }
        } else if (matchWhole) {
          newValue = replace
        } else {
          newValue = cellValue.split(find).join(replace)
        }
        
        const newCell = { ...cell, value: newValue }
        setCell(r, c, newCell)
        count++
      }
    }
  }
  
  if (count > 0) {
    pushHistory({
      type: 'replace-all',
      sheetId: sheet.id,
      oldData,
      count
    })
  }
  
  if (findReplaceRef.value) {
    findReplaceRef.value.setStatus(`已替换 ${count} 处`)
  }
  
  formulaEngine.invalidateAll()
  scheduleSave()
}

function handleToggleFreeze() {
  if (freezeRows.value > 0 || freezeCols.value > 0) {
    freezeRows.value = 0
    freezeCols.value = 0
  } else {
    freezeRows.value = selectionStart.row + 1
    freezeCols.value = selectionStart.col + 1
  }
  scheduleSave()
}

function handleExportCsv() {
  const sheet = currentSheet.value
  if (!sheet) return
  
  const { startRow, endRow, startCol, endCol } = getSelectionBounds()
  const hasSelection = startRow !== endRow || startCol !== endCol
  
  let r1, r2, c1, c2
  if (hasSelection) {
    r1 = startRow; r2 = endRow; c1 = startCol; c2 = endCol
  } else {
    r1 = 0; r2 = sheet.rowCount - 1; c1 = 0; c2 = sheet.colCount - 1
  }
  
  const rows = []
  for (let r = r1; r <= r2; r++) {
    const row = []
    for (let c = c1; c <= c2; c++) {
      const val = getComputedValue(r, c)
      let str = val !== undefined && val !== null ? String(val) : ''
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        str = '"' + str.replace(/"/g, '""') + '"'
      }
      row.push(str)
    }
    rows.push(row.join(','))
  }
  
  const csv = '\ufeff' + rows.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sheet.name}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function handleImportCsv() {
  csvFileInput.value?.click()
}

function handleCsvFileSelect(e) {
  const file = e.target.files[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (event) => {
    const content = event.target.result
    parseCsv(content)
  }
  reader.readAsText(file, 'UTF-8')
  e.target.value = ''
}

function parseCsv(content) {
  content = content.replace(/^\ufeff/, '')
  
  const sheet = currentSheet.value
  if (!sheet) return
  
  const rows = []
  let currentRow = []
  let currentField = ''
  let inQuotes = false
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    const nextChar = content[i + 1]
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        currentField += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        currentRow.push(currentField)
        currentField = ''
      } else if (char === '\n') {
        currentRow.push(currentField)
        rows.push(currentRow)
        currentRow = []
        currentField = ''
      } else if (char === '\r') {
      } else {
        currentField += char
      }
    }
  }
  
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField)
    rows.push(currentRow)
  }
  
  const startRow = selectionStart.row
  const startCol = selectionStart.col
  
  const oldData = {}
  const newData = {}
  
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const targetRow = startRow + r
      const targetCol = startCol + c
      
      if (targetRow >= (sheet.rowCount || DEFAULT_ROW_COUNT)) continue
      if (targetCol >= (sheet.colCount || DEFAULT_COL_COUNT)) continue
      
      const oldCell = getCell(targetRow, targetCol)
      oldData[`${targetRow},${targetCol}`] = deepClone(oldCell)
      
      const value = rows[r][c]
      const num = Number(value)
      const cellValue = (!isNaN(num) && value !== '' && value !== null) ? num : value
      newData[`${targetRow},${targetCol}`] = { ...oldCell, value: cellValue }
    }
  }
  
  for (const key in newData) {
    const [r, c] = key.split(',').map(Number)
    setCell(r, c, newData[key])
  }
  
  pushHistory({
    type: 'paste',
    sheetId: currentSheetId.value,
    startRow,
    startCol,
    oldData,
    newData
  })
  
  formulaEngine.invalidateAll()
  scheduleSave()
}

function handleChangeSheet(sheetId) {
  if (isEditing.value) {
    commitCurrentEdit()
  }
  currentSheetId.value = sheetId
  selectionStart.row = 0
  selectionStart.col = 0
  selectionEnd.row = 0
  selectionEnd.col = 0
  
  formulaEngine.invalidateAll()
  updateHighlightedCells()
  scheduleSave()
}

function handleAddSheet() {
  const name = `Sheet${sheets.value.length + 1}`
  const sheet = createDefaultSheet(name)
  sheets.value.push(sheet)
  sheetData[sheet.id] = {}
  
  formulaEngine.setSheet(name, getSheetDataArray(sheet.id))
  
  currentSheetId.value = sheet.id
  selectionStart.row = 0
  selectionStart.col = 0
  selectionEnd.row = 0
  selectionEnd.col = 0
  
  pushHistory({
    type: 'add-sheet',
    sheetId: sheet.id,
    sheetName: name
  })
  
  scheduleSave()
}

function handleRenameSheet({ id, name }) {
  const sheet = sheets.value.find(s => s.id === id)
  if (sheet) {
    const oldName = sheet.name
    sheet.name = name
    
    updateFormulaEngine()
    formulaEngine.invalidateAll()
    
    pushHistory({
      type: 'rename-sheet',
      sheetId: id,
      oldName,
      newName: name
    })
    
    scheduleSave()
  }
}

function handleDeleteSheet(sheetId) {
  if (sheets.value.length <= 1) return
  
  const index = sheets.value.findIndex(s => s.id === sheetId)
  if (index < 0) return
  
  const sheet = sheets.value[index]
  const deletedSheet = deepClone(sheet)
  const deletedData = deepClone(sheetData[sheetId])
  
  if (confirm(`确定要删除工作表 "${sheet.name}" 吗？`)) {
    sheets.value.splice(index, 1)
    delete sheetData[sheetId]
    
    if (currentSheetId.value === sheetId) {
      currentSheetId.value = sheets.value[0]?.id
    }
    
    updateFormulaEngine()
    formulaEngine.invalidateAll()
    
    pushHistory({
      type: 'delete-sheet',
      sheetId,
      sheet: deletedSheet,
      data: deletedData,
      index
    })
    
    scheduleSave()
  }
}

function handleReorderSheets({ from, to }) {
  const sheet = sheets.value.splice(from, 1)[0]
  sheets.value.splice(to, 0, sheet)
  scheduleSave()
}

function handleDuplicateSheet(sheetId) {
  const sheet = sheets.value.find(s => s.id === sheetId)
  if (!sheet) return
  
  const newSheet = {
    ...deepClone(sheet),
    id: generateId(),
    name: sheet.name + '_副本'
  }
  
  const index = sheets.value.findIndex(s => s.id === sheetId)
  sheets.value.splice(index + 1, 0, newSheet)
  sheetData[newSheet.id] = deepClone(sheetData[sheetId])
  
  formulaEngine.setSheet(newSheet.name, getSheetDataArray(newSheet.id))
  
  pushHistory({
    type: 'add-sheet',
    sheetId: newSheet.id,
    sheetName: newSheet.name
  })
  
  scheduleSave()
}

let fillStartRow = 0
let fillStartCol = 0

function startFill(e) {
  e.preventDefault()
  e.stopPropagation()
  
  fillStartRow = selectionStart.row
  fillStartCol = selectionStart.col
  
  document.addEventListener('mousemove', handleFillMove)
  document.addEventListener('mouseup', handleFillEnd)
}

function handleFillMove(e) {
  const rect = cellsContainer.value.getBoundingClientRect()
  const x = e.clientX - rect.left + scrollLeft.value
  const y = e.clientY - rect.top + scrollTop.value
  
  const col = Math.max(0, Math.min((currentSheet.value?.colCount || DEFAULT_COL_COUNT) - 1, Math.floor(x / DEFAULT_COL_WIDTH)))
  const row = Math.max(0, Math.min((currentSheet.value?.rowCount || DEFAULT_ROW_COUNT) - 1, Math.floor(y / DEFAULT_ROW_HEIGHT)))
  
  selectionEnd.row = row
  selectionEnd.col = col
}

function handleFillEnd() {
  document.removeEventListener('mousemove', handleFillMove)
  document.removeEventListener('mouseup', handleFillEnd)
  
  const { startRow, endRow, startCol, endCol } = getSelectionBounds()
  
  if (startRow === endRow && startCol === endCol) return
  
  const sourceCell = getCell(fillStartRow, fillStartCol)
  if (!sourceCell) return
  
  const oldData = {}
  
  if (startRow !== endRow) {
    const direction = endRow > startRow ? 1 : -1
    const count = Math.abs(endRow - startRow)
    
    for (let i = 1; i <= count; i++) {
      const targetRow = fillStartRow + i * direction
      const oldCell = getCell(targetRow, startCol)
      oldData[`${targetRow},${startCol}`] = deepClone(oldCell)
      
      if (typeof sourceCell.value === 'number') {
        const step = direction
        const newValue = sourceCell.value + i * step
        setCell(targetRow, startCol, { ...sourceCell, value: newValue })
      } else if (typeof sourceCell.value === 'string' && sourceCell.value.startsWith('=')) {
        const adjusted = formulaEngine.adjustFormulaReference(sourceCell.value, 0, i * direction)
        setCell(targetRow, startCol, { ...sourceCell, value: adjusted })
      } else {
        setCell(targetRow, startCol, deepClone(sourceCell))
      }
    }
  }
  
  if (startCol !== endCol) {
    const direction = endCol > startCol ? 1 : -1
    const count = Math.abs(endCol - startCol)
    
    for (let i = 1; i <= count; i++) {
      const targetCol = fillStartCol + i * direction
      const oldCell = getCell(fillStartRow, targetCol)
      oldData[`${fillStartRow},${targetCol}`] = deepClone(oldCell)
      
      if (typeof sourceCell.value === 'number') {
        const step = direction
        const newValue = sourceCell.value + i * step
        setCell(fillStartRow, targetCol, { ...sourceCell, value: newValue })
      } else if (typeof sourceCell.value === 'string' && sourceCell.value.startsWith('=')) {
        const adjusted = formulaEngine.adjustFormulaReference(sourceCell.value, i * direction, 0)
        setCell(fillStartRow, targetCol, { ...sourceCell, value: adjusted })
      } else {
        setCell(fillStartRow, targetCol, deepClone(sourceCell))
      }
    }
  }
  
  pushHistory({
    type: 'fill',
    sheetId: currentSheetId.value,
    oldData
  })
  
  formulaEngine.invalidateAll()
  scheduleSave()
}

const scheduleSave = debounce(() => {
  saveData()
}, 500)

function saveData() {
  const data = {
    sheets: sheets.value.map(s => ({
      id: s.id,
      name: s.name,
      rowCount: s.rowCount,
      colCount: s.colCount
    })),
    currentSheetId: currentSheetId.value,
    rowHeights: { ...rowHeights },
    colWidths: { ...colWidths },
    mergedCells: [...mergedCells.value],
    freezeRows: freezeRows.value,
    freezeCols: freezeCols.value
  }
  
  for (const sheet of sheets.value) {
    data[`data_${sheet.id}`] = sheetData[sheet.id] || {}
  }
  
  saveToStorage(STORAGE_KEY, data)
}

function loadData() {
  const saved = loadFromStorage(STORAGE_KEY)
  if (saved) {
    for (const sheet of saved.sheets || []) {
      if (saved[`data_${sheet.id}`]) {
        sheetData[sheet.id] = saved[`data_${sheet.id}`]
      }
    }
  }
}

function updateViewport() {
  if (cellsContainer.value) {
    viewportHeight.value = cellsContainer.value.clientHeight
    viewportWidth.value = cellsContainer.value.clientWidth
  }
}

onMounted(() => {
  loadData()
  initSheets()
  
  nextTick(() => {
    updateViewport()
    containerRef.value?.focus()
  })
  
  window.addEventListener('resize', updateViewport)
})
</script>

<style scoped>
.spreadsheet-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: white;
  outline: none;
}

.formula-bar {
  display: flex;
  align-items: center;
  height: 28px;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
}

.cell-reference {
  width: 80px;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  border-right: 1px solid #e0e0e0;
  color: #333;
}

.formula-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 8px;
}

.fx-label {
  color: #999;
  font-style: italic;
  font-size: 12px;
  margin-right: 8px;
}

.formula-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 12px;
  font-family: inherit;
  background: transparent;
}

.grid-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.corner-header {
  position: absolute;
  top: 0;
  left: 0;
  width: 40px;
  height: 24px;
  background: #f0f0f0;
  border-right: 1px solid #ccc;
  border-bottom: 1px solid #ccc;
  z-index: 30;
}

.col-headers {
  position: absolute;
  top: 0;
  left: 40px;
  right: 0;
  height: 24px;
  background: #f0f0f0;
  border-bottom: 1px solid #ccc;
  overflow: hidden;
  z-index: 20;
}

.col-header {
  position: absolute;
  top: 0;
  height: 24px;
  line-height: 24px;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: #555;
  border-right: 1px solid #ccc;
  cursor: pointer;
  user-select: none;
}

.col-header:hover {
  background: #e0e0e0;
}

.col-header.selected {
  background: #d2e3fc;
  color: #1a73e8;
}

.col-resize-handle {
  position: absolute;
  top: 0;
  right: -2px;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  z-index: 2;
}

.row-headers {
  position: absolute;
  top: 24px;
  left: 0;
  width: 40px;
  bottom: 0;
  background: #f0f0f0;
  border-right: 1px solid #ccc;
  overflow: hidden;
  z-index: 20;
}

.row-header {
  position: absolute;
  left: 0;
  width: 40px;
  line-height: 24px;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: #555;
  border-bottom: 1px solid #e0e0e0;
  cursor: pointer;
  user-select: none;
}

.row-header:hover {
  background: #e0e0e0;
}

.row-header.selected {
  background: #d2e3fc;
  color: #1a73e8;
}

.row-resize-handle {
  position: absolute;
  left: 0;
  bottom: -2px;
  width: 100%;
  height: 4px;
  cursor: row-resize;
  z-index: 2;
}

.cells-container {
  position: absolute;
  top: 24px;
  left: 40px;
  right: 0;
  bottom: 0;
  overflow: auto;
  background: white;
}

.cells-content {
  position: relative;
}

.grid-row {
  position: absolute;
  left: 0;
  right: 0;
}

.cell-wrapper {
  position: absolute;
  top: 0;
}

.selection-highlight {
  position: absolute;
  border: 2px solid #1a73e8;
  pointer-events: none;
  z-index: 10;
  background: rgba(26, 115, 232, 0.05);
}

.fill-handle {
  position: absolute;
  width: 8px;
  height: 8px;
  background: #1a73e8;
  border: 1px solid white;
  cursor: crosshair;
  z-index: 11;
}

.fill-handle:hover {
  background: #1557b0;
}
</style>