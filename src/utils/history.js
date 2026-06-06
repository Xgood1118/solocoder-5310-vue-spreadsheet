const MAX_HISTORY = 100

class HistoryManager {
  constructor() {
    this.undoStack = []
    this.redoStack = []
  }

  push(action) {
    this.undoStack.push(action)
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift()
    }
    this.redoStack = []
  }

  canUndo() {
    return this.undoStack.length > 0
  }

  canRedo() {
    return this.redoStack.length > 0
  }

  undo() {
    if (!this.canUndo()) return null
    const action = this.undoStack.pop()
    this.redoStack.push(action)
    return action
  }

  redo() {
    if (!this.canRedo()) return null
    const action = this.redoStack.pop()
    this.undoStack.push(action)
    return action
  }

  clear() {
    this.undoStack = []
    this.redoStack = []
  }
}

export { HistoryManager, MAX_HISTORY }
