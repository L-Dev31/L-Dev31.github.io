// State history: tracks last 5 measurements and make an average for stability
var stateHistory = {
    pings: [],
    usages: [],
    isInitialized: false,
    add: function(ping, usage) {
        this.pings.push(ping);
        this.usages.push(usage);
        if (this.pings.length > 5) this.pings.shift();
        if (this.usages.length > 5) this.usages.shift();
        
        // Consider initialized after 3 measurements for better accuracy
        if (this.pings.length >= 3) {
            this.isInitialized = true;
        }
    },
    getStableUsage: function() {
        if (this.usages.length === 0) return 0;
        return this.usages.reduce((acc, val) => acc + val, 0) / this.usages.length;
    },
    getAveragePing: function() {
        if (this.pings.length === 0) return 0;
        return this.pings.reduce((acc, val) => acc + val, 0) / this.pings.length;
    }
};

// Maps ping (ms) to a usage percentage
function mapPingToUsage(ping) {
    if (ping <= 50) return 0;
    if (ping >= 750) return 100;

    var breakpoints = [
        { ping: 50, usage: 0.00 },
        { ping: 75, usage: 3.57 },
        { ping: 100, usage: 7.14 },
        { ping: 125, usage: 10.71 },
        { ping: 150, usage: 14.29 },
        { ping: 175, usage: 17.86 },
        { ping: 200, usage: 21.43 },
        { ping: 225, usage: 25.00 },
        { ping: 250, usage: 28.57 },
        { ping: 275, usage: 32.14 },
        { ping: 300, usage: 35.71 },
        { ping: 325, usage: 39.29 },
        { ping: 350, usage: 42.86 },
        { ping: 375, usage: 46.43 },
        { ping: 400, usage: 50.00 },
        { ping: 425, usage: 53.57 },
        { ping: 450, usage: 57.14 },
        { ping: 475, usage: 60.71 },
        { ping: 500, usage: 64.29 },
        { ping: 525, usage: 67.86 },
        { ping: 550, usage: 71.43 },
        { ping: 575, usage: 75.00 },
        { ping: 600, usage: 78.57 },
        { ping: 625, usage: 82.14 },
        { ping: 650, usage: 85.71 },
        { ping: 675, usage: 89.29 },
        { ping: 700, usage: 92.86 },
        { ping: 725, usage: 96.43 },
        { ping: 750, usage: 100.00 }
    ];

    for (var i = 0; i < breakpoints.length - 1; i++) {
        var current = breakpoints[i];
        var next = breakpoints[i + 1];
        if (ping >= current.ping && ping <= next.ping) {
            var ratio = (ping - current.ping) / (next.ping - current.ping);
            return current.usage + ratio * (next.usage - current.usage);
        }
    }
}

// Interpolates color based on usage percentage
function getInterpolatedColor(value) {
    var r, g, b, ratio;
    if (value <= 16) {
        ratio = value / 16;
        r = 0;
        g = Math.round(255 * (1 - ratio));
        b = 255;
    } else if (value <= 33) {
        ratio = (value - 16) / 17;
        r = 0;
        g = Math.round(150 * (1 - ratio));
        b = Math.round(255 * (1 - ratio * 0.2));
    } else if (value <= 50) {
        ratio = (value - 33) / 17;
        r = Math.round(75 * ratio);
        g = Math.round(0 + (43 - 0) * ratio);
        b = Math.round(200 + (226 - 200) * ratio);
    } else if (value <= 75) {
        ratio = (value - 50) / 25;
        r = Math.round(75 + (199 - 75) * ratio);
        g = Math.round(43 + (21 - 43) * ratio);
        b = Math.round(226 + (133 - 226) * ratio);
    } else {
        ratio = (value - 75) / 25;
        r = Math.round(199 + (255 - 199) * ratio);
        g = Math.round(21 * (1 - ratio));
        b = Math.round(133 * (1 - ratio));
    }
    return 'rgb(' + r + ', ' + g + ', ' + b + ')';
}

// Determines status text with full descriptions and advices
function getStatusText(usage) {
    var currentStatus = window.lastKnownStatus || { usage: 0 };
    var newStatus, description;

    if (usage < 25) {
        newStatus = "Optimal";
        description = `
        DeepSeek is performing at peak efficiency.
        <ul>
            <li>This level of performance is rare. It might be an error.</li>
            <li>You may continue using DeepSeek with complete confidence.</li>
        </ul>`;
    } else if (usage < 50) {
        newStatus = "Stable";
        description = `
        DeepSeek is operating stably despite a slight increase in load.
        <ul>
            <li>Traffic levels remain within best ranges.</li>
            <li>You may continue using DeepSeek without concerns.</li>
        </ul>`;
    } else if (usage < 75) {
        newStatus = "Moderate Load";
        description = `
        DeepSeek is experiencing moderate load conditions, which might result in occasional delays.
        <ul>
            <li>Some responses may be delayed or not delivered promptly.</li>
            <li>Overall functionality remains largely intact.</li>
        </ul>`;
    } else if (usage < 90) {
        newStatus = "High Load";
        description = `
        DeepSeek is currently under high load, which may cause significant delays.
        <ul>
            <li>We recommend reducing your usage temporarily.</li>
            <li>Avoid heavy operations until performance improves.</li>
        </ul>`;
    } else {
        newStatus = "Critical Load";
        description = `
        DeepSeek is experiencing critical load due to excessive traffic.
        <ul>
            <li>Usage may be severely impacted.</li>
            <li>We recommend using alternative AI services until performance is restored.</li>
        </ul>`;
    }

    // Only update status if difference is significant or persists
    if (!currentStatus.title || Math.abs(usage - currentStatus.usage) > 15 || newStatus === currentStatus.title) {
        window.lastKnownStatus = { title: newStatus, usage: usage, description: description };
    }

    return window.lastKnownStatus;
}

// Measures ping using 3 requests for stability (cuz else it just moves back and forth between normal and critical)
function measurePingAndUpdate() {
    var measurements = [];
    var completed = 0;

    // Take 3 quick measurements
    for (var i = 0; i < 3; i++) {
        (function() {
            var img = new Image();
            var start = performance.now();
            img.src = 'https://cdn.deepseek.com/chat/icon.png?t=' + Date.now() + '-' + i;

            img.onload = function() {
                measurements.push(performance.now() - start);
                completed++;
                if (completed === 3) {
                    // Use median value to filter outliers
                    measurements.sort(function(a, b) { return a - b; });
                    var finalPing = measurements[1];
                    var usage = mapPingToUsage(finalPing);
                    stateHistory.add(finalPing, usage);
                    
                    // Only update interface if we have enough data for stability
                    if (stateHistory.isInitialized) {
                        updateInterface(stateHistory.getStableUsage(), stateHistory.getAveragePing());
                    } else {
                        // Show initialization progress
                        updateInitializationInterface(stateHistory.pings.length);
                    }
                }
            };

            img.onerror = function() {
                completed++;
                if (completed === 3) {
                    if (stateHistory.isInitialized) {
                        updateInterface(100, null);
                    } else {
                        updateInitializationInterface(stateHistory.pings.length);
                    }
                }
            };
        })();
    }
}

// Updates the UI during initialization phase
function updateInitializationInterface(measurementCount) {
    var progressBar = document.getElementById("progress-bar");
    var statusTitle = document.getElementById("status-title");
    var statusDescription = document.getElementById("status-description");
    
    if (progressBar && statusTitle && statusDescription) {
        var initProgress = (measurementCount / 3) * 100; // Progress based on measurements needed
        
        progressBar.style.width = initProgress + "%";
        progressBar.style.backgroundColor = "#4A90E2"; // Blue color during initialization
        
        statusTitle.textContent = "Initializing (" + measurementCount + "/3)";
        statusDescription.innerHTML = "Collecting initial data for accurate status assessment. Please wait while we gather " + (3 - measurementCount) + " more measurements...";
    }
}

// Updates the UI
function updateInterface(usage, averagePing) {
    var progressBar = document.getElementById("progress-bar");
    if (progressBar) {
        progressBar.style.width = usage + "%";
        progressBar.style.backgroundColor = getInterpolatedColor(usage);
    }

    var statusTitle = document.getElementById("status-title");
    var statusDescription = document.getElementById("status-description");
    if (statusTitle && statusDescription) {
        var status = getStatusText(usage);
        statusTitle.textContent = status.title;
        statusDescription.innerHTML = averagePing !== null
            ? status.description + "<br>(Ping: " + Math.round(averagePing) + " ms)"
            : "We're currently seeking a ping response. The server might be overused or inaccessible. Please wait...";
    }
}

// Start measurements and repeat every 3 seconds
// First, do rapid initialization measurements (every 1 second) until initialized
function startMonitoring() {
    measurePingAndUpdate();
    
    var initializationInterval = setInterval(function() {
        if (stateHistory.isInitialized) {
            clearInterval(initializationInterval);
            // Start normal monitoring every 3 seconds
            setInterval(measurePingAndUpdate, 3000);
        } else {
            measurePingAndUpdate();
        }
    }, 1000); // Faster measurements during initialization
}

startMonitoring();
