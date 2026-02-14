// Notepad App - Notes/Text Editor
if (typeof NotesApp === 'undefined') {
    class NotesApp {
        constructor() {
            this.window = null;
            this.windowId = null;
            this.textarea = null;
            this.wordCount = 0;
            this.charCount = 0;
            this.isModified = false;
            this.fileName = 'Untitled.txt';
        }

        static getInstance() {
            if (!NotesApp.instance) {
                NotesApp.instance = new NotesApp();
            }
            return NotesApp.instance;
        }

        async init(options = {}) {
            this.windowManager = options.windowManager;
            this.appConfig = options.appConfig;
            return true;
        }

        async open(options = {}) {
            const { fileName, content } = options;
            
            try {
                const existingWindow = this.windowId ? this.windowManager?.getWindow(this.windowId) : null;

                if (existingWindow) {
                    this.window = existingWindow;
                    this.setupElements();

                    if (fileName) {
                        this.fileName = fileName;
                    }

                    if (typeof content === 'string' && this.textarea) {
                        this.textarea.value = content;
                    }

                    this.isModified = false;
                    this.updateWindowTitle();
                    this.updateStats();

                    if (this.windowManager) {
                        if (existingWindow.isMinimized) {
                            this.windowManager.restoreWindow(this.windowId);
                        } else {
                            this.windowManager.focusWindow(this.windowId);
                        }
                    }

                    if (this.textarea) {
                        this.textarea.focus();
                    }
                    return;
                }

                if (fileName) {
                    this.fileName = fileName;
                }

                this.window = this.windowManager.createWindow({
                    title: this.isModified ? `${this.fileName} • ` : this.fileName,
                    resizable: true,
                    icon: this.appConfig?.icon || 'images/app3.png',
                    appId: this.appConfig?.id || 'app3',
                    content: this.getNotesContent(),
                    footerText: this.getFooterText(),
                    className: 'notes-app-window'
                });
                this.windowId = this.window?.id || null;

                this.setupElements();
                this.setupEventListeners();
                
                if (content) {
                    this.textarea.value = content;
                    this.isModified = false; // File was loaded, not modified
                    this.updateStats();
                } else if (fileName && fileName !== 'Untitled.txt') {
                    // If we have a filename but no content, mark as not modified
                    this.isModified = false;
                    this.updateStats();
                }

                // Focus on textarea
                setTimeout(() => {
                    if (this.textarea) {
                        this.textarea.focus();
                    }
                }, 100);

            } catch (error) {
                console.error('Failed to open Notes app:', error);
            }
        }

        getNotesContent() {
            return `
                <div class="notes-container">
                    <div class="notes-toolbar">
                        <div class="toolbar-left">
                            <button class="toolbar-btn" id="new-btn" title="New (Ctrl+N)">
                                <i class="fas fa-file"></i>
                            </button>
                            <button class="toolbar-btn" id="open-btn" title="Open (Ctrl+O)">
                                <i class="fas fa-folder-open"></i>
                            </button>
                            <button class="toolbar-btn" id="save-btn" title="Save (Ctrl+S)">
                                <i class="fas fa-save"></i>
                            </button>
                            <div class="toolbar-divider"></div>
                            <button class="toolbar-btn" id="undo-btn" title="Undo (Ctrl+Z)">
                                <i class="fas fa-undo"></i>
                            </button>
                            <button class="toolbar-btn" id="redo-btn" title="Redo (Ctrl+Y)">
                                <i class="fas fa-redo"></i>
                            </button>
                        </div>
                        <div class="toolbar-right">
                            <select class="font-size-select" id="font-size-select">
                                <option value="12">12px</option>
                                <option value="14" selected>14px</option>
                                <option value="16">16px</option>
                                <option value="18">18px</option>
                                <option value="20">20px</option>
                                <option value="24">24px</option>
                            </select>
                            <button class="toolbar-btn" id="word-wrap-btn" title="Toggle Word Wrap">
                                <i class="fas fa-align-left"></i>
                            </button>
                        </div>
                    </div>
                    <div class="notes-editor">
                        <textarea 
                            id="notes-textarea" 
                            placeholder="Start typing your notes..."
                            spellcheck="true"
                        ></textarea>
                    </div>
                </div>
            `;
        }

        setupElements() {
            if (!this.window?.element) return;

            this.textarea = this.window.element.querySelector('#notes-textarea');
            this.newBtn = this.window.element.querySelector('#new-btn');
            this.openBtn = this.window.element.querySelector('#open-btn');
            this.saveBtn = this.window.element.querySelector('#save-btn');
            this.undoBtn = this.window.element.querySelector('#undo-btn');
            this.redoBtn = this.window.element.querySelector('#redo-btn');
            this.fontSizeSelect = this.window.element.querySelector('#font-size-select');
            this.wordWrapBtn = this.window.element.querySelector('#word-wrap-btn');
        }

        setupEventListeners() {
            if (!this.textarea) return;

            // Text change events
            this.textarea.addEventListener('input', () => {
                this.markAsModified();
                this.updateStats();
            });

            this.textarea.addEventListener('keydown', (e) => {
                this.handleKeyboardShortcuts(e);
            });

            // Toolbar buttons
            this.newBtn?.addEventListener('click', () => this.newDocument());
            this.openBtn?.addEventListener('click', () => this.openDocument());
            this.saveBtn?.addEventListener('click', () => this.saveDocument());
            this.undoBtn?.addEventListener('click', () => this.undo());
            this.redoBtn?.addEventListener('click', () => this.redo());
            this.fontSizeSelect?.addEventListener('change', (e) => this.changeFontSize(e.target.value));
            this.wordWrapBtn?.addEventListener('click', () => this.toggleWordWrap());

            // Initial stats update
            this.updateStats();
        }

        handleKeyboardShortcuts(e) {
            if (e.ctrlKey) {
                switch (e.key.toLowerCase()) {
                    case 'n':
                        e.preventDefault();
                        this.newDocument();
                        break;
                    case 's':
                        e.preventDefault();
                        this.saveDocument();
                        break;
                    case 'o':
                        e.preventDefault();
                        this.openDocument();
                        break;
                    case 'z':
                        if (!e.shiftKey) {
                            e.preventDefault();
                            this.undo();
                        }
                        break;
                    case 'y':
                        e.preventDefault();
                        this.redo();
                        break;
                }
            }
        }

        markAsModified() {
            if (!this.isModified) {
                this.isModified = true;
                this.updateWindowTitle();
            }
        }

        updateWindowTitle() {
            if (this.window?.element) {
                const titleElement = this.window.element.querySelector('.window-title');
                if (titleElement) {
                    titleElement.textContent = this.isModified ? `${this.fileName} • ` : this.fileName;
                }
            }
        }

        updateStats() {
            if (!this.textarea) return;

            const text = this.textarea.value;
            this.charCount = text.length;
            this.wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

            this.windowManager?.updateFooter(this.window.id, this.getFooterText());
        }

        getFooterText() {
            return `Words: ${this.wordCount} | Characters: ${this.charCount}`;
        }

        newDocument() {
            if (this.isModified) {
                if (!confirm('You have unsaved changes. Do you want to continue?')) {
                    return;
                }
            }

            this.textarea.value = '';
            this.fileName = 'Untitled.txt';
            this.isModified = false;
            this.updateWindowTitle();
            this.updateStats();
            this.textarea.focus();
        }

        async openDocument() {
            try {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.txt,.md,.json,.js,.css,.html,.xml';
                
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            this.textarea.value = event.target.result;
                            this.fileName = file.name;
                            this.isModified = false;
                            this.updateWindowTitle();
                            this.updateStats();
                        };
                        reader.readAsText(file);
                    }
                };
                
                input.click();
            } catch (error) {
                console.error('Error opening file:', error);
            }
        }

        saveDocument() {
            try {
                const content = this.textarea.value;
                const blob = new Blob([content], { type: 'text/plain' });
                const url = window.URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = this.fileName;
                a.click();
                
                window.URL.revokeObjectURL(url);
                
                this.isModified = false;
                this.updateWindowTitle();
            } catch (error) {
                console.error('Error saving file:', error);
            }
        }

        undo() {
            if (this.textarea && this.textarea.value) {
                document.execCommand('undo');
                this.updateStats();
            }
        }

        redo() {
            if (this.textarea) {
                document.execCommand('redo');
                this.updateStats();
            }
        }

        changeFontSize(size) {
            if (this.textarea) {
                this.textarea.style.fontSize = `${size}px`;
            }
        }

        toggleWordWrap() {
            if (this.textarea) {
                const currentWrap = this.textarea.style.whiteSpace;
                this.textarea.style.whiteSpace = currentWrap === 'nowrap' ? 'pre-wrap' : 'nowrap';
                
                const icon = this.wordWrapBtn.querySelector('i');
                if (icon) {
                    icon.className = currentWrap === 'nowrap' ? 'fas fa-align-left' : 'fas fa-align-justify';
                }
            }
        }
    }

    // Make it globally available
    window.NotesApp = NotesApp;
}
