if (typeof AvokadooApp === 'undefined') {
    class AvokadooApp {
        constructor() {
            this.windowId = null;
            this.windowManager = null;
            this.appConfig = null;
            this.tasks = [];
            this.currentFilter = 'all';
        }

        async init(options = {}) {
            try {
                this.windowManager = options.windowManager;
                this.appConfig = options.appConfig;
                
                window.avokadooAppInstance = this;
                await this.open();
                console.log('✅ Avokadoo app initialized');
                return true;
            } catch (error) {
                console.error('❌ Failed to initialize Avokadoo app:', error);
                return false;
            }
        }

        async open() {
            if (this.windowId && this.windowManager) {
                return;
            }

            const content = this.createAvokadooContent();
            const windowObj = this.windowManager.createWindow({
                id: `avokadoo-${Date.now()}`,
                title: 'Avokadoo - Task Manager',
                width: 800,
                height: 600,
                icon: this.appConfig?.icon || 'images/app10.png',
                appId: this.appConfig?.id || 'app10',
                content: content,
                footerText: this.getFooterText(),
                className: 'avokadoo-app-window'
            });

            this.windowId = windowObj.id;
            this.setupEventListeners();
            this.loadTasks();
            console.log('✅ Avokadoo app opened successfully');
        }

        createAvokadooContent() {
            return `
                <div class="avokadoo-container">
                    <div class="avokadoo-header">
                        <div class="avokadoo-logo">
                            <i class="fas fa-seedling"></i>
                            <h1>Avokadoo</h1>
                        </div>
                        <div class="avokadoo-stats">
                            <div class="stat-item">
                                <span class="stat-number" id="totalTasks">0</span>
                                <span class="stat-label">Total</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number" id="completedTasks">0</span>
                                <span class="stat-label">Completed</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number" id="pendingTasks">0</span>
                                <span class="stat-label">Pending</span>
                            </div>
                        </div>
                    </div>

                    <div class="avokadoo-toolbar">
                        <div class="task-input-container">
                            <input type="text" id="newTaskInput" placeholder="Add a new task..." maxlength="100">
                            <button id="addTaskBtn" class="add-task-btn">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                        <div class="filter-buttons">
                            <button class="filter-btn active" data-filter="all">All</button>
                            <button class="filter-btn" data-filter="pending">Pending</button>
                            <button class="filter-btn" data-filter="completed">Completed</button>
                        </div>
                    </div>

                    <div class="avokadoo-content">
                        <div id="tasksList" class="tasks-list">
                            <!-- Tasks will be loaded here -->
                        </div>
                        <div id="emptyState" class="empty-state">
                            <i class="fas fa-leaf"></i>
                            <h3>No tasks yet</h3>
                            <p>Add your first task to get started!</p>
                        </div>
                    </div>
                </div>
            `;
        }

        setupEventListeners() {
            const window = this.windowManager.getWindow(this.windowId);
            if (!window) return;

            const element = window.element;

            const addTaskBtn = element.querySelector('#addTaskBtn');
            const newTaskInput = element.querySelector('#newTaskInput');
            const filterBtns = element.querySelectorAll('.filter-btn');

            addTaskBtn?.addEventListener('click', () => this.addTask());
            newTaskInput?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addTask();
                }
            });

            filterBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    filterBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.currentFilter = btn.dataset.filter;
                    this.renderTasks();
                });
            });
        }

        addTask() {
            const window = this.windowManager.getWindow(this.windowId);
            if (!window) return;

            const input = window.element.querySelector('#newTaskInput');
            const taskText = input.value.trim();

            if (taskText) {
                const task = {
                    id: Date.now(),
                    text: taskText,
                    completed: false,
                    createdAt: new Date().toISOString()
                };

                this.tasks.push(task);
                input.value = '';
                this.saveTasks();
                this.renderTasks();
                this.updateStats();
            }
        }

        toggleTask(taskId) {
            const task = this.tasks.find(t => t.id === taskId);
            if (task) {
                task.completed = !task.completed;
                this.saveTasks();
                this.renderTasks();
                this.updateStats();
            }
        }

        deleteTask(taskId) {
            this.tasks = this.tasks.filter(t => t.id !== taskId);
            this.saveTasks();
            this.renderTasks();
            this.updateStats();
        }

        renderTasks() {
            const window = this.windowManager.getWindow(this.windowId);
            if (!window) return;

            const tasksList = window.element.querySelector('#tasksList');
            const emptyState = window.element.querySelector('#emptyState');

            let filteredTasks = this.tasks;
            if (this.currentFilter === 'pending') {
                filteredTasks = this.tasks.filter(t => !t.completed);
            } else if (this.currentFilter === 'completed') {
                filteredTasks = this.tasks.filter(t => t.completed);
            }

            if (filteredTasks.length === 0) {
                tasksList.style.display = 'none';
                emptyState.style.display = 'flex';
            } else {
                tasksList.style.display = 'block';
                emptyState.style.display = 'none';

                tasksList.innerHTML = filteredTasks.map(task => `
                    <div class="task-item ${task.completed ? 'completed' : ''}">
                        <div class="task-checkbox" onclick="window.avokadooAppInstance.toggleTask(${task.id})">
                            <i class="fas ${task.completed ? 'fa-check-circle' : 'fa-circle'}"></i>
                        </div>
                        <div class="task-content">
                            <span class="task-text">${task.text}</span>
                            <span class="task-date">${new Date(task.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div class="task-actions">
                            <button class="delete-btn" onclick="window.avokadooAppInstance.deleteTask(${task.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `).join('');
            }
        }

        updateStats() {
            const window = this.windowManager.getWindow(this.windowId);
            if (!window) return;

            const totalTasks = this.tasks.length;
            const completedTasks = this.tasks.filter(t => t.completed).length;
            const pendingTasks = totalTasks - completedTasks;

            window.element.querySelector('#totalTasks').textContent = totalTasks;
            window.element.querySelector('#completedTasks').textContent = completedTasks;
            window.element.querySelector('#pendingTasks').textContent = pendingTasks;

            if (this.windowManager) {
                this.windowManager.updateFooter(this.windowId, this.getFooterText());
            }
        }

        getFooterText() {
            const totalTasks = this.tasks.length;
            const completedTasks = this.tasks.filter(t => t.completed).length;
            return `${completedTasks}/${totalTasks} tasks completed`;
        }

        saveTasks() {
            try {
                localStorage.setItem('avokadoo_tasks', JSON.stringify(this.tasks));
            } catch (error) {
                console.warn('Could not save tasks to localStorage:', error);
            }
        }

        loadTasks() {
            try {
                const saved = localStorage.getItem('avokadoo_tasks');
                if (saved) {
                    this.tasks = JSON.parse(saved);
                }
            } catch (error) {
                console.warn('Could not load tasks from localStorage:', error);
                this.tasks = [];
            }

            this.renderTasks();
            this.updateStats();
        }

        close() {
            if (this.windowId && this.windowManager) {
                this.windowManager.closeWindow(this.windowId);
            }
            
            if (window.avokadooAppInstance === this) {
                window.avokadooAppInstance = null;
            }
            
            console.log('🥑 Avokadoo app closed');
        }
    }

    window.AvokadooApp = AvokadooApp;
}

