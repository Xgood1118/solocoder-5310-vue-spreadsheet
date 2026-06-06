const FORMULA_ERRORS = {
  REF: '#REF!',
  DIV0: '#DIV/0!',
  VALUE: '#VALUE!',
  NA: '#N/A',
  NAME: '#NAME?',
  NUM: '#NUM!',
  CIRCULAR: '#CIRCULAR!',
  CHAIN_TOO_DEEP: '#DEEP!'
}

const MAX_CHAIN_DEPTH = 20

function colIndexToName(index) {
  let name = ''
  let n = index
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name
    n = Math.floor(n / 26) - 1
  }
  return name
}

function colNameToIndex(name) {
  let index = 0
  for (let i = 0; i < name.length; i++) {
    index = index * 26 + (name.charCodeAt(i) - 64)
  }
  return index - 1
}

function parseCellRef(ref) {
  const match = ref.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/i)
  if (!match) return null
  return {
    col: colNameToIndex(match[2].toUpperCase()),
    row: parseInt(match[4], 10) - 1,
    colAbsolute: match[1] === '$',
    rowAbsolute: match[3] === '$'
  }
}

function parseRangeRef(ref) {
  const parts = ref.split(':')
  if (parts.length !== 2) return null
  const start = parseCellRef(parts[0])
  const end = parseCellRef(parts[1])
  if (!start || !end) return null
  return {
    startCol: Math.min(start.col, end.col),
    startRow: Math.min(start.row, end.row),
    endCol: Math.max(start.col, end.col),
    endRow: Math.max(start.row, end.row)
  }
}

function parseSheetRef(ref) {
  const exclamationIndex = ref.indexOf('!')
  if (exclamationIndex === -1) {
    return { sheetName: null, ref: ref }
  }
  let sheetName = ref.substring(0, exclamationIndex)
  if (sheetName.startsWith("'") && sheetName.endsWith("'")) {
    sheetName = sheetName.slice(1, -1)
  }
  return { sheetName, ref: ref.substring(exclamationIndex + 1) }
}

const FUNCTIONS = {
  SUM: (args) => {
    let sum = 0
    let hasValue = false
    for (const arg of args) {
      if (Array.isArray(arg)) {
        for (const row of arg) {
          for (const cell of row) {
            const num = toNumber(cell)
            if (num !== null) { sum += num; hasValue = true }
          }
        }
      } else {
        const num = toNumber(arg)
        if (num !== null) { sum += num; hasValue = true }
      }
    }
    return hasValue ? sum : 0
  },

  AVERAGE: (args) => {
    let sum = 0
    let count = 0
    for (const arg of args) {
      if (Array.isArray(arg)) {
        for (const row of arg) {
          for (const cell of row) {
            const num = toNumber(cell)
            if (num !== null) { sum += num; count++ }
          }
        }
      } else {
        const num = toNumber(arg)
        if (num !== null) { sum += num; count++ }
      }
    }
    if (count === 0) return FORMULA_ERRORS.DIV0
    return sum / count
  },

  COUNT: (args) => {
    let count = 0
    for (const arg of args) {
      if (Array.isArray(arg)) {
        for (const row of arg) {
          for (const cell of row) {
            if (toNumber(cell) !== null) count++
          }
        }
      } else {
        if (toNumber(arg) !== null) count++
      }
    }
    return count
  },

  MIN: (args) => {
    let min = Infinity
    let hasValue = false
    for (const arg of args) {
      if (Array.isArray(arg)) {
        for (const row of arg) {
          for (const cell of row) {
            const num = toNumber(cell)
            if (num !== null) { min = Math.min(min, num); hasValue = true }
          }
        }
      } else {
        const num = toNumber(arg)
        if (num !== null) { min = Math.min(min, num); hasValue = true }
      }
    }
    return hasValue ? min : 0
  },

  MAX: (args) => {
    let max = -Infinity
    let hasValue = false
    for (const arg of args) {
      if (Array.isArray(arg)) {
        for (const row of arg) {
          for (const cell of row) {
            const num = toNumber(cell)
            if (num !== null) { max = Math.max(max, num); hasValue = true }
          }
        }
      } else {
        const num = toNumber(arg)
        if (num !== null) { max = Math.max(max, num); hasValue = true }
      }
    }
    return hasValue ? max : 0
  },

  IF: (args) => {
    if (args.length < 2) return FORMULA_ERRORS.VALUE
    const condition = toBoolean(args[0])
    if (condition) return args.length >= 3 ? args[1] : true
    return args.length >= 3 ? args[2] : false
  },

  CONCAT: (args) => {
    let result = ''
    for (const arg of args) {
      if (Array.isArray(arg)) {
        for (const row of arg) {
          for (const cell of row) {
            result += toString(cell)
          }
        }
      } else {
        result += toString(arg)
      }
    }
    return result
  },

  LEFT: (args) => {
    if (args.length < 1) return FORMULA_ERRORS.VALUE
    const text = toString(args[0])
    const len = args.length >= 2 ? toInteger(args[1]) : 1
    if (len === null) return FORMULA_ERRORS.VALUE
    return text.substring(0, Math.max(0, len))
  },

  RIGHT: (args) => {
    if (args.length < 1) return FORMULA_ERRORS.VALUE
    const text = toString(args[0])
    const len = args.length >= 2 ? toInteger(args[1]) : 1
    if (len === null) return FORMULA_ERRORS.VALUE
    return text.substring(text.length - Math.max(0, len))
  },

  MID: (args) => {
    if (args.length < 3) return FORMULA_ERRORS.VALUE
    const text = toString(args[0])
    const start = toInteger(args[1])
    const len = toInteger(args[2])
    if (start === null || len === null) return FORMULA_ERRORS.VALUE
    return text.substring(Math.max(0, start - 1), Math.max(0, start - 1) + Math.max(0, len))
  },

  LEN: (args) => {
    if (args.length < 1) return FORMULA_ERRORS.VALUE
    return toString(args[0]).length
  },

  ROUND: (args) => {
    if (args.length < 1) return FORMULA_ERRORS.VALUE
    const num = toNumber(args[0])
    const decimals = args.length >= 2 ? toInteger(args[1]) : 0
    if (num === null || decimals === null) return FORMULA_ERRORS.VALUE
    const factor = Math.pow(10, decimals)
    return Math.round(num * factor) / factor
  },

  INT: (args) => {
    if (args.length < 1) return FORMULA_ERRORS.VALUE
    const num = toNumber(args[0])
    if (num === null) return FORMULA_ERRORS.VALUE
    return Math.floor(num)
  },

  ABS: (args) => {
    if (args.length < 1) return FORMULA_ERRORS.VALUE
    const num = toNumber(args[0])
    if (num === null) return FORMULA_ERRORS.VALUE
    return Math.abs(num)
  },

  NOW: () => {
    return new Date()
  },

  TODAY: () => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  },

  VLOOKUP: (args, getCellValue) => {
    if (args.length < 3) return FORMULA_ERRORS.VALUE
    const lookupValue = args[0]
    const tableArray = args[1]
    const colIndexNum = toInteger(args[2])
    const rangeLookup = args.length >= 4 ? toBoolean(args[3]) : true

    if (!Array.isArray(tableArray) || colIndexNum === null) return FORMULA_ERRORS.VALUE
    if (colIndexNum < 1 || colIndexNum > tableArray[0]?.length) return FORMULA_ERRORS.REF

    const firstCol = tableArray.map(row => row[0])
    
    if (rangeLookup) {
      for (let i = firstCol.length - 1; i >= 0; i--) {
        if (compareValues(firstCol[i], lookupValue) <= 0) {
          return tableArray[i][colIndexNum - 1] ?? ''
        }
      }
      return FORMULA_ERRORS.NA
    } else {
      for (let i = 0; i < firstCol.length; i++) {
        if (compareValues(firstCol[i], lookupValue) === 0) {
          return tableArray[i][colIndexNum - 1] ?? ''
        }
      }
      return FORMULA_ERRORS.NA
    }
  },

  INDEX: (args) => {
    if (args.length < 3) return FORMULA_ERRORS.VALUE
    const array = args[0]
    const rowNum = toInteger(args[1])
    const colNum = args.length >= 3 ? toInteger(args[2]) : 1

    if (!Array.isArray(array) || rowNum === null || colNum === null) return FORMULA_ERRORS.VALUE
    if (rowNum < 1 || rowNum > array.length || colNum < 1 || colNum > array[0]?.length) return FORMULA_ERRORS.REF
    
    return array[rowNum - 1][colNum - 1] ?? ''
  },

  MATCH: (args) => {
    if (args.length < 2) return FORMULA_ERRORS.VALUE
    const lookupValue = args[0]
    const lookupArray = args[1]
    const matchType = args.length >= 3 ? toInteger(args[2]) : 1

    if (!Array.isArray(lookupArray)) return FORMULA_ERRORS.VALUE

    const flat = lookupArray.flat()

    if (matchType === 0) {
      for (let i = 0; i < flat.length; i++) {
        if (compareValues(flat[i], lookupValue) === 0) return i + 1
      }
      return FORMULA_ERRORS.NA
    } else if (matchType === 1) {
      let best = -1
      for (let i = 0; i < flat.length; i++) {
        if (compareValues(flat[i], lookupValue) <= 0) {
          best = i
        } else {
          break
        }
      }
      return best >= 0 ? best + 1 : FORMULA_ERRORS.NA
    } else if (matchType === -1) {
      let best = -1
      for (let i = flat.length - 1; i >= 0; i--) {
        if (compareValues(flat[i], lookupValue) >= 0) {
          best = i
        } else {
          break
        }
      }
      return best >= 0 ? best + 1 : FORMULA_ERRORS.NA
    }

    return FORMULA_ERRORS.VALUE
  }
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return isNaN(value) ? null : value
  const num = parseFloat(value)
  return isNaN(num) ? null : num
}

function toInteger(value) {
  const num = toNumber(value)
  return num === null ? null : Math.trunc(num)
}

function toString(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toLocaleDateString()
  return String(value)
}

function toBoolean(value) {
  if (value === null || value === undefined || value === '') return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false
    const num = parseFloat(value)
    return !isNaN(num) && num !== 0
  }
  return true
}

function compareValues(a, b) {
  if (a === b) return 0
  const numA = toNumber(a)
  const numB = toNumber(b)
  if (numA !== null && numB !== null) {
    return numA - numB
  }
  return String(a).localeCompare(String(b))
}

function isError(value) {
  return typeof value === 'string' && value.startsWith('#') && value.endsWith('!')
}

class FormulaEngine {
  constructor() {
    this.sheets = {}
    this.cache = new Map()
    this.dependencies = new Map()
    this.dependents = new Map()
  }

  setSheet(name, data) {
    this.sheets[name] = data
  }

  getCell(sheetName, col, row) {
    const sheet = this.sheets[sheetName]
    if (!sheet) return null
    if (row < 0 || col < 0) return null
    const rowData = sheet[row]
    if (!rowData) return null
    return rowData[col] || null
  }

  getCellValue(sheetName, col, row, currentChain = new Set(), depth = 0) {
    const cellKey = `${sheetName}!${colIndexToName(col)}${row + 1}`

    if (depth > MAX_CHAIN_DEPTH) {
      return FORMULA_ERRORS.CHAIN_TOO_DEEP
    }

    if (currentChain.has(cellKey)) {
      return FORMULA_ERRORS.CIRCULAR
    }

    if (this.cache.has(cellKey)) {
      return this.cache.get(cellKey)
    }

    const cell = this.getCell(sheetName, col, row)
    if (!cell) {
      this.cache.set(cellKey, '')
      return ''
    }

    const value = cell.value
    if (typeof value === 'string' && value.startsWith('=')) {
      currentChain.add(cellKey)
      const result = this.evaluate(value.substring(1), sheetName, currentChain, depth + 1, col, row)
      currentChain.delete(cellKey)
      this.cache.set(cellKey, result)
      return result
    }

    this.cache.set(cellKey, value)
    return value
  }

  evaluate(formula, currentSheet, currentChain = new Set(), depth = 0, baseCol = 0, baseRow = 0) {
    if (depth > MAX_CHAIN_DEPTH) {
      return FORMULA_ERRORS.CHAIN_TOO_DEEP
    }

    const tokens = this.tokenize(formula)
    if (tokens.error) return tokens.error

    try {
      const ast = this.parse(tokens)
      return this.evalNode(ast, currentSheet, currentChain, depth, baseCol, baseRow)
    } catch (e) {
      if (isError(e.message)) return e.message
      return FORMULA_ERRORS.VALUE
    }
  }

  tokenize(formula) {
    const tokens = []
    let i = 0

    while (i < formula.length) {
      const char = formula[i]

      if (char === ' ' || char === '\t') {
        i++
        continue
      }

      if (char === '"') {
        let str = ''
        i++
        while (i < formula.length && formula[i] !== '"') {
          if (formula[i] === '\\' && i + 1 < formula.length) {
            str += formula[i + 1]
            i += 2
          } else {
            str += formula[i]
            i++
          }
        }
        i++
        tokens.push({ type: 'string', value: str })
        continue
      }

      if (char >= '0' && char <= '9' || char === '.') {
        let num = ''
        while (i < formula.length && (formula[i] >= '0' && formula[i] <= '9' || formula[i] === '.' || formula[i] === 'e' || formula[i] === 'E' || formula[i] === '+' || formula[i] === '-')) {
          num += formula[i]
          i++
        }
        const parsed = parseFloat(num)
        if (isNaN(parsed)) return { error: FORMULA_ERRORS.VALUE }
        tokens.push({ type: 'number', value: parsed })
        continue
      }

      if ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_' || char === "'") {
        let ident = ''
        
        if (char === "'") {
          ident += char
          i++
          while (i < formula.length && formula[i] !== "'") {
            ident += formula[i]
            i++
          }
          if (i < formula.length) {
            ident += formula[i]
            i++
          }
        } else {
          while (i < formula.length && ((formula[i] >= 'a' && formula[i] <= 'z') || (formula[i] >= 'A' && formula[i] <= 'Z') || (formula[i] >= '0' && formula[i] <= '9') || formula[i] === '_')) {
            ident += formula[i]
            i++
          }
        }

        if (i < formula.length && formula[i] === '!') {
          ident += '!'
          i++
          while (i < formula.length && ((formula[i] >= 'a' && formula[i] <= 'z') || (formula[i] >= 'A' && formula[i] <= 'Z') || (formula[i] >= '0' && formula[i] <= '9') || formula[i] === '$' || formula[i] === '_')) {
            ident += formula[i]
            i++
          }
          if (i < formula.length && formula[i] === ':') {
            ident += ':'
            i++
            while (i < formula.length && ((formula[i] >= 'a' && formula[i] <= 'z') || (formula[i] >= 'A' && formula[i] <= 'Z') || (formula[i] >= '0' && formula[i] <= '9') || formula[i] === '$' || formula[i] === '_')) {
              ident += formula[i]
              i++
            }
          }
        } else if (i < formula.length && formula[i] === ':') {
          ident += ':'
          i++
          while (i < formula.length && ((formula[i] >= 'a' && formula[i] <= 'z') || (formula[i] >= 'A' && formula[i] <= 'Z') || (formula[i] >= '0' && formula[i] <= '9') || formula[i] === '$' || formula[i] === '_')) {
            ident += formula[i]
            i++
          }
        }

        if (i < formula.length && formula[i] === '(') {
          tokens.push({ type: 'function', value: ident.toUpperCase() })
          tokens.push({ type: 'paren', value: '(' })
          i++
        } else if (this.isCellRef(ident) || this.isRangeRef(ident) || ident.includes('!')) {
          tokens.push({ type: 'cellref', value: ident })
        } else {
          if (FUNCTIONS[ident.toUpperCase()]) {
            tokens.push({ type: 'function', value: ident.toUpperCase() })
            tokens.push({ type: 'paren', value: '(' })
            i++
          } else {
            tokens.push({ type: 'identifier', value: ident })
          }
        }
        continue
      }

      if (char === '(' || char === ')') {
        tokens.push({ type: 'paren', value: char })
        i++
        continue
      }

      if (char === ',' || char === ';') {
        tokens.push({ type: 'comma', value: char })
        i++
        continue
      }

      if (char === '+' || char === '-' || char === '*' || char === '/' || char === '^' || char === '%' || char === '&') {
        tokens.push({ type: 'operator', value: char })
        i++
        continue
      }

      if (char === '<' || char === '>' || char === '=') {
        let op = char
        i++
        if (i < formula.length && (formula[i] === '=' || (char === '<' && formula[i] === '>'))) {
          op += formula[i]
          i++
        }
        tokens.push({ type: 'operator', value: op })
        continue
      }

      return { error: FORMULA_ERRORS.VALUE }
    }

    return tokens
  }

  isCellRef(str) {
    return /^\$?[A-Za-z]+\$?\d+$/.test(str)
  }

  isRangeRef(str) {
    return /^\$?[A-Za-z]+\$?\d+:\$?[A-Za-z]+\$?\d+$/.test(str)
  }

  parse(tokens) {
    let pos = 0

    function peek() { return tokens[pos] }
    function consume() { return tokens[pos++] }
    function expect(type, value = null) {
      const t = consume()
      if (!t || t.type !== type || (value !== null && t.value !== value)) {
        throw new Error(FORMULA_ERRORS.VALUE)
      }
      return t
    }

    function parseExpression() {
      return parseComparison()
    }

    function parseComparison() {
      let left = parseAddSub()
      while (peek() && peek().type === 'operator' && ['=', '<>', '<', '>', '<=', '>='].includes(peek().value)) {
        const op = consume().value
        const right = parseAddSub()
        left = { type: 'binary', op, left, right }
      }
      return left
    }

    function parseAddSub() {
      let left = parseMulDiv()
      while (peek() && peek().type === 'operator' && (peek().value === '+' || peek().value === '-')) {
        const op = consume().value
        const right = parseMulDiv()
        left = { type: 'binary', op, left, right }
      }
      return left
    }

    function parseMulDiv() {
      let left = parsePower()
      while (peek() && peek().type === 'operator' && (peek().value === '*' || peek().value === '/')) {
        const op = consume().value
        const right = parsePower()
        left = { type: 'binary', op, left, right }
      }
      return left
    }

    function parsePower() {
      let left = parseConcat()
      while (peek() && peek().type === 'operator' && peek().value === '^') {
        const op = consume().value
        const right = parseConcat()
        left = { type: 'binary', op, left, right }
      }
      return left
    }

    function parseConcat() {
      let left = parseUnary()
      while (peek() && peek().type === 'operator' && peek().value === '&') {
        const op = consume().value
        const right = parseUnary()
        left = { type: 'binary', op, left, right }
      }
      return left
    }

    function parseUnary() {
      if (peek() && peek().type === 'operator' && (peek().value === '+' || peek().value === '-')) {
        const op = consume().value
        const operand = parseUnary()
        return { type: 'unary', op, operand }
      }
      return parsePostfix()
    }

    function parsePostfix() {
      let operand = parsePrimary()
      while (peek() && peek().type === 'operator' && peek().value === '%') {
        consume()
        operand = { type: 'postfix', op: '%', operand }
      }
      return operand
    }

    function parsePrimary() {
      const t = peek()
      if (!t) throw new Error(FORMULA_ERRORS.VALUE)

      if (t.type === 'number') {
        consume()
        return { type: 'literal', value: t.value }
      }

      if (t.type === 'string') {
        consume()
        return { type: 'literal', value: t.value }
      }

      if (t.type === 'cellref') {
        consume()
        return { type: 'cellref', value: t.value }
      }

      if (t.type === 'identifier') {
        consume()
        if (t.value.toUpperCase() === 'TRUE') return { type: 'literal', value: true }
        if (t.value.toUpperCase() === 'FALSE') return { type: 'literal', value: false }
        throw new Error(FORMULA_ERRORS.NAME)
      }

      if (t.type === 'function') {
        const funcName = consume().value
        expect('paren', '(')
        const args = []
        if (peek() && peek().value !== ')') {
          args.push(parseExpression())
          while (peek() && peek().type === 'comma') {
            consume()
            args.push(parseExpression())
          }
        }
        expect('paren', ')')
        return { type: 'function', name: funcName, args }
      }

      if (t.type === 'paren' && t.value === '(') {
        consume()
        const expr = parseExpression()
        expect('paren', ')')
        return expr
      }

      throw new Error(FORMULA_ERRORS.VALUE)
    }

    const result = parseExpression()
    if (pos < tokens.length) throw new Error(FORMULA_ERRORS.VALUE)
    return result
  }

  evalNode(node, currentSheet, currentChain, depth, baseCol, baseRow) {
    if (depth > MAX_CHAIN_DEPTH) {
      return FORMULA_ERRORS.CHAIN_TOO_DEEP
    }

    switch (node.type) {
      case 'literal':
        return node.value

      case 'cellref': {
        const { sheetName, ref } = parseSheetRef(node.value)
        const sheet = sheetName || currentSheet

        if (ref.includes(':')) {
          const range = parseRangeRef(ref)
          if (!range) return FORMULA_ERRORS.REF
          return this.getRangeValues(sheet, range, currentChain, depth)
        }

        const cell = parseCellRef(ref)
        if (!cell) return FORMULA_ERRORS.REF

        if (!this.sheets[sheet]) return FORMULA_ERRORS.REF

        return this.getCellValue(sheet, cell.col, cell.row, currentChain, depth + 1)
      }

      case 'unary': {
        const val = this.evalNode(node.operand, currentSheet, currentChain, depth + 1, baseCol, baseRow)
        if (isError(val)) return val
        const num = toNumber(val)
        if (num === null) return FORMULA_ERRORS.VALUE
        return node.op === '-' ? -num : num
      }

      case 'postfix': {
        const val = this.evalNode(node.operand, currentSheet, currentChain, depth + 1, baseCol, baseRow)
        if (isError(val)) return val
        const num = toNumber(val)
        if (num === null) return FORMULA_ERRORS.VALUE
        return num / 100
      }

      case 'binary': {
        if (node.op === '&') {
          const left = this.evalNode(node.left, currentSheet, currentChain, depth + 1, baseCol, baseRow)
          const right = this.evalNode(node.right, currentSheet, currentChain, depth + 1, baseCol, baseRow)
          if (isError(left)) return left
          if (isError(right)) return right
          return toString(left) + toString(right)
        }

        if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
          const left = this.evalNode(node.left, currentSheet, currentChain, depth + 1, baseCol, baseRow)
          const right = this.evalNode(node.right, currentSheet, currentChain, depth + 1, baseCol, baseRow)
          if (isError(left)) return left
          if (isError(right)) return right
          const cmp = compareValues(left, right)
          switch (node.op) {
            case '=': return cmp === 0
            case '<>': return cmp !== 0
            case '<': return cmp < 0
            case '>': return cmp > 0
            case '<=': return cmp <= 0
            case '>=': return cmp >= 0
          }
        }

        const left = this.evalNode(node.left, currentSheet, currentChain, depth + 1, baseCol, baseRow)
        const right = this.evalNode(node.right, currentSheet, currentChain, depth + 1, baseCol, baseRow)
        if (isError(left)) return left
        if (isError(right)) return right

        const numLeft = toNumber(left)
        const numRight = toNumber(right)
        if (numLeft === null || numRight === null) return FORMULA_ERRORS.VALUE

        switch (node.op) {
          case '+': return numLeft + numRight
          case '-': return numLeft - numRight
          case '*': return numLeft * numRight
          case '/':
            if (numRight === 0) return FORMULA_ERRORS.DIV0
            return numLeft / numRight
          case '^': return Math.pow(numLeft, numRight)
          default: return FORMULA_ERRORS.VALUE
        }
      }

      case 'function': {
        const func = FUNCTIONS[node.name]
        if (!func) return FORMULA_ERRORS.NAME

        const args = node.args.map(arg => this.evalNode(arg, currentSheet, currentChain, depth + 1, baseCol, baseRow))
        
        for (const arg of args) {
          if (isError(arg)) return arg
        }

        try {
          return func(args, (sheet, col, row) => this.getCellValue(sheet, col, row, currentChain, depth + 1))
        } catch (e) {
          return FORMULA_ERRORS.VALUE
        }
      }

      default:
        return FORMULA_ERRORS.VALUE
    }
  }

  getRangeValues(sheetName, range, currentChain = new Set(), depth = 0) {
    const result = []
    for (let row = range.startRow; row <= range.endRow; row++) {
      const rowData = []
      for (let col = range.startCol; col <= range.endCol; col++) {
        rowData.push(this.getCellValue(sheetName, col, row, currentChain, depth + 1))
      }
      result.push(rowData)
    }
    return result
  }

  invalidateCell(sheetName, col, row) {
    const cellKey = `${sheetName}!${colIndexToName(col)}${row + 1}`
    this.cache.delete(cellKey)
    this.invalidateDependents(cellKey)
  }

  invalidateAll() {
    this.cache.clear()
  }

  getDependencies(sheetName, col, row) {
    const cell = this.getCell(sheetName, col, row)
    if (!cell || typeof cell.value !== 'string' || !cell.value.startsWith('=')) {
      return []
    }

    const deps = []
    const formula = cell.value.substring(1)
    const tokens = this.tokenize(formula)
    if (tokens.error) return []

    for (const token of tokens) {
      if (token.type === 'cellref') {
        const { sheetName: refSheet, ref } = parseSheetRef(token.value)
        const sheet = refSheet || sheetName

        if (ref.includes(':')) {
          const range = parseRangeRef(ref)
          if (range) {
            for (let r = range.startRow; r <= range.endRow; r++) {
              for (let c = range.startCol; c <= range.endCol; c++) {
                deps.push({ sheet, col: c, row: r })
              }
            }
          }
        } else {
          const cellRef = parseCellRef(ref)
          if (cellRef) {
            deps.push({ sheet, col: cellRef.col, row: cellRef.row })
          }
        }
      }
    }

    return deps
  }

  invalidateDependents(cellKey) {
  }

  getReferencedCells(formula, currentSheet) {
    if (!formula || !formula.startsWith('=')) return []
    const tokens = this.tokenize(formula.substring(1))
    if (tokens.error) return []

    const refs = []
    for (const token of tokens) {
      if (token.type === 'cellref') {
        const { sheetName, ref } = parseSheetRef(token.value)
        const sheet = sheetName || currentSheet
        refs.push({ sheet, ref: token.value })
      }
    }
    return refs
  }

  detectCircularReference(sheetName, col, row) {
    const cellKey = `${sheetName}!${colIndexToName(col)}${row + 1}`
    return this._detectCircular(cellKey, new Set(), new Set())
  }

  _detectCircular(cellKey, visited, stack) {
    if (stack.has(cellKey)) return true
    if (visited.has(cellKey)) return false

    visited.add(cellKey)
    stack.add(cellKey)

    const [sheet, ref] = cellKey.split('!')
    const cellRef = parseCellRef(ref)
    if (!cellRef) return false

    const deps = this.getDependencies(sheet, cellRef.col, cellRef.row)
    for (const dep of deps) {
      const depKey = `${dep.sheet}!${colIndexToName(dep.col)}${dep.row + 1}`
      if (this._detectCircular(depKey, visited, stack)) return true
    }

    stack.delete(cellKey)
    return false
  }

  adjustFormulaReference(formula, deltaCol, deltaRow) {
    if (!formula || !formula.startsWith('=')) return formula

    let result = '='
    const tokens = this.tokenize(formula.substring(1))
    if (tokens.error) return formula

    for (const token of tokens) {
      if (token.type === 'cellref') {
        const { sheetName, ref } = parseSheetRef(token.value)
        
        if (ref.includes(':')) {
          const parts = ref.split(':')
          const adjusted = parts.map(part => {
            const cell = parseCellRef(part)
            if (!cell) return part
            const newCol = cell.colAbsolute ? cell.col : cell.col + deltaCol
            const newRow = cell.rowAbsolute ? cell.row : cell.row + deltaRow
            return (cell.colAbsolute ? '$' : '') + colIndexToName(newCol) +
                   (cell.rowAbsolute ? '$' : '') + (newRow + 1)
          })
          result += (sheetName ? sheetName + '!' : '') + adjusted.join(':')
        } else {
          const cell = parseCellRef(ref)
          if (cell) {
            const newCol = cell.colAbsolute ? cell.col : cell.col + deltaCol
            const newRow = cell.rowAbsolute ? cell.row : cell.row + deltaRow
            result += (sheetName ? sheetName + '!' : '') +
                      (cell.colAbsolute ? '$' : '') + colIndexToName(newCol) +
                      (cell.rowAbsolute ? '$' : '') + (newRow + 1)
          } else {
            result += token.value
          }
        }
      } else if (token.type === 'string') {
        result += '"' + token.value + '"'
      } else if (token.type === 'number') {
        result += token.value
      } else {
        result += token.value
      }
    }

    return result
  }
}

export {
  FormulaEngine,
  FORMULA_ERRORS,
  colIndexToName,
  colNameToIndex,
  parseCellRef,
  parseRangeRef,
  parseSheetRef,
  toNumber,
  toString,
  toBoolean,
  isError
}
