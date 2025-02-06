 // Map the measured ping (in ms) to a usage percentage.
 function mapPingToUsage(ping) {
    if (ping <= 100) return 0;
    if (ping >= 500) return 100;
    return ((ping - 100) / 400) * 100;
  }

  /* 
    Interpolates the color based on the usage percentage:
      - 0%   : Cyan         → rgb(0, 255, 255)
      - 33%  : Blue         → rgb(0, 0, 255)
      - 66%  : Violet       → rgb(138, 43, 226)
      - 100% : Red-Violet   → rgb(199, 21, 133)
  */
  function getInterpolatedColor(value) {
    let r, g, b, ratio;
    if (value <= 33) {
      // Cyan to Blue
      ratio = value / 33;
      r = 0;
      g = Math.round(255 * (1 - ratio));
      b = 255;
    } else if (value <= 66) {
      // Blue to Violet
      ratio = (value - 33) / 33;
      r = Math.round(0 + (138 - 0) * ratio);
      g = Math.round(0 + (43 - 0) * ratio);
      b = Math.round(255 + (226 - 255) * ratio);
    } else {
      // Violet to Red-Violet
      ratio = (value - 66) / 34;
      r = Math.round(138 + (199 - 138) * ratio);
      g = Math.round(43 + (21 - 43) * ratio);
      b = Math.round(226 + (133 - 226) * ratio);
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
  setInterval(measurePingAndUpdate, 3000);