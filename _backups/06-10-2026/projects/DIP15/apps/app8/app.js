// Clock App
if (typeof ClockApp === 'undefined') {
    class ClockApp {
        constructor() {
            this.windowId = null;
            this.windowManager = null;
            this.appConfig = null;
            this.updateInterval = null;
        }

        async init(options = {}) {
            this.windowManager = options.windowManager || window.windowManager;
            this.appConfig = options.appConfig;
            return true;
        }

        async open() {
            if (this.windowId && this.windowManager) {
                const existing = this.windowManager.getWindow(this.windowId);
                if (existing) {
                    existing.isMinimized
                        ? this.windowManager.restoreWindow(this.windowId)
                        : this.windowManager.focusWindow(this.windowId);
                    return;
                }
            }

            const windowObj = this.windowManager.createWindow({
                title: 'Clock',
                resizable: true,
                icon: this.appConfig?.icon || 'images/app8.png',
                appId: 'app8',
                content: this.getContent(),
                footerText: 'Digital & Analog Clock',
                className: 'clock-app-window'
            });

            this.windowId = windowObj.id;
            this.setupElements(windowObj.element);
            this.startClock();
        }

        getContent() {
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

        setupElements(el) {
            this.clockElement = el.querySelector('#time-display .time');
            this.dateElement = el.querySelector('#date-display .date');
            this.hourHand = el.querySelector('#hour-hand');
            this.minuteHand = el.querySelector('#minute-hand');
            this.secondHand = el.querySelector('#second-hand');
        }

        startClock() {
            if (this.updateInterval) clearInterval(this.updateInterval);
            this.updateClock();
            this.updateInterval = setInterval(() => this.updateClock(), 1000);
        }

        updateClock() {
            const now = new Date();
            const h = now.getHours().toString().padStart(2, '0');
            const m = now.getMinutes().toString().padStart(2, '0');
            const s = now.getSeconds().toString().padStart(2, '0');

            if (this.clockElement) this.clockElement.textContent = `${h}:${m}:${s}`;
            if (this.dateElement) {
                this.dateElement.textContent = now.toLocaleDateString('en-US', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                });
            }

            // Analog hands
            const hours = now.getHours() % 12;
            const minutes = now.getMinutes();
            const seconds = now.getSeconds();
            if (this.secondHand) this.secondHand.style.transform = `rotate(${seconds * 6 - 90}deg)`;
            if (this.minuteHand) this.minuteHand.style.transform = `rotate(${minutes * 6 + seconds * 0.1 - 90}deg)`;
            if (this.hourHand) this.hourHand.style.transform = `rotate(${hours * 30 + minutes * 0.5 - 90}deg)`;
        }
    }

    window.ClockApp = ClockApp;
}
