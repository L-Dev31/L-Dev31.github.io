 // Map the measured ping (in ms) to a usage percentage.
 function mapPingToUsage(ping) {
    if (ping <= 100) return 0;
    if (ping >= 500) return 100;
  
    const breakpoints = [
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
  
    for (let i = 0; i < breakpoints.length - 1; i++) {
      let current = breakpoints[i];
      let next = breakpoints[i + 1];
      if (ping >= current.ping && ping <= next.ping) {
        let ratio = (ping - current.ping) / (next.ping - current.ping);
        return current.usage + ratio * (next.usage - current.usage);
      }
    }
  }

  function getInterpolatedColor(value) {
    let r, g, b, ratio;
    if (value <= 16) {
        // Cyan → Bleu clair
        ratio = value / 16;
        r = 0;
        g = Math.round(255 * (1 - ratio));
        b = 255;
    } else if (value <= 33) {
        // Bleu clair → Bleu foncé
        ratio = (value - 16) / 17;
        r = 0;
        g = Math.round(150 * (1 - ratio));
        b = Math.round(255 * (1 - ratio * 0.2));
    } else if (value <= 50) {
        // Bleu foncé → Violet
        ratio = (value - 33) / 17;
        r = Math.round(75 * ratio);
        g = Math.round(0 + (43 - 0) * ratio);
        b = Math.round(200 + (226 - 200) * ratio);
    } else if (value <= 75) {
        // Violet → Rose
        ratio = (value - 50) / 25;
        r = Math.round(75 + (199 - 75) * ratio);
        g = Math.round(43 + (21 - 43) * ratio);
        b = Math.round(226 + (133 - 226) * ratio);
    } else {
        // Rose → Rouge-Violet
        ratio = (value - 75) / 25;
        r = Math.round(199 + (255 - 199) * ratio);
        g = Math.round(21 * (1 - ratio));
        b = Math.round(133 * (1 - ratio));
    }
    return `rgb(${r}, ${g}, ${b})`;
    }

  // Returns the status title and a formal description with advice based on usage.
  function getStatusText(usage) {
  let title, description;
  if (usage < 25) {
      title = "Optimal";
      description = `
      DeepSeek is performing at peak efficiency.
      <ul>
          <li>This level of performence is rare. It might be an error.</li>
          <li>You may continue using DeepSeek with complete confidence.</li>
      </ul>`;
  } else if (usage < 50) {
      title = "Stable";
      description = `
      DeepSeek is operating stably despite a slight increase in load.
      <ul>
          <li>Traffic levels remain within best ranges.</li>
          <li>You may continue using DeepSeek without concerns.</li>
      </ul>`;
  } else if (usage < 75) {
      title = "Moderate Load";
      description = `
      DeepSeek is experiencing moderate load conditions, which might result in occasional delays.
      <ul>
          <li>Some responses may be delayed or not delivered promptly.</li>
          <li>Overall functionality remains largely intact.</li>
      </ul>`;
  } else if (usage < 90) {
      title = "High Load";
      description = `
      DeepSeek is currently under high load, which may cause significant delays.
      <ul>
          <li>We recommend reducing your usage temporarily.</li>
          <li>Avoid heavy operations until performance improves.</li>
      </ul>`;
  } else {
      title = "Critical Load";
      description = `
      DeepSeek is experiencing critical load due to excessive traffic.
      <ul>
          <li>Usage may be severely impacted.</li>
          <li>We recommend using alternative AI services until performance is restored.</li>
      </ul>`;
  }
  return { title, description };
  }


  // Measures the ping using an image load technique and updates the UI.
  function measurePingAndUpdate() {
    const img = new Image();
    const startTime = performance.now();
    // Append a timestamp to bypass the cache.
    const url = 'https://chat.deepseek.com/favicon.svg?t=' + Date.now();
    
    img.onload = function() {
      const ping = performance.now() - startTime;
      const usage = mapPingToUsage(ping);
      updateInterface(usage, ping);
    };
    img.onerror = function() {
      // In case of error, assume maximum load.
      updateInterface(100, null);
    };
    
    img.src = url;
  }

  // Updates the progress bar, its color, and status text based on usage and ping.
  function updateInterface(usage, ping) {
    const progressBar = document.getElementById("progress-bar");
    progressBar.style.width = usage + "%";
    progressBar.style.backgroundColor = getInterpolatedColor(usage);
    
    const statusTitle = document.getElementById("status-title");
    const statusDescription = document.getElementById("status-description");
    const { title, description } = getStatusText(usage);
    
    statusTitle.textContent = title;
    statusDescription.innerHTML = ping !== null 
      ? `${description} <br>(Ping: ${Math.round(ping)} ms)`
      : "We're currently seeking a ping response. The server might be overused. Please wait...";
  }

  // Start the first measurement and repeat every 5 seconds.
  measurePingAndUpdate();
  setInterval(measurePingAndUpdate, 2500);