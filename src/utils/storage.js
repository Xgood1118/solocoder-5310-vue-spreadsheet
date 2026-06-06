const STORAGE_PREFIX = 'vue_spreadsheet_'

function saveToStorage(key, data) {
  try {
    const fullKey = STORAGE_PREFIX + key
    localStorage.setItem(fullKey, JSON.stringify(data))
    return true
  } catch (e) {
    console.error('Failed to save to localStorage:', e)
    return false
  }
}

function loadFromStorage(key) {
  try {
    const fullKey = STORAGE_PREFIX + key
    const data = localStorage.getItem(fullKey)
    return data ? JSON.parse(data) : null
  } catch (e) {
    console.error('Failed to load from localStorage:', e)
    return null
  }
}

function removeFromStorage(key) {
  try {
    const fullKey = STORAGE_PREFIX + key
    localStorage.removeItem(fullKey)
    return true
  } catch (e) {
    console.error('Failed to remove from localStorage:', e)
    return false
  }
}

function getAllKeys() {
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith(STORAGE_PREFIX)) {
      keys.push(key.substring(STORAGE_PREFIX.length))
    }
  }
  return keys
}

export {
  saveToStorage,
  loadFromStorage,
  removeFromStorage,
  getAllKeys,
  STORAGE_PREFIX
}
