if (typeof AvokaDoApp === 'undefined') {
    class AvokaDoApp {
        constructor() {
            this.windowId = null;
            this.windowManager = null;
            this.appConfig = null;
            this.tasks = [];
            this.currentFilter = 'all';
            this.priorities = ['low', 'medium', 'high'];
            this.categories = ['planting', 'watering', 'pruning', 'harvesting', 'maintenance', 'other'];
        }

        async init(options = {}) {
            try {
                this.windowManager = options.windowManager;
                this.appConfig = options.appConfig;
                
                window.avokaDoAppInstance = this;
                await this.open();
                console.log('🌱 AvokaDo Garden Task Manager initialized');
                return true;
            } catch (error) {
                console.error('❌ Failed to initialize AvokaDo app:', error);
                return false;
            }
        }

        async open() {
            if (this.windowId && this.windowManager) {
                this.windowManager.focusWindow(this.windowId);
                return;
            }

            const content = this.createAvokaDoContent();
            const windowObj = this.windowManager.createWindow({
                id: `avokado-${Date.now()}`,
                title: 'AvokaDo - Garden Task Manager',
                width: 900,
                height: 700,
                icon: this.appConfig?.icon || 'images/app10.png',
                appId: this.appConfig?.id || 'app10',
                content: content,
                footerText: this.getFooterText(),
                className: 'avokado-app-window'
            });

            this.windowId = windowObj.id;
            this.setupEventListeners();
            this.loadTasks();
            console.log('🌿 AvokaDo Garden Task Manager opened');
        }

        createAvokaDoContent() {
            return `
                <div class="garden-task-manager">
                    <div class="task-header">
                        <div class="header-content">
                            <div class="app-title">
                                <h1>AvokaDo</h1>
                            </div>
                            <div class="stats-grid">
                                <div class="stat-card">
                                    <i class="fas fa-tasks"></i>
                                    <div class="stat-info">
                                        <span class="stat-number" id="totalTasks">0</span>
                                        <span class="stat-label">Total Tasks</span>
                                    </div>
                                </div>
                                <div class="stat-card">
                                    <i class="fas fa-check-circle"></i>
                                    <div class="stat-info">
                                        <span class="stat-number" id="completedTasks">0</span>
                                        <span class="stat-label">Completed</span>
                                    </div>
                                </div>
                                <div class="stat-card">
                                    <i class="fas fa-clock"></i>
                                    <div class="stat-info">
                                        <span class="stat-number" id="pendingTasks">0</span>
                                        <span class="stat-label">Pending</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="task-controls">
                        <div class="add-task-section">
                            <div class="task-input-group">
                                <input type="text" id="newTaskInput" placeholder="What needs to be done in your garden?" maxlength="100">
                                <select id="taskCategory">
                                    <option value="other">General</option>
                                    <option value="planting">🌱 Planting</option>
                                    <option value="watering">💧 Watering</option>
                                    <option value="pruning">✂️ Pruning</option>
                                    <option value="harvesting">🥕 Harvesting</option>
                                    <option value="maintenance">🔧 Maintenance</option>
                                </select>
                                <select id="taskPriority">
                                    <option value="medium">Medium</option>
                                    <option value="low">Low</option>
                                    <option value="high">High</option>
                                </select>
                                <button id="addTaskBtn" class="add-btn">
                                    <i class="fas fa-plus"></i>
                                    Add Task
                                </button>
                            </div>
                        </div>

                        <div class="filter-section">
                            <div class="filter-tabs">
                                <button class="filter-tab active" data-filter="all">
                                    <i class="fas fa-list"></i>
                                    All Tasks
                                </button>
                                <button class="filter-tab" data-filter="pending">
                                    <i class="fas fa-hourglass-half"></i>
                                    Pending
                                </button>
                                <button class="filter-tab" data-filter="completed">
                                    <i class="fas fa-check-double"></i>
                                    Completed
                                </button>
                            </div>
                            <div class="sort-options">
                                <select id="sortBy">
                                    <option value="date">Sort by Date</option>
                                    <option value="priority">Sort by Priority</option>
                                    <option value="category">Sort by Category</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="tasks-container">
                        <div id="tasksList" class="tasks-list"></div>
                        <div id="emptyState" class="empty-state">
                            <div class="empty-content">
                                <i class="fas fa-leaf empty-icon"></i>
                                <h3>Your garden is all caught up!</h3>
                                <p>No tasks to display. Add a new task to get started with your garden management.</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        setupEventListeners() {
            const window = this.windowManager.getWindow(this.windowId);
            if (!window) return;

            const element = window.element;

            // Add task functionality
            const addTaskBtn = element.querySelector('#addTaskBtn');
            const newTaskInput = element.querySelector('#newTaskInput');
            const taskCategory = element.querySelector('#taskCategory');
            const taskPriority = element.querySelector('#taskPriority');
            const sortBy = element.querySelector('#sortBy');

            addTaskBtn?.addEventListener('click', () => this.addTask());
            newTaskInput?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addTask();
                }
            });

            // Filter tabs
            const filterTabs = element.querySelectorAll('.filter-tab');
            filterTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    filterTabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.currentFilter = tab.dataset.filter;
                    this.renderTasks();
                });
            });

            // Sort functionality
            sortBy?.addEventListener('change', () => {
                this.renderTasks();
            });
        }

        addTask() {
            const window = this.windowManager.getWindow(this.windowId);
            if (!window) return;

            const element = window.element;
            const input = element.querySelector('#newTaskInput');
            const category = element.querySelector('#taskCategory');
            const priority = element.querySelector('#taskPriority');
            
            const taskText = input.value.trim();

            if (taskText) {
                const task = {
                    id: Date.now(),
                    text: taskText,
                    category: category.value,
                    priority: priority.value,
                    completed: false,
                    createdAt: new Date().toISOString(),
                    completedAt: null
                };

                this.tasks.push(task);
                input.value = '';
                this.saveTasks();
                this.renderTasks();
                this.updateStats();
                
                // Add success feedback
                this.showNotification('Task added successfully!', 'success');
            }
        }

        toggleTask(taskId) {
            const task = this.tasks.find(t => t.id === taskId);
            if (task) {
                task.completed = !task.completed;
                task.completedAt = task.completed ? new Date().toISOString() : null;
                this.saveTasks();
                this.renderTasks();
                this.updateStats();
                
                const message = task.completed ? 'Task completed! 🌱' : 'Task reopened';
                this.showNotification(message, task.completed ? 'success' : 'info');
            }
        }

        deleteTask(taskId) {
            this.tasks = this.tasks.filter(t => t.id !== taskId);
            this.saveTasks();
            this.renderTasks();
            this.updateStats();
            this.showNotification('Task deleted', 'info');
        }

        renderTasks() {
            const window = this.windowManager.getWindow(this.windowId);
            if (!window) return;

            const tasksList = window.element.querySelector('#tasksList');
            const emptyState = window.element.querySelector('#emptyState');
            const sortBy = window.element.querySelector('#sortBy');

            let filteredTasks = this.tasks;
            
            // Filter tasks
            if (this.currentFilter === 'pending') {
                filteredTasks = this.tasks.filter(t => !t.completed);
            } else if (this.currentFilter === 'completed') {
                filteredTasks = this.tasks.filter(t => t.completed);
            }

            // Sort tasks
            const sortValue = sortBy?.value || 'date';
            filteredTasks.sort((a, b) => {
                switch (sortValue) {
                    case 'priority':
                        const priorityOrder = { high: 3, medium: 2, low: 1 };
                        return priorityOrder[b.priority] - priorityOrder[a.priority];
                    case 'category':
                        return a.category.localeCompare(b.category);
                    default:
                        return new Date(b.createdAt) - new Date(a.createdAt);
                }
            });

            if (filteredTasks.length === 0) {
                tasksList.style.display = 'none';
                emptyState.style.display = 'flex';
            } else {
                tasksList.style.display = 'block';
                emptyState.style.display = 'none';
                tasksList.innerHTML = filteredTasks.map(task => this.createTaskHTML(task)).join('');
            }
        }

        createTaskHTML(task) {
            const categoryIcons = {
                planting: '🌱',
                watering: '💧',
                pruning: '✂️',
                harvesting: '🥕',
                maintenance: '🔧',
                other: '📝'
            };

            const priorityClasses = {
                low: 'priority-low',
                medium: 'priority-medium',
                high: 'priority-high'
            };

            const formatDate = (dateString) => {
                const date = new Date(dateString);
                return date.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            };

            return `
                <div class="task-item ${task.completed ? 'completed' : ''}" data-task-id="${task.id}">
                    <div class="task-main">
                        <button class="task-checkbox" onclick="window.avokaDoAppInstance.toggleTask(${task.id})">
                            <i class="fas ${task.completed ? 'fa-check-circle' : 'fa-circle'}"></i>
                        </button>
                        <div class="task-content">
                            <div class="task-text">${task.text}</div>
                            <div class="task-meta">
                                <span class="task-category">
                                    ${categoryIcons[task.category]} ${task.category.charAt(0).toUpperCase() + task.category.slice(1)}
                                </span>
                                <span class="task-priority ${priorityClasses[task.priority]}">
                                    ${task.priority.toUpperCase()}
                                </span>
                                <span class="task-date">
                                    <i class="fas fa-calendar-alt"></i>
                                    ${formatDate(task.createdAt)}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="task-actions">
                        <button class="action-btn delete-btn" onclick="window.avokaDoAppInstance.deleteTask(${task.id})" title="Delete task">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
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
            const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            return `🌱 Garden Progress: ${completedTasks}/${totalTasks} tasks completed (${completionRate}%)`;
        }

        showNotification(message, type = 'info') {
            const notification = document.createElement('div');
            notification.className = `garden-notification ${type}`;
            notification.innerHTML = `
                <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i>
                <span>${message}</span>
            `;
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.classList.add('show');
            }, 100);
            
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => {
                    document.body.removeChild(notification);
                }, 300);
            }, 3000);
        }

        saveTasks() {
            try {
                const data = JSON.stringify(this.tasks);
                // Using in-memory storage instead of localStorage for compatibility
                window.avokaDoTasksData = data;
            } catch (error) {
                console.warn('Could not save tasks:', error);
            }
        }

        loadTasks() {
            try {
                const saved = window.avokaDoTasksData || '[]';
                this.tasks = JSON.parse(saved);
            } catch (error) {
                console.warn('Could not load tasks:', error);
                this.tasks = [];
            }

            this.renderTasks();
            this.updateStats();
        }

        close() {
            if (this.windowId && this.windowManager) {
                this.windowManager.closeWindow(this.windowId);
            }
            
            if (window.avokaDoAppInstance === this) {
                window.avokaDoAppInstance = null;
            }
            
            console.log('🌱 AvokaDo Garden Task Manager closed');
        }
    }

    window.AvokaDoApp = AvokaDoApp;
}