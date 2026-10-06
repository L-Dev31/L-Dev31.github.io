// ======================================
// CALCULATOR APP - UNIVERSAL WINDOW MANAGER
// ======================================

// Avoid redeclaration if already defined
if (typeof CalculatorApp === 'undefined') {
    class CalculatorApp {
        constructor() {
            this.windowId = null;
            this.windowManager = null;
            this.appConfig = null;
            this.display = '0';
        this.previousValue = null;
        this.operation = null;
        this.waitingForOperand = false;
    }

    async init(options = {}) {
        try {
            this.windowManager = options.windowManager;
            this.appConfig = options.appConfig;
            
            console.log('✅ Calculator app initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Calculator app:', error);
            return false;
        }
    }

    async open() {
        if (this.windowId && this.windowManager) {
            // Window already exists, just focus it
            const windowObj = this.windowManager.getWindow(this.windowId);
            if (windowObj) {
                if (windowObj.isMinimized) {
                    this.windowManager.restoreWindow(this.windowId);
                } else {
                    this.windowManager.focusWindow(this.windowId);
                }
                return;
            }
        }

        // Create the main content
        const content = this.createCalculatorContent();
        
        // Create window
        const windowObj = this.windowManager.createWindow({
            id: `calculator-${Date.now()}`,
            title: 'Calculator',
            icon: this.appConfig?.icon || 'images/app6.png',
            appId: this.appConfig?.id || 'app6',
            content: content,
            footerText: 'Standard Calculator',
            className: 'calculator-app-window'
        });

        this.windowId = windowObj.id;

        // Setup app-specific event listeners
        this.setupEventListeners();
    }
    
    createCalculatorContent() {
        return `
            <div class="calculator-container">
                <div class="calculator-display">
                    <div id="calcDisplay">0</div>
                </div>
                <div class="calculator-buttons">
                    <div class="calculator-row">
                        <button class="calc-btn function-btn" data-action="clear">C</button>
                        <button class="calc-btn function-btn" data-action="clearEntry">CE</button>
                        <button class="calc-btn function-btn" data-action="backspace">⌫</button>
                        <button class="calc-btn operator-btn" data-action="divide">÷</button>
                    </div>
                    <div class="calculator-row">
                        <button class="calc-btn number-btn" data-number="7">7</button>
                        <button class="calc-btn number-btn" data-number="8">8</button>
                        <button class="calc-btn number-btn" data-number="9">9</button>
                        <button class="calc-btn operator-btn" data-action="multiply">×</button>
                    </div>
                    <div class="calculator-row">
                        <button class="calc-btn number-btn" data-number="4">4</button>
                        <button class="calc-btn number-btn" data-number="5">5</button>
                        <button class="calc-btn number-btn" data-number="6">6</button>
                        <button class="calc-btn operator-btn" data-action="subtract">−</button>
                    </div>
                    <div class="calculator-row">
                        <button class="calc-btn number-btn" data-number="1">1</button>
                        <button class="calc-btn number-btn" data-number="2">2</button>
                        <button class="calc-btn number-btn" data-number="3">3</button>
                        <button class="calc-btn operator-btn" data-action="add">+</button>
                    </div>
                    <div class="calculator-row">
                        <button class="calc-btn number-btn wide-btn" data-number="0">0</button>
                        <button class="calc-btn number-btn" data-action="decimal">.</button>
                        <button class="calc-btn operator-btn equals-btn" data-action="equals">=</button>
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;

        const element = window.element;

        // Number buttons
        element.querySelectorAll('.number-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (e.target.dataset.number) {
                    this.inputNumber(e.target.dataset.number);
                } else if (e.target.dataset.action === 'decimal') {
                    this.inputDecimal();
                }
            });
        });

        // Operator buttons
        element.querySelectorAll('.operator-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (action === 'equals') {
                    this.calculate();
                } else if (['add', 'subtract', 'multiply', 'divide'].includes(action)) {
                    this.setOperation(action);
                }
            });
        });

        // Function buttons
        element.querySelectorAll('.function-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (action === 'clear') {
                    this.clear();
                } else if (action === 'clearEntry') {
                    this.clearEntry();
                } else if (action === 'backspace') {
                    this.backspace();
                }
            });
        });
    }

    updateDisplay() {
        const window = this.windowManager.getWindow(this.windowId);
        if (!window) return;

        const displayElement = window.element.querySelector('#calcDisplay');
        if (displayElement) {
            displayElement.textContent = this.display;
        }
    }

    inputNumber(num) {
        if (this.waitingForOperand) {
            this.display = num;
            this.waitingForOperand = false;
        } else {
            this.display = this.display === '0' ? num : this.display + num;
        }
        this.updateDisplay();
    }

    inputDecimal() {
        if (this.waitingForOperand) {
            this.display = '0.';
            this.waitingForOperand = false;
        } else if (this.display.indexOf('.') === -1) {
            this.display += '.';
        }
        this.updateDisplay();
    }

    setOperation(nextOperation) {
        const inputValue = parseFloat(this.display);

        if (this.previousValue === null) {
            this.previousValue = inputValue;
        } else if (this.operation) {
            const currentValue = this.previousValue || 0;
            const newValue = this.performCalculation(currentValue, inputValue, this.operation);

            this.display = String(newValue);
            this.previousValue = newValue;
        }

        this.waitingForOperand = true;
        this.operation = nextOperation;
        this.updateDisplay();
    }

    calculate() {
        if (this.operation && this.previousValue !== null) {
            const inputValue = parseFloat(this.display);
            const newValue = this.performCalculation(this.previousValue, inputValue, this.operation);
            
            this.display = String(newValue);
            this.previousValue = null;
            this.operation = null;
            this.waitingForOperand = true;
            this.updateDisplay();
        }
    }

    performCalculation(firstOperand, secondOperand, operation) {
        switch (operation) {
            case 'add':
                return firstOperand + secondOperand;
            case 'subtract':
                return firstOperand - secondOperand;
            case 'multiply':
                return firstOperand * secondOperand;
            case 'divide':
                return secondOperand !== 0 ? firstOperand / secondOperand : 0;
            default:
                return secondOperand;
        }
    }

    clear() {
        this.display = '0';
        this.previousValue = null;
        this.operation = null;
        this.waitingForOperand = false;
        this.updateDisplay();
    }

    clearEntry() {
        this.display = '0';
        this.updateDisplay();
    }

    backspace() {
        if (this.display.length > 1) {
            this.display = this.display.slice(0, -1);
        } else {
            this.display = '0';
        }
        this.updateDisplay();
    }

    close() {
        if (this.windowId && this.windowManager) {
            this.windowManager.closeWindow(this.windowId);
            this.windowId = null;
        }
    }
}

// Export for global use
window.CalculatorApp = CalculatorApp;

// Close the conditional block
}