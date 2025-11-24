// Avoid redeclaration if already defined
if (typeof ClockApp === 'undefined') {
    class ClockApp {
        constructor() {
            this.window = null;
            this.clockElement = null;
            this.updateInterval = null;
        }

        static getInstance() {
            if (!ClockApp.instance) {
                ClockApp.instance = new ClockApp();
            }
            return ClockApp.instance;
        }

        // Compatible avec app-launcher.js
        async init() {
            return await this.launch();
        }

        async launch() {
            try {
                console.log('🕐 Launching Clock app...');
                
                this.window = window.windowManager.createWindow({
                    id: `clock-${Date.now()}`,
                    title: 'Clock',
                    x: 150,
                    y: 100,
                    resizable: true,
                    icon: 'images/app8.png',
                    appId: 'app8',
                    content: this.getClockContent(),
                    footerText: 'Digital & Analog Clock',
                    className: 'clock-app-window'
                });

                this.setupClockElements();
                this.startClock();
                
                console.log('✅ Clock app launched successfully');
                return this.window;
            } catch (error) {
                console.error('Failed to initialize Clock app:', error);
            }
        }

        async open(options = {}) {
            this.windowManager = options.windowManager;
            this.appConfig = options.appConfig;
            await this.initialize();
            return true;
        }

        async initialize() {
            try {
                this.window = this.windowManager.createWindow({
                    title: 'Clock',
                    resizable: true,
                    icon: this.appConfig?.icon || 'images/app8.png',
                    appId: this.appConfig?.id || 'app8',
                    content: this.getClockContent(),
                    footerText: 'Digital & Analog Clock',
                    className: 'clock-app-window'
                });

                this.setupClockElements();
                this.startClock();
                this.setupEventListeners();
            } catch (error) {
                console.error('Failed to initialize Clock app:', error);
            }
        }

    getClockContent() {
        return `
            <div class="clock-container">
                <div class="analog-clock" id="analog-clock">
                    <div class="clock-face">
                        <div class="clock-center"></div>
                        <div class="hour-hand" id="hour-hand"></div>
                        <div class="minute-hand" id="minute-hand"></div>
                        <div class="second-hand" id="second-hand"></div>
                        <div class="clock-numbers">
                            <div class="number twelve">12</div>
                            <div class="number three">3</div>
                            <div class="number six">6</div>
                            <div class="number nine">9</div>
                        </div>
                        <div class="clock-ticks">
                            ${Array.from({length: 12}, (_, i) => `<div class="tick tick-${i}"></div>`).join('')}
                        </div>
                    </div>
                </div>
                <div class="clock-display">
                    <div class="time-display" id="time-display">
                        <span class="time">--:--:--</span>
                    </div>
                    <div class="date-display" id="date-display">
                        <span class="date">Loading...</span>
                    </div>
                </div>
            </div>
        `;
    }

    setupClockElements() {
        this.clockElement = this.window.element.querySelector('#time-display .time');
        this.dateElement = this.window.element.querySelector('#date-display .date');
        this.hourHand = this.window.element.querySelector('#hour-hand');
        this.minuteHand = this.window.element.querySelector('#minute-hand');
        this.secondHand = this.window.element.querySelector('#second-hand');
    }

    render() {
        const content = `
            <div class="clock-container">
                <div class="clock-display">
                    <div class="time-display" id="time-display">
                        <span class="time">--:--:--</span>
                    </div>
                    <div class="date-display" id="date-display">
                        <span class="date">Loading...</span>
                    </div>
                </div>
            </div>
        `;
        
        const contentEl = this.window.element.querySelector('.window-content');
        if (contentEl) {
            contentEl.innerHTML = content;
        }
        
        this.clockElement = this.window.element.querySelector('#time-display .time');
        this.dateElement = this.window.element.querySelector('#date-display .date');
    }

    startClock() {
        this.updateClock();
        this.updateInterval = setInterval(() => {
            this.updateClock();
        }, 1000);
    }

    updateClock() {
        const now = new Date();
        
        // Format time
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const timeString = `${hours}:${minutes}:${seconds}`;
        
        // Format date
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        const dateString = now.toLocaleDateString('en-US', options);
        
        if (this.clockElement) {
            this.clockElement.textContent = timeString;
        }
        
        if (this.dateElement) {
            this.dateElement.textContent = dateString;
        }

        // Update analog clock hands
        this.updateAnalogClock(now);
    }

    updateAnalogClock(now) {
        if (!this.hourHand || !this.minuteHand || !this.secondHand) return;

        const hours = now.getHours() % 12;
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();

        // Calculate angles (0 degrees = 12 o'clock)
        const secondAngle = (seconds * 6) - 90; // 6 degrees per second
        const minuteAngle = (minutes * 6) + (seconds * 0.1) - 90; // 6 degrees per minute + smooth movement
        const hourAngle = (hours * 30) + (minutes * 0.5) - 90; // 30 degrees per hour + smooth movement

        // Apply rotations
        this.secondHand.style.transform = `rotate(${secondAngle}deg)`;
        this.minuteHand.style.transform = `rotate(${minuteAngle}deg)`;
        this.hourHand.style.transform = `rotate(${hourAngle}deg)`;
    }

    setupEventListeners() {
        // Remove problematic window methods
        // Cleanup will be handled by app lifecycle
    }

    show() {
        if (this.window) {
            this.window.show();
        }
    }

    hide() {
        if (this.window) {
            this.window.hide();
        }
    }

    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        if (this.window) {
            this.window.destroy();
            this.window = null;
        }
        
        ClockApp.instance = null;
    }

    async init(options = {}) {
        return this.open(options);
    }
}

    // Global function to launch the Clock app
    function launchClockApp() {
        const clockApp = ClockApp.getInstance();
        clockApp.initialize();
    }

    // Export for module usage
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ClockApp;
    }

    // Make available globally
    window.launchClockApp = launchClockApp;
    window.ClockApp = ClockApp;

// Close the conditional block
}
