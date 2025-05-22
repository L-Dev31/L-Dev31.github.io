let isCurrentMediaVideo = true;
let currentMediaImage = null;
let isProcessingFrame = false;

function drawFrame() {
  if (isCurrentMediaVideo && !videoElement.paused && !videoElement.ended) {
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
  } else if (currentMediaImage && !isProcessingFrame) {
    canvasCtx.drawImage(currentMediaImage, 0, 0, canvasElement.width, canvasElement.height);
  }
}

function setupMedia(fileOrUrl) {
  let url;
  
  if (typeof fileOrUrl === 'string') {
    url = fileOrUrl;
    isCurrentMediaVideo = true;
  } else {
    isCurrentMediaVideo = fileOrUrl.type.startsWith('video/');
    url = URL.createObjectURL(fileOrUrl);
  }

  const exportVideoBtn = document.getElementById('exportVideoBtn');
  exportVideoBtn.style.display = isCurrentMediaVideo ? '' : 'none';

  if (currentMediaImage) {
    currentMediaImage = null;
  }
  videoElement.removeAttribute('data-animation-started');

  if (isCurrentMediaVideo) {
    videoElement.src = url;
    videoElement.load();
    videoElement.play().catch(()=>{});
    videoElement.removeEventListener('loadeddata', onMediaLoaded);
    videoElement.addEventListener('loadeddata', onMediaLoaded);
  } else {
    videoElement.src = '';
    currentMediaImage = new Image();
    currentMediaImage.onload = () => {
      isProcessingFrame = true;
      canvasElement.width = currentMediaImage.width;
      canvasElement.height = currentMediaImage.height;
      canvasCtx.drawImage(currentMediaImage, 0, 0);
      if (typeof fileOrUrl !== 'string') {
        URL.revokeObjectURL(url);
      }
      isProcessingFrame = false;
      if (!videoElement.hasAttribute('data-animation-started')) {
        videoElement.setAttribute('data-animation-started', 'true');
        drawGrid();
      }
    };
    currentMediaImage.src = url;
  }
}

function onMediaLoaded() {
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
  if (!videoElement.hasAttribute('data-animation-started')) {
    videoElement.setAttribute('data-animation-started', 'true');
    drawGrid();
  }
}

function drawGrid() {
  drawFrame();
  
  svg.innerHTML = '';
  const viewWidth = window.innerWidth;
  const viewHeight = window.innerHeight;
  svg.setAttribute('width', viewWidth);
  svg.setAttribute('height', viewHeight);

  const gridStep = settings.itemSize + settings.spacing;
  const gridCols = Math.floor(viewWidth / gridStep);
  const gridRows = Math.floor(viewHeight / gridStep);
  const totalGridWidth = gridCols * gridStep - settings.spacing;
  const totalGridHeight = gridRows * gridStep - settings.spacing;
  const gridOffsetX = (viewWidth - totalGridWidth) / 2;
  const gridOffsetY = (viewHeight - totalGridHeight) / 2;

  const sampleBoxWidth = Math.max(1, Math.floor(canvasElement.width / gridCols));
  const sampleBoxHeight = Math.max(1, Math.floor(canvasElement.height / gridRows));
  const animationSpeed = 0.02;

  for (let y = 0; y < gridRows; y++) {
    for (let x = 0; x < gridCols; x++) {
      const heartCenterX = gridOffsetX + x * gridStep + settings.itemSize / 2;
      const heartCenterY = gridOffsetY + y * gridStep + settings.itemSize / 2;
      
      const sampleX = Math.floor((x / gridCols) * canvasElement.width);
      const sampleY = Math.floor((y / gridRows) * canvasElement.height);
      
      let totalR = 0, totalG = 0, totalB = 0, pixelCount = 0;
      
      try {
        const imageData = canvasCtx.getImageData(sampleX, sampleY, sampleBoxWidth, sampleBoxHeight);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          totalR += data[i];
          totalG += data[i+1];
          totalB += data[i+2];
          pixelCount++;
        }
      } catch (e) {
        continue;
      }

      if (pixelCount === 0) continue;

      const avgR = totalR / pixelCount;
      const avgG = totalG / pixelCount;
      const avgB = totalB / pixelCount;
      
      const [h_video, s_video, l_video] = rgbToHsl(avgR, avgG, avgB);
      
      let l_for_contrast = l_video;
      if (settings.contrast !== 1.0) {
        let centered_l = l_video - 0.5;
        centered_l *= settings.contrast;
        l_for_contrast = Math.max(0, Math.min(1, centered_l + 0.5));
      }

      const adjusted_l_video = (1 - Math.cos(l_for_contrast * Math.PI)) / 2;
      const currentRadius = (settings.itemSize / 2) * adjusted_l_video;
      
      let magenta_peak_offset_percent = 50;
      if ((h_video >= 0.25 && h_video < 0.45) || (h_video >= 0.45 && h_video < 0.60)) {
        magenta_peak_offset_percent = 75 + (s_video * 15);
      } else if ((h_video >= 0.60 && h_video < 0.75) || (h_video >= 0.75 && h_video < 0.95)) {
        magenta_peak_offset_percent = 50;
      } else if (((h_video >= 0 && h_video < 0.08) || (h_video >= 0.95 && h_video <= 1)) || (h_video >= 0.08 && h_video < 0.25)) {
        magenta_peak_offset_percent = 25 - (s_video * 15);
      }
      
      magenta_peak_offset_percent = Math.max(5, Math.min(95, magenta_peak_offset_percent));
      const transitionWidthPercent = 30;
      const offset_cyan_end = Math.max(0, magenta_peak_offset_percent - transitionWidthPercent / 2);
      const offset_magenta_end = Math.min(100, magenta_peak_offset_percent + transitionWidthPercent / 2);
      
      let targetMiddleScale = Math.max(0.4, Math.min(0.9, offset_magenta_end / 100));
      let targetInnerScale = Math.max(0.2, Math.min(0.8, offset_cyan_end / 100));
      
      prevMiddleScale = lerp(prevMiddleScale, targetMiddleScale, animationSpeed);
      prevInnerScale = lerp(prevInnerScale, targetInnerScale, animationSpeed);

      const heartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const targetDiameter = currentRadius * 2;
      const actualScale = targetDiameter / heartDesignMaxDim;
      
      heartGroup.setAttribute('transform', `translate(${heartCenterX}, ${heartCenterY}) scale(${actualScale}) translate(-${heartPathOriginalCenterX}, -${heartPathOriginalCenterY})`);
      
      const outerHeart = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      outerHeart.setAttribute('d', heartPathData);
      outerHeart.setAttribute('fill', settings.color1);
      
      const middleHeart = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      middleHeart.setAttribute('d', heartPathData);
      middleHeart.setAttribute('fill', settings.color2);
      const middleHeartTransform = `translate(${heartPathOriginalCenterX}, ${heartPathOriginalCenterY}) scale(${prevMiddleScale}) translate(-${heartPathOriginalCenterX}, -${heartPathOriginalCenterY})`;
      middleHeart.setAttribute('transform', middleHeartTransform);
      
      const innerHeart = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      innerHeart.setAttribute('d', heartPathData);
      innerHeart.setAttribute('fill', settings.color3);
      const innerHeartTransform = `translate(${heartPathOriginalCenterX}, ${heartPathOriginalCenterY}) scale(${prevInnerScale}) translate(-${heartPathOriginalCenterX}, -${heartPathOriginalCenterY})`;
      innerHeart.setAttribute('transform', innerHeartTransform);
      
      heartGroup.appendChild(outerHeart);
      heartGroup.appendChild(middleHeart);
      heartGroup.appendChild(innerHeart);
      svg.appendChild(heartGroup);
    }
  }

  requestAnimationFrame(drawGrid);
}

const svg = document.getElementById('grid');
const videoElement = document.getElementById('refVideo');
const canvasElement = document.getElementById('refCanvas');
const canvasCtx = canvasElement.getContext('2d');
const heartPathData = "M95.4,0C82,0,66.1,9.9,56.5,26.4C53.9,20.4,44.7,14,33.7,14C24.8,14,0,25,0,60.7c0,46.1,46.6,55.5,56,69.8 c0.6,1,2.7,1.7,3.5-0.6c7.5-22.2,65.8-47.2,65.8-92.4C125.3,12.2,108.8,0,95.4,0L95.4,0z";
const heartPathOriginalWidth = 125.3;
const heartPathOriginalHeight = 130.5;
const heartPathOriginalCenterX = heartPathOriginalWidth / 2;
const heartPathOriginalCenterY = heartPathOriginalHeight / 2;
const heartDesignMaxDim = Math.max(heartPathOriginalWidth, heartPathOriginalHeight);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rgbToHsl(r, g, b) {
  r /= 255, g /= 255, b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

let prevMiddleScale = 0.7;
let prevInnerScale = 0.5;

const settings = {
  itemSize: 40,
  spacing: 0,
  contrast: 2,
  color1: '#F90900',
  color2: '#07DED6',
  color3: '#F22FEB',
};

document.addEventListener('DOMContentLoaded', () => {
  const itemSizeSlider = document.getElementById('itemSizeSlider');
  const itemSizeValue = document.getElementById('itemSizeValue');
  const spacingSlider = document.getElementById('spacingSlider');
  const spacingValue = document.getElementById('spacingValue');
  const contrastSlider = document.getElementById('contrastSlider');
  const contrastValue = document.getElementById('contrastValue');
  const color1 = document.getElementById('color1');
  const color2 = document.getElementById('color2');
  const color3 = document.getElementById('color3');
  const bgColor = document.getElementById('bgColor');
  
  itemSizeSlider.addEventListener('input', e => {
    settings.itemSize = +e.target.value;
    itemSizeValue.textContent = e.target.value;
  });
  
  spacingSlider.addEventListener('input', e => {
    settings.spacing = +e.target.value;
    spacingValue.textContent = e.target.value;
  });
  
  contrastSlider.addEventListener('input', e => {
    settings.contrast = +e.target.value;
    contrastValue.textContent = e.target.value;
  });
  
  color1.addEventListener('input', e => { settings.color1 = e.target.value; });
  color2.addEventListener('input', e => { settings.color2 = e.target.value; });
  color3.addEventListener('input', e => { settings.color3 = e.target.value; });
  bgColor.addEventListener('input', e => {
    document.body.style.background = e.target.value;
    document.documentElement.style.background = e.target.value;
  });

  const videoInput = document.getElementById('videoInput');
  const importVideoBtn = document.getElementById('importVideoBtn');
  importVideoBtn.addEventListener('click', () => videoInput.click());
  videoInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) {
      setupMedia(file);
    }
  });

  const screenshotBtn = document.getElementById('screenshotBtn');
  if (screenshotBtn) {
    screenshotBtn.onclick = () => {
      const svg = document.getElementById('grid');
      const width = window.innerWidth;
      const height = window.innerHeight;
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = width;
      exportCanvas.height = height;
      const ctx = exportCanvas.getContext('2d');
      ctx.fillStyle = document.body.style.background || '#000000';
      ctx.fillRect(0, 0, width, height);
      const svgData = new XMLSerializer().serializeToString(svg);
      const svgBlob = new Blob([svgData], {type: 'image/svg+xml'});
      const svgUrl = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = function() {
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(svgUrl);
        const link = document.createElement('a');
        link.download = 'ESC2025-Design-screenshot.png';
        link.href = exportCanvas.toDataURL('image/png');
        link.click();
      };
      img.src = svgUrl;
    };
  }

  window.addEventListener('resize', () => {
    videoElement.removeAttribute('data-animation-started');
    if (videoElement.src && videoElement.videoWidth > 0) {
      onMediaLoaded();
    } else if (canvasElement.width > 0) {
      drawGrid();
    }
  });

  setupMedia('bg.mp4');
});
