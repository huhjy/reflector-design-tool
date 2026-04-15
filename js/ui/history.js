// Undo / Redo manager – stores deep-cloned scene snapshots.

export class UndoManager {
  /**
   * @param {number} maxSize  Maximum number of undo states to keep.
   */
  constructor(maxSize = 50) {
    this.maxSize = maxSize;
    /** @type {string[]} */
    this._undoStack = [];
    /** @type {string[]} */
    this._redoStack = [];
    this._listeners = [];
  }

  /* ── public API ─────────────────────────────────────────── */

  /** Save the current scene state (call BEFORE a change happens). */
  push(scene) {
    this._undoStack.push(JSON.stringify(scene));
    if (this._undoStack.length > this.maxSize) {
      this._undoStack.shift();          // drop oldest
    }
    this._redoStack.length = 0;         // new change invalidates redo
    this._notify();
  }

  /** Undo: restore previous state, stash current for redo.
   *  @param {object} currentScene  The live scene object (pre-undo).
   *  @returns {object|null} The restored scene snapshot, or null if nothing to undo.
   */
  undo(currentScene) {
    if (!this.canUndo()) return null;
    this._redoStack.push(JSON.stringify(currentScene));
    const snapshot = this._undoStack.pop();
    this._notify();
    return JSON.parse(snapshot);
  }

  /** Redo: reapply the last undone state.
   *  @param {object} currentScene
   *  @returns {object|null}
   */
  redo(currentScene) {
    if (!this.canRedo()) return null;
    this._undoStack.push(JSON.stringify(currentScene));
    const snapshot = this._redoStack.pop();
    this._notify();
    return JSON.parse(snapshot);
  }

  canUndo() { return this._undoStack.length > 0; }
  canRedo() { return this._redoStack.length > 0; }

  /** Register a callback fired whenever undo/redo availability changes. */
  onChange(fn) { this._listeners.push(fn); }

  /* ── internals ──────────────────────────────────────────── */
  _notify() {
    for (const fn of this._listeners) fn(this.canUndo(), this.canRedo());
  }
}
