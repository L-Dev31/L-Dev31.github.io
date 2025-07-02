// ======================================
// CALCULATOR APP - MODULAR JAVASCRIPT
// ======================================

class CalculatorApp {
    constructor() {
        this.isOpen = false;
        this.appElement = null;
        this.currentValue = '0';
        this.previousValue = null;
        this.operation = null;
    }

    async init() {
        try {
            this.appElement = document.createElement('div');
            this.appElement.className = 'calculator-app';
            this.appElement.innerHTML = `
                <div style="
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 280px;
                    height: 380px;
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(20px);
                    border-radius: 12px;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
                    z-index: 1001;
                    display: flex;
                    flex-direction: column;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                ">
                    <div style="
                        padding: 16px;
                        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    ">
                        <h3 style="margin: 0; color: rgba(0, 0, 0, 0.8);">Calculator</h3>
                        <button onclick="window.appLauncher.getLoadedApp('app6').close()" style="
                            width: 28px;
                            height: 28px;
                            border: none;
                            background: rgba(220, 53, 69, 0.2);
                            color: #dc3545;
                            border-radius: 6px;
                            cursor: pointer;
                        ">×</button>
                    </div>
                    <div style="flex: 1; padding: 16px;">
                        <div id="calcDisplay" style="
                            width: 100%;
                            height: 60px;
                            background: rgba(0, 0, 0, 0.05);
                            border-radius: 8px;
                            display: flex;
                            align-items: center;
                            justify-content: flex-end;
                            padding: 0 16px;
                            font-size: 24px;
                            font-weight: 500;
                            margin-bottom: 16px;
                            color: rgba(0, 0, 0, 0.8);
                        ">0</div>
                        <div style="
                            display: grid;
                            grid-template-columns: repeat(4, 1fr);
                            gap: 8px;
                            height: 240px;
                        ">
                            <button onclick="window.appLauncher.getLoadedApp('app6').clear()" class="calc-btn">C</button>
                            <button onclick="window.appLauncher.getLoadedApp('app6').clearEntry()" class="calc-btn">CE</button>
                            <button onclick="window.appLauncher.getLoadedApp('app6').backspace()" class="calc-btn">⌫</button>
                            <button onclick="window.appLauncher.getLoadedApp('app6').setOperation('/')" class="calc-btn">÷</button>
                            
                            <button onclick="window.appLauncher.getLoadedApp('app6').inputNumber('7')" class="calc-btn">7</button>
                            <button onclick="window.appLauncher.getLoadedApp('app6').inputNumber('8')" class="calc-btn">8</button>
                            <button onclick="window.appLauncher.getLoadedApp('app6').inputNumber('9')" class="calc-btn">9</button>
                            <button onclick="window.appLauncher.getLoadedApp('app6').setOperation('*')" class="calc-btn">×</button>
                            
                            <button onclick="window.appLauncher.getLoadedApp('app6').inputNumber('4')" class="calc-btn">4</button>
                            <button onclick="window.appLauncher.getLoadedApp('app6').inputNumber('5')" class="calc-btn">5</button>
                            <button onclick="window.appLauncher.getLoadedApp('app6').inputNumber('6')" class="calc-btn">6</button>
                            <button onclick="window.appLauncher.getLoadedApp('app6').setOperation('-')" class="calc-btn">−</button>
                            
                            <button onclick="window.appLauncher.getLoadedApp('app6').inputNumber('1')" class="calc-btn">1</button>
                            <button onclick="window.appLauncher.getLoadedApp('app6').inputNumber('2')" class="calc-btn">2</button>
                            <button onclick="window.appLauncher.getLoadedApp('app6').inputNumber('3')" class="calc-btn">3</button>
                            <button onclick="window.appLauncher.getLoadedApp('app6').setOperation('+')" class="calc-btn">+</button>
                            
                            <button onclick="window.appLauncher.getLoadedApp('app6').inputNumber('0')" class="calc-btn" style="grid-column: span 2;">0</button>
                            <button onclick="window.appLauncher.getLoadedApp('app6').inputDecimal()" class="calc-btn">.</button>
                            <button onclick="window.appLauncher.getLoadedApp('app6').calculate()" class="calc-btn" style="background: #0078d4; color: white;">=</button>
                        </div>
                    </div>
                </div>
                <style>
                    .calc-btn {
                        border: none;
                        background: rgba(255, 255, 255, 0.8);
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 16px;
                        font-weight: 500;
                        color: rgba(0, 0, 0, 0.8);
                        transition: background 0.2s ease;
                    }
                    .calc-btn:hover {
                        background: rgba(255, 255, 255, 1);
                    }
                    .calc-btn:active {
                        transform: scale(0.95);
                    }
                </style>
            `;
            
            document.body.appendChild(this.appElement);
            
            console.log('✅ Calculator app initialized');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Calculator app:', error);
            return false;
        }
    }

    open() {
        this.isOpen = true;
        const calcWindow = this.appElement.querySelector('div');
        calcWindow.style.opacity = '1';
    }

    close() {
        this.isOpen = false;
        const calcWindow = this.appElement.querySelector('div');
        calcWindow.style.opacity = '0';
        setTimeout(() => {
            if (this.appElement && this.appElement.parentNode) {
                this.appElement.parentNode.removeChild(this.appElement);
            }
        }, 300);
    }

    updateDisplay() {
        const display = document.getElementById('calcDisplay');
        if (display) {
            display.textContent = this.currentValue;
        }
    }

    inputNumber(num) {
        if (this.currentValue === '0') {
            this.currentValue = num;
        } else {
            this.currentValue += num;
        }
        this.updateDisplay();
    }

    inputDecimal() {
        if (!this.currentValue.includes('.')) {
            this.currentValue += '.';
            this.updateDisplay();
        }
    }

    setOperation(op) {
        if (this.previousValue !== null && this.operation) {
            this.calculate();
        }
        this.previousValue = parseFloat(this.currentValue);
        this.operation = op;
        this.currentValue = '0';
    }

    calculate() {
        if (this.previousValue !== null && this.operation) {
            const current = parseFloat(this.currentValue);
            let result;
            
            switch (this.operation) {
                case '+':
                    result = this.previousValue + current;
                    break;
                case '-':
                    result = this.previousValue - current;
                    break;
                case '*':
                    result = this.previousValue * current;
                    break;
                case '/':
                    result = this.previousValue / current;
                    break;
                default:
                    return;
            }
            
            this.currentValue = result.toString();
            this.previousValue = null;
            this.operation = null;
            this.updateDisplay();
        }
    }

    clear() {
        this.currentValue = '0';
        this.previousValue = null;
        this.operation = null;
        this.updateDisplay();
    }

    clearEntry() {
        this.currentValue = '0';
        this.updateDisplay();
    }

    backspace() {
        if (this.currentValue.length > 1) {
            this.currentValue = this.currentValue.slice(0, -1);
        } else {
            this.currentValue = '0';
        }
        this.updateDisplay();
    }
}

// Export for global use
window.CalculatorApp = CalculatorApp;
