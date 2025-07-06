// Schedule App - Professional Calendar for Psychology Practice
if (typeof ScheduleApp === 'undefined') {
    class ScheduleApp {
        constructor() {
            this.windowId = null;
            this.appointments = [];
            this.currentDate = new Date();
            this.currentView = 'week'; // Only week view
            this.selectedDate = new Date();
        }

        static getInstance() {
            if (!ScheduleApp.instance) {
                ScheduleApp.instance = new ScheduleApp();
            }
            return ScheduleApp.instance;
        }

        // Compatible avec app-launcher.js
        async init() {
            return await this.launch();
        }

        // Method expected by app-launcher.js
        async open() {
            return await this.launch();
        }

        async launch() {
            try {
                console.log('📅 Launching Schedule app...');
                
                const scheduleWindow = window.windowManager.createWindow({
                    id: `schedule-${Date.now()}`,
                    title: 'Schedule',
                    x: 100,
                    y: 50,
                    width: 1000,
                    height: 700,
                    icon: 'images/app9.png',
                    appId: 'app9',
                    content: this.getScheduleContent(),
                    footerText: this.getScheduleFooter(),
                    className: 'schedule-app-window'
                });

                this.windowId = scheduleWindow.id;
                await this.loadScheduleData();
                this.setupEventListeners();
                this.renderCurrentView();
                
                console.log('✅ Schedule app launched successfully');
                return scheduleWindow;
            } catch (error) {
                console.error('Failed to initialize Schedule app:', error);
            }
        }

        getScheduleContent() {
            return `
                <div class="schedule-container" id="scheduleContainer">
                    <!-- Header with navigation -->
                    <div class="schedule-header">
                        <div class="schedule-nav">
                            <button class="nav-btn" id="prevBtn">
                                <i class="fas fa-chevron-left"></i>
                            </button>
                            <div class="current-period" id="currentPeriod">
                                ${this.formatCurrentPeriod()}
                            </div>
                            <button class="nav-btn" id="nextBtn">
                                <i class="fas fa-chevron-right"></i>
                            </button>
                        </div>
                        
                        <div class="schedule-title">
                            <h3>Keira Mayhew's Psychology Schedule</h3>
                        </div>
                    </div>

                    <!-- Calendar content -->
                    <div class="schedule-content" id="scheduleContent">
                        <!-- Day/Week view will be rendered here -->
                    </div>
                </div>
            `;
        }

        getScheduleFooter() {
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <span class="appointment-count" style="display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-calendar"></i>
                        <span id="totalAppointments">0</span> appointments
                    </span>
                    <div class="legend" style="display: flex; gap: 16px;">
                        <span class="legend-item" style="display: flex; align-items: center; gap: 4px; font-size: 12px;">
                            <span class="legend-color" style="background-color: #2196f3; width: 12px; height: 12px; border-radius: 2px; display: inline-block;"></span>
                            Individual
                        </span>
                        <span class="legend-item" style="display: flex; align-items: center; gap: 4px; font-size: 12px;">
                            <span class="legend-color" style="background-color: #9c27b0; width: 12px; height: 12px; border-radius: 2px; display: inline-block;"></span>
                            Couples
                        </span>
                        <span class="legend-item" style="display: flex; align-items: center; gap: 4px; font-size: 12px;">
                            <span class="legend-color" style="background-color: #4caf50; width: 12px; height: 12px; border-radius: 2px; display: inline-block;"></span>
                            Family
                        </span>
                        <span class="legend-item" style="display: flex; align-items: center; gap: 4px; font-size: 12px;">
                            <span class="legend-color" style="background-color: #e91e63; width: 12px; height: 12px; border-radius: 2px; display: inline-block;"></span>
                            Group
                        </span>
                    </div>
                </div>
            `;
        }

        async loadScheduleData() {
            try {
                const response = await fetch('schedule.json');
                const data = await response.json();
                this.appointments = data.appointments || [];
                console.log('✅ Schedule data loaded:', this.appointments.length, 'appointments');
            } catch (error) {
                console.error('Failed to load schedule data:', error);
                this.appointments = [];
            }
        }

        setupEventListeners() {
            const prevBtn = document.getElementById('prevBtn');
            const nextBtn = document.getElementById('nextBtn');

            if (prevBtn) prevBtn.addEventListener('click', () => this.navigatePrevious());
            if (nextBtn) nextBtn.addEventListener('click', () => this.navigateNext());
        }

        formatCurrentPeriod() {
            // Week view only
            const startOfWeek = new Date(this.selectedDate);
            startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(endOfWeek.getDate() + 6);
            
            return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        }

        navigatePrevious() {
            // Week view only - navigate by 7 days
            this.selectedDate.setDate(this.selectedDate.getDate() - 7);
            this.updateView();
        }

        navigateNext() {
            // Week view only - navigate by 7 days
            this.selectedDate.setDate(this.selectedDate.getDate() + 7);
            this.updateView();
        }

        updateView() {
            document.getElementById('currentPeriod').textContent = this.formatCurrentPeriod();
            this.renderCurrentView();
        }

        renderCurrentView() {
            const content = document.getElementById('scheduleContent');
            if (!content) return;

            // Week view only
            content.innerHTML = this.renderWeekView();
            this.updateAppointmentCount();
        }

        renderWeekView() {
            const startOfWeek = new Date(this.selectedDate);
            startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

            let html = `
                <div class="week-view">
                    <div class="week-header">
                        <div class="time-column-header"></div>
            `;

            // Day headers
            for (let i = 0; i < 7; i++) {
                const day = new Date(startOfWeek);
                day.setDate(day.getDate() + i);
                const isToday = day.toDateString() === new Date().toDateString();
                
                html += `
                    <div class="day-header ${isToday ? 'today' : ''}">
                        <div class="day-name">${day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                        <div class="day-number">${day.getDate()}</div>
                    </div>
                `;
            }

            html += `
                    </div>
                    <div class="week-grid">
            `;

            // Time rows
            for (let hour = 8; hour <= 18; hour++) {
                const timeSlot = hour < 10 ? `0${hour}:00` : `${hour}:00`;
                let displayTime = hour <= 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`;
                if (hour === 12) displayTime = '12:00 PM';

                html += `
                    <div class="week-row">
                        <div class="time-label">${displayTime}</div>
                `;

                // Day columns
                for (let i = 0; i < 7; i++) {
                    const day = new Date(startOfWeek);
                    day.setDate(day.getDate() + i);
                    const dayStr = day.toISOString().split('T')[0];
                    
                    const dayAppointments = this.appointments.filter(apt => 
                        apt.date === dayStr && apt.time === timeSlot
                    );

                    html += `<div class="week-cell">`;
                    dayAppointments.forEach(apt => {
                        html += this.renderAppointmentCard(apt, true);
                    });
                    html += `</div>`;
                }

                html += `</div>`;
            }

            html += `
                    </div>
                </div>
            `;

            return html;
        }

        renderAppointmentCard(appointment, compact = false) {
            const statusClass = appointment.status === 'confirmed' ? 'confirmed' : 
                              appointment.status === 'pending' ? 'pending' : 'cancelled';
            
            if (compact) {
                return `
                    <div class="appointment-card compact ${statusClass}" 
                         style="background-color: ${appointment.color};">
                        <div class="appointment-title">${appointment.clientName}</div>
                        <div class="appointment-type">${appointment.type}</div>
                    </div>
                `;
            }

            return `
                <div class="appointment-card ${statusClass}" 
                     style="background-color: ${appointment.color};">
                    <div class="appointment-header">
                        <div class="appointment-title">${appointment.clientName}</div>
                        <div class="appointment-duration">${appointment.duration}min</div>
                    </div>
                    <div class="appointment-type">${appointment.type}</div>
                    <div class="appointment-time">${appointment.time}</div>
                    <div class="appointment-notes">${appointment.notes}</div>
                    <div class="appointment-status status-${appointment.status}">
                        ${appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                    </div>
                </div>
            `;
        }

        updateAppointmentCount() {
            const totalEl = document.getElementById('totalAppointments');
            if (totalEl) {
                // Week view only
                const startOfWeek = new Date(this.selectedDate);
                startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(endOfWeek.getDate() + 6);
                
                const weekAppointments = this.appointments.filter(apt => {
                    const aptDate = new Date(apt.date);
                    return aptDate >= startOfWeek && aptDate <= endOfWeek;
                });
                totalEl.textContent = weekAppointments.length;
            }
        }
    }

    // Make ScheduleApp globally available
    window.ScheduleApp = ScheduleApp;
}
