function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj.getTime())
  if (Array.isArray(obj)) return obj.map(item => deepClone(item))
  const result = {}
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      result[key] = deepClone(obj[key])
    }
  }
  return result
}

function debounce(fn, delay) {
  let timer = null
  return function(...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
      timer = null
    }, delay)
  }
}

function throttle(fn, delay) {
  let lastTime = 0
  return function(...args) {
    const now = Date.now()
    if (now - lastTime >= delay) {
      lastTime = now
      fn.apply(this, args)
    }
  }
}

function formatNumber(value, format = 'general') {
  if (value === null || value === undefined || value === '') return ''
  
  const num = Number(value)
  if (isNaN(num)) return String(value)

  switch (format) {
    case 'percent':
      return (num * 100).toFixed(2) + '%'
    case 'currency':
      return '¥' + num.toFixed(2)
    case 'date':
      if (num > 10000) {
        const date = new Date((num - 25569) * 86400 * 1000)
        return date.toLocaleDateString()
      }
      return String(value)
    case 'time':
      const hours = Math.floor(num * 24)
      const minutes = Math.floor((num * 24 - hours) * 60)
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    case 'scientific':
      return num.toExponential(2)
    default:
      if (Math.abs(num) >= 1e12 || (Math.abs(num) < 1e-6 && num !== 0)) {
        return num.toExponential(6)
      }
      return String(num)
  }
}

function getCellDisplayValue(cell, computedValue) {
  if (!cell || cell.value === undefined || cell.value === null || cell.value === '') {
    return ''
  }

  if (typeof cell.value === 'string' && cell.value.startsWith('=')) {
    if (computedValue === undefined || computedValue === null) return ''
    if (typeof computedValue === 'string' && computedValue.startsWith('#')) {
      return computedValue
    }
    if (typeof computedValue === 'number') {
      if (Math.abs(computedValue) >= 1e12 || (Math.abs(computedValue) < 1e-6 && computedValue !== 0)) {
        return computedValue.toExponential(6)
      }
      return String(computedValue)
    }
    if (computedValue instanceof Date) {
      return computedValue.toLocaleDateString()
    }
    return String(computedValue)
  }

  if (typeof cell.value === 'number') {
    if (Math.abs(cell.value) >= 1e12 || (Math.abs(cell.value) < 1e-6 && cell.value !== 0)) {
      return cell.value.toExponential(6)
    }
    return String(cell.value)
  }

  if (typeof cell.value === 'boolean') {
    return cell.value ? 'TRUE' : 'FALSE'
  }

  return String(cell.value)
}

function getCellDataType(cell, computedValue) {
  if (!cell || cell.value === undefined || cell.value === null || cell.value === '') {
    return 'empty'
  }

  if (typeof cell.value === 'string' && cell.value.startsWith('=')) {
    if (computedValue === undefined || computedValue === null) return 'empty'
    if (typeof computedValue === 'number') return 'number'
    if (typeof computedValue === 'boolean') return 'boolean'
    if (computedValue instanceof Date) return 'date'
    return 'string'
  }

  if (typeof cell.value === 'number') return 'number'
  if (typeof cell.value === 'boolean') return 'boolean'
  if (cell.value instanceof Date) return 'date'
  return 'string'
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

export {
  deepClone,
  debounce,
  throttle,
  formatNumber,
  getCellDisplayValue,
  getCellDataType,
  generateId
}
