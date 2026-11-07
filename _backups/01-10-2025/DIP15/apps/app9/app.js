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
            return await this.open();
        }

        // Method expected by app-launcher.js
        async open() {
            // STRICT: Check if already launched
            if (this.windowId && window.windowManager && window.windowManager.getWindow(this.windowId)) {
                console.log('📅 Schedule app already open, focusing existing window');
                window.windowManager.focusWindow(this.windowId);
                return true; // Prevent duplicate
            }
            
            // Only launch if not already open
            const result = await this.launch();
            return result ? true : false;
        }

        async launch() {
            try {
                console.log('📅 Launching Schedule app...');
                
                const scheduleWindow = window.windowManager.createWindow({
                    id: `schedule-${Date.now()}`,
                    title: 'Calendar',
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
                            <h3>Keira Mayhew's Schedule</h3>
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
                        <span class="legend-color legend-individual"></span>
                        individual
                    </span>
                    <span class="legend-item">
                        <span class="legend-color legend-couples"></span>
                        couples
                    </span>
                    <span class="legend-item">
                        <span class="legend-color legend-classes"></span>
                        classes
                    </span>
                    <span class="legend-item">
                        <span class="legend-color legend-appointment"></span>
                        appointment
                    </span>
                    </div>
                </div>
            `;
        }

        async loadScheduleData() {
            try {
                const response = await fetch('schedule.json');
                const data = await response.json();
                // Assign soft pastel color names to tasks, full saturation only for legend
                this.appointments = (data.appointments || []).map(apt => {
                    let color = 'honeydew'; // pastel green for appointment
                    let status = 'confirmed';
                    let notes = '';
                    const type = (apt.type || '').toLowerCase();
                    if (type === 'individual') {
                        color = 'aliceblue'; 
                        notes = '1:1 session';
                    } else if (type === 'couples') {
                        color = 'lavenderblush'; 
                        notes = 'Relationship/couples session';
                    } else if (type === 'classes') {
                        color = '#FFF9E3'; 
                        notes = 'Group/class session';
                    } else if (type === 'appointment') {
                        color = 'honeydew'; 
                        notes = 'Appointment';
                    }
                    // Special: Trust Exercises (move one hour prior if found)
                    if (apt.title && apt.title.toLowerCase().includes('trust exercises')) {
                        let [h, m] = (apt.time || '00:00').split(':').map(Number);
                        h = Math.max(0, h - 1);
                        apt.time = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
                    }
                    return { ...apt, color, status, notes };
                });
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
            // Week view only, Monday to Sunday
            const startOfWeek = new Date(this.selectedDate);
            const dayOfWeek = startOfWeek.getDay();
            const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
            startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);
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
            // Set startOfWeek to Monday
            const startOfWeek = new Date(this.selectedDate);
            const dayOfWeek = startOfWeek.getDay();
            const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
            startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);

            let html = `
                <div class="week-view">
                    <div class="week-header" style="border-bottom: 1px solid #e0e0e0;">
                        <div class="time-column-header"></div>
            `;

            // Day headers (Monday to Sunday)
            for (let i = 0; i < 7; i++) {
                const day = new Date(startOfWeek);
                day.setDate(day.getDate() + i);
                const isToday = day.toDateString() === new Date().toDateString();
                html += `
                    <div class="day-header ${isToday ? 'today' : ''}" style="border-bottom: 1px solid #e0e0e0;">
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

                // Day columns (Monday to Sunday)
                for (let i = 0; i < 7; i++) {
                    const day = new Date(startOfWeek);
                    day.setDate(day.getDate() + i);
                    const dayStr = day.toISOString().split('T')[0];


                    // Find all appointments that overlap this time slot
                    const dayAppointments = this.appointments.filter(apt => {
                        if (apt.date !== dayStr) return false;
                        // Parse start and end time
                        const [startHour, startMin] = (apt.time || '00:00').split(':').map(Number);
                        const start = startHour * 60 + startMin;
                        const end = start + (apt.duration || 60);
                        const slotHour = hour;
                        const slotStart = slotHour * 60;
                        const slotEnd = slotStart + 60;
                        // Overlaps if appointment starts before slot ends and ends after slot starts
                        return start < slotEnd && end > slotStart;
                    });

                    html += `<div class="week-cell" style="position:relative;">`;
                    // Only render the appointment in the time slot where it starts
                    dayAppointments.forEach(apt => {
                        const [startHour, startMin] = (apt.time || '00:00').split(':').map(Number);
                        if (startHour === hour) {
                            const duration = apt.duration || 60;
                            const heightMultiplier = Math.max(1, Math.round(duration / 60));
                            html += `<div style="height:calc(100% * ${heightMultiplier}); min-height:40px; position:absolute; top:0; left:0; right:0; z-index:2; width:100%;">`;
                            html += this.renderAppointmentCard(apt, true);
                            html += `</div>`;
                        }
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
            // Use title as main label, fallback to clientName/type for legacy
            const mainTitle = appointment.title || appointment.clientName || '';
            const type = appointment.type || '';
            const notes = appointment.notes || '';
            if (compact) {
                return `
                    <div class="appointment-card compact ${statusClass}" 
                         style="background-color: ${appointment.color};">
                        <div class="appointment-title" style="font-weight: normal;">${mainTitle}</div>
                        <div class="appointment-type">${type}</div>
                    </div>
                `;
            }

            return `
                <div class="appointment-card ${statusClass}" 
                     style="background-color: ${appointment.color};">
                    <div class="appointment-header">
                        <div class="appointment-title" style="font-weight: normal;">${mainTitle}</div>
                    </div>
                    <div class="appointment-type">${type}</div>
                    <div class="appointment-notes">${notes}</div>
                    <div class="appointment-status status-${appointment.status}">
                        ${appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                    </div>
                </div>
            `;
        }

        updateAppointmentCount() {
            const totalEl = document.getElementById('totalAppointments');
            if (totalEl) {
                // Week view only, Monday to Sunday
                const startOfWeek = new Date(this.selectedDate);
                const dayOfWeek = startOfWeek.getDay();
                const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
                startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(endOfWeek.getDate() + 6);
                const weekAppointments = this.appointments.filter(apt => {
                    const aptDate = new Date(apt.date);
                    return aptDate >= startOfWeek && aptDate <= endOfWeek;
                });
                totalEl.textContent = weekAppointments.length;
            }
        }

        // Method called when window is closed
        onWindowClose() {
            this.windowId = null;
            console.log('📅 Schedule app window closed');
        }
    }

    // Make ScheduleApp globally available
    window.ScheduleApp = ScheduleApp;
}
