const ExportStatus = {
  statusElement: null,
  container: null,
  create: function(message) {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.style.position = 'fixed';
      this.container.style.top = '0';
      this.container.style.left = '0';
      this.container.style.width = '100%';
      this.container.style.height = '100%';
      this.container.style.pointerEvents = 'none';
      this.container.style.zIndex = '999999';
      document.body.appendChild(this.container);
    }
    if (!this.statusElement) {
      this.statusElement = document.createElement('div');
      this.statusElement.id = 'exportStatus';
      this.container.appendChild(this.statusElement);
    }
    this.statusElement.textContent = message;
    return this.statusElement;
  },
  update: function(message) {
    if (this.statusElement) {
      this.statusElement.textContent = message;
    } else {
      this.create(message);
    }
    return this.statusElement;
  },
  remove: function() {
    if (this.statusElement && this.container) {
      this.container.removeChild(this.statusElement);
      this.statusElement = null;
    }
    if (this.container) {
      document.body.removeChild(this.container);
      this.container = null;
    }
  }
};
const ExportManager = {
  config: {
    quality: 'medium',
    fps: 30,
    format: 'webm'
  },
  getExportConfig() {
    const quality = document.getElementById('exportQuality').value;
    const fps = document.getElementById('exportFps').value;
    let bitrate;
    switch (quality) {
      case 'ultra':
        bitrate = 10000;
        break;
      case 'high':
        bitrate = 8000;
        break;
      case 'medium-high':
        bitrate = 6000;
        break;
      case 'medium':
        bitrate = 5000;
        break;
      case 'medium-low':
        bitrate = 4000;
        break;
      case 'low':
        bitrate = 2500;
        break;
      case 'very-low':
        bitrate = 1000;
        break;
      default:
        bitrate = 5000;
    }
    return {
      quality: quality,
      fps: parseInt(fps),
      bitrate: bitrate,
      format: 'webm'
    };
  },
  openExportDialog() {
    document.getElementById('exportConfigOverlay').style.display = 'block';
    document.getElementById('exportConfig').style.display = 'block';
  },
  closeExportDialog() {
    document.getElementById('exportConfigOverlay').style.display = 'none';
    document.getElementById('exportConfig').style.display = 'none';
  },
  async renderFrame(videoElement, svg, canvasCtx, exportCanvas, frame, fps, totalFrames) {
    return new Promise(async (resolve, reject) => {
      const seekTimeoutDuration = 5000;
      try {
        const duration = videoElement.duration;
        const frameTime = Math.min(frame * (duration / totalFrames), duration - 0.0001);
        videoElement.currentTime = frameTime;
        await new Promise((seekResolve, seekReject) => {
          let seeked = false, canplay = false;
          const cleanup = () => {
            videoElement.removeEventListener('seeked', onSeeked);
            videoElement.removeEventListener('canplay', onCanPlay);
            clearTimeout(seekTimer);
          };
          const onSeeked = () => {
            seeked = true;
            if (canplay) { cleanup(); seekResolve(); }
          };
          const onCanPlay = () => {
            canplay = true;
            if (seeked) { cleanup(); seekResolve(); }
          };
          videoElement.addEventListener('seeked', onSeeked);
          videoElement.addEventListener('canplay', onCanPlay);
          const seekTimer = setTimeout(() => {
            cleanup();
            seekReject(new Error(`Video seek/canplay timed out for frame ${frame} at ${frameTime}s`));
          }, seekTimeoutDuration);
        });
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
        if (videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          await new Promise(r => setTimeout(r, 100));
          if (videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            throw new Error(`Video data not available for frame ${frame} after seeking.`);
          }
        }
        const exportCtx = exportCanvas.getContext('2d');
        exportCtx.fillStyle = document.body.style.background || '#000000';
        exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        canvasCtx.drawImage(videoElement, 0, 0, videoElement.videoWidth, videoElement.videoHeight);
        const oldSvgContent = svg.innerHTML;
        const step = settings.itemSize + settings.spacing;
        const cols = Math.floor(exportCanvas.width / step);
        const rows = Math.floor(exportCanvas.height / step);
        const gridWidth = cols * step - settings.spacing;
        const gridHeight = rows * step - settings.spacing;
        const offsetX = (exportCanvas.width - gridWidth) / 2;
        const offsetY = (exportCanvas.height - gridHeight) / 2;
        const sampleBoxSizeX = Math.max(1, Math.floor(canvasElement.width / cols));
        const sampleBoxSizeY = Math.max(1, Math.floor(canvasElement.height / rows));
        const smoothSpeed = 0.18;
        const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        tempSvg.setAttribute('width', exportCanvas.width);
        tempSvg.setAttribute('height', exportCanvas.height);
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        tempSvg.appendChild(defs);
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const cx = offsetX + x * step + settings.itemSize / 2;
            const cy = offsetY + y * step + settings.itemSize / 2;
            const videoX = Math.floor((x / cols) * canvasElement.width);
            const videoY = Math.floor((y / rows) * canvasElement.height);
            let totalR = 0, totalG = 0, totalB = 0, pixelCount = 0;
            try {
              const imageData = canvasCtx.getImageData(videoX, videoY, sampleBoxSizeX, sampleBoxSizeY, { willReadFrequently: true });
              const data = imageData.data;
              for (let i = 0; i < data.length; i += 4) {
                totalR += data[i];
                totalG += data[i+1];
                totalB += data[i+2];
                pixelCount++;
              }
            } catch (e) {}
            const avgR = pixelCount > 0 ? totalR / pixelCount : 0;
            const avgG = pixelCount > 0 ? totalG / pixelCount : 0;
            const avgB = pixelCount > 0 ? totalB / pixelCount : 0;
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
            const heartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            const targetDiameter = currentRadius * 2;
            const actualScale = targetDiameter / heartDesignMaxDim;
            heartGroup.setAttribute('transform', `translate(${cx}, ${cy}) scale(${actualScale}) translate(-${heartPathOriginalCenterX}, -${heartPathOriginalCenterY})`);
            const outerHeart = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            outerHeart.setAttribute('d', heartPathData);
            outerHeart.setAttribute('fill', settings.color1);
            const middleHeart = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            middleHeart.setAttribute('d', heartPathData);
            middleHeart.setAttribute('fill', settings.color2);
            const middleHeartTransform = `translate(${heartPathOriginalCenterX}, ${heartPathOriginalCenterY}) scale(${targetMiddleScale}) translate(-${heartPathOriginalCenterX}, -${heartPathOriginalCenterY})`;
            middleHeart.setAttribute('transform', middleHeartTransform);
            const innerHeart = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            innerHeart.setAttribute('d', heartPathData);
            innerHeart.setAttribute('fill', settings.color3);
            const innerHeartTransform = `translate(${heartPathOriginalCenterX}, ${heartPathOriginalCenterY}) scale(${targetInnerScale}) translate(-${heartPathOriginalCenterX}, -${heartPathOriginalCenterY})`;
            innerHeart.setAttribute('transform', innerHeartTransform);
            heartGroup.appendChild(outerHeart);
            heartGroup.appendChild(middleHeart);
            heartGroup.appendChild(innerHeart);
            tempSvg.appendChild(heartGroup);
          }
        }
        const svgData = new XMLSerializer().serializeToString(tempSvg);
        const svg64 = btoa(unescape(encodeURIComponent(svgData)));
        const img = new Image();
        await new Promise((imgResolve, imgReject) => {
          img.onload = imgResolve;
          img.onerror = (e) => {
            imgReject(new Error('SVG image load error for frame ' + frame)); 
          };
          img.src = 'data:image/svg+xml;base64,' + svg64;
        });
        await new Promise(r => requestAnimationFrame(r));
        exportCtx.drawImage(img, 0, 0, exportCanvas.width, exportCanvas.height);
        svg.innerHTML = oldSvgContent;
        await new Promise(r => requestAnimationFrame(r));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  },
  async exportVideo() {
    const config = this.getExportConfig();
    this.closeExportDialog();
    ExportStatus.create('Preparing export...');
    document.getElementById('cornerLogo').style.display = 'none';
    document.getElementById('settingsPanel').style.display = 'none';
    document.getElementById('gradientOverlay').style.display = 'none';
    try {
      const svg = document.getElementById('grid');
      const videoElement = document.getElementById('refVideo');
      const canvasElement = document.getElementById('refCanvas');
      const canvasCtx = canvasElement.getContext('2d');
      const wasPlaying = !videoElement.paused;      videoElement.pause();
      const mw = videoElement.videoWidth;
      const mh = videoElement.videoHeight;
      // --- Détermination de la résolution d'export vidéo ---
      // On veut le plus grand côté à 3840px (4K), l'autre côté selon l'aspect ratio
      let exportW, exportH;
      if (mw >= mh) {
        exportW = 3840;
        exportH = Math.round(3840 * mh / mw);
      } else {
        exportH = 3840;
        exportW = Math.round(3840 * mw / mh);
      }
      // --- Ajustement de la densité des cœurs pour correspondre à l'affichage ---
      const fit = calculateAspectRatioFit(mw, mh, window.innerWidth, window.innerHeight);
      const scale = fit.width / exportW;
      const exportSettings = {
        ...settings,
        itemSize: settings.itemSize / scale,
        spacing: settings.spacing / scale
      };
      // --- Préparation du canvas d'export ---
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = exportW;
      exportCanvas.height = exportH;
      const duration = videoElement.duration;
      if (!duration || duration <= 0) {
        throw new Error("Unable to determine video duration");
      }
      const fps = config.fps;
      const totalFrames = Math.round(duration * fps);
      ExportStatus.update(`Preparing export: ${totalFrames} frames at ${fps} FPS (${duration.toFixed(2)}s)`);
      function formatDuration(sec) {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
      }
      ExportStatus.update(`Generating frames. This may take a few minutes...`);
      const frames = [];
      let startTime = performance.now();
      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        try {
          if (frameIndex % 5 === 0 || frameIndex === totalFrames - 1) {
            const progress = Math.round((frameIndex / totalFrames) * 100);
            const elapsed = (performance.now() - startTime) / 1000;
            const remaining = frameIndex > 0 ? 
              (elapsed / frameIndex) * (totalFrames - frameIndex) : 
              'calculating...';
            ExportStatus.update(
              `Preparing frame ${frameIndex+1}/${totalFrames} (${progress}%)\n` +
              `Elapsed: ${typeof elapsed === 'number' ? formatDuration(elapsed) : elapsed}, ` +
              `Remaining: ${typeof remaining === 'number' ? formatDuration(remaining) : remaining}`
            );
          }
          const frameTime = Math.min(frameIndex * (duration / totalFrames), duration - 0.001);
          videoElement.currentTime = frameTime;
          await new Promise((resolve) => {
            const onSeeked = () => {
              videoElement.removeEventListener('seeked', onSeeked);
              resolve();
            };
            videoElement.addEventListener('seeked', onSeeked);
          });
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          canvasCtx.drawImage(videoElement, 0, 0, videoElement.videoWidth, videoElement.videoHeight);
          // --- Génère la grille SVG pour ce frame à la bonne résolution ---
          const exportSvg = generateFullGridSVG(exportW, exportH, exportSettings, canvasElement, canvasCtx);
          const svgData = new XMLSerializer().serializeToString(exportSvg);
          const svgBlob = new Blob([svgData], {type: 'image/svg+xml'});
          const svgUrl = URL.createObjectURL(svgBlob);
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = svgUrl;
          });
          const frameCanvas = document.createElement('canvas');
          frameCanvas.width = exportW;
          frameCanvas.height = exportH;
          const frameCtx = frameCanvas.getContext('2d');
          frameCtx.fillStyle = document.body.style.background || '#000000';
          frameCtx.fillRect(0, 0, exportW, exportH);
          frameCtx.drawImage(img, 0, 0, exportW, exportH);
          URL.revokeObjectURL(svgUrl);
          frames.push(frameCanvas.toDataURL('image/webp', 0.95));
        } catch (error) {
          const emptyCanvas = document.createElement('canvas');
          emptyCanvas.width = exportW;
          emptyCanvas.height = exportH;
          const emptyCtx = emptyCanvas.getContext('2d');
          emptyCtx.fillStyle = document.body.style.background || '#000000';
          emptyCtx.fillRect(0, 0, exportW, exportH);
          frames.push(emptyCanvas.toDataURL('image/webp', 0.95));
        }
      }
      ExportStatus.update(`All frames generated. Creating video...`);
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = exportW;
      finalCanvas.height = exportH;
      const finalCtx = finalCanvas.getContext('2d');
      const stream = finalCanvas.captureStream(fps);
      const mediaRecorderOptions = {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: config.bitrate * 1000
      };
      const mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);
      const chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = 'ESC2025-Design.webm';
        a.href = url;
        a.click();
        // Restore UI after export
        document.getElementById('cornerLogo').style.display = '';
        document.getElementById('settingsPanel').style.display = '';
        document.getElementById('gradientOverlay').style.display = '';
        const footer = document.getElementById('esc-credits-footer');
        if (footer) footer.style.display = '';
        // Resume video if it was playing before export
        if (wasPlaying) {
          videoElement.play().catch(() => {});
        }
        setTimeout(() => {
          URL.revokeObjectURL(url);
          ExportStatus.remove();
        }, 3000);
      };
      mediaRecorder.start();
      const frameDuration = 1000 / fps;
      async function drawFrames() {
        let frameCount = 0;
        const startTime = performance.now();
        for (const frameImage of frames) {
          frameCount++;
          if (frameCount % 10 === 0) {
            const progress = Math.round((frameCount / frames.length) * 100);
            ExportStatus.update(`Creating video: ${progress}% (frame ${frameCount}/${frames.length})`);
          }
          const img = new Image();
          await new Promise(resolve => {
            img.onload = resolve;
            img.src = frameImage;
          });
          finalCtx.clearRect(0, 0, exportW, exportH);
          finalCtx.drawImage(img, 0, 0, exportW, exportH);
          const targetTime = startTime + frameCount * frameDuration;
          const now = performance.now();
          const wait = Math.max(0, targetTime - now);
          if (wait > 0) {
            await new Promise(r => setTimeout(r, wait));
          }
        }
        setTimeout(() => {
          mediaRecorder.stop();
        }, 500);
      }
      drawFrames().catch(error => {
        ExportStatus.update('Error: ' + error.message);
        mediaRecorder.stop();
        // Restore UI on error
        document.getElementById('cornerLogo').style.display = '';
        document.getElementById('settingsPanel').style.display = '';
        document.getElementById('gradientOverlay').style.display = '';
        const footer = document.getElementById('esc-credits-footer');
        if (footer) footer.style.display = '';
        // Resume video if it was playing before export
        if (wasPlaying) {
          videoElement.play().catch(() => {});
        }
      });
    } catch (error) {
      ExportStatus.update('Export setup error: ' + error.message);
      document.getElementById('cornerLogo').style.display = '';
      document.getElementById('settingsPanel').style.display = '';
      document.getElementById('gradientOverlay').style.display = '';
      const footer = document.getElementById('esc-credits-footer');
      if (footer) footer.style.display = '';
      // Resume video if it was playing before export
      if (wasPlaying) {
        videoElement.play().catch(() => {});
      }
      setTimeout(() => {
        ExportStatus.remove();
      }, 5000);
    }
  }
};
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
let isCurrentMediaVideo = true;
let currentMediaImage = null;
let isProcessingFrame = false;

function drawFrame() {
  if (isCurrentMediaVideo) {
    if (!videoElement.paused && !videoElement.ended) {
      canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    }
  } else if (currentMediaImage && !isProcessingFrame) {
    canvasCtx.drawImage(currentMediaImage, 0, 0, canvasElement.width, canvasElement.height);
  }
}

function setupMedia(fileOrUrl) {
  let url;
  
  if (typeof fileOrUrl === 'string') {
    // C'est une URL directe (pour bg.mp4)
    url = fileOrUrl;
    isCurrentMediaVideo = true;
  } else {
    // C'est un fichier uploadé
    isCurrentMediaVideo = fileOrUrl.type.startsWith('video/');
    url = URL.createObjectURL(fileOrUrl);
  }
  const exportVideoBtn = document.getElementById('exportVideoBtn');
  const screenshotBtn = document.getElementById('screenshotBtn');
  exportVideoBtn.style.display = isCurrentMediaVideo ? '' : 'none';
  if (screenshotBtn) {
    screenshotBtn.textContent = isCurrentMediaVideo ? 'Screenshot' : 'Export Image';
  }

  // Nettoyage de l'ancien média
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

function lerp(a, b, t) {
  return a + (b - a) * t;
}
let prevMiddleScale = 0.7;
let prevInnerScale = 0.5;
function calculateAspectRatioFit(mediaWidth, mediaHeight, containerWidth, containerHeight) {
  const ratio = Math.min(containerWidth / mediaWidth, containerHeight / mediaHeight);
  return {
    width: Math.floor(mediaWidth * ratio),
    height: Math.floor(mediaHeight * ratio),
    x: Math.floor((containerWidth - mediaWidth * ratio) / 2),
    y: Math.floor((containerHeight - mediaHeight * ratio) / 2)
  };
}

function drawGrid() {
  drawFrame();
  svg.innerHTML = '';
  const viewWidth = window.innerWidth;
  const viewHeight = window.innerHeight;
  const mediaWidth = isCurrentMediaVideo ? videoElement.videoWidth : currentMediaImage.width;
  const mediaHeight = isCurrentMediaVideo ? videoElement.videoHeight : currentMediaImage.height;
  let fit;
  if (settings.keepAspectRatio) {
    fit = calculateAspectRatioFit(mediaWidth, mediaHeight, viewWidth, viewHeight);
  } else {
    fit = {width: viewWidth, height: viewHeight, x: 0, y: 0};
  }
  svg.setAttribute('width', fit.width);
  svg.setAttribute('height', fit.height);
  svg.style.position = 'absolute';
  svg.style.left = fit.x + 'px';
  svg.style.top = fit.y + 'px';

  // Use fit.width/fit.height for grid calculation when aspect ratio is ON
  const gridStep = settings.itemSize + settings.spacing;
  const gridCols = Math.floor(fit.width / gridStep);
  const gridRows = Math.floor(fit.height / gridStep);
  const totalGridWidth = gridCols * gridStep - settings.spacing;
  const totalGridHeight = gridRows * gridStep - settings.spacing;
  const gridOffsetX = (fit.width - totalGridWidth) / 2;
  const gridOffsetY = (fit.height - totalGridHeight) / 2;

  const sampleBoxWidth = Math.max(1, Math.floor(canvasElement.width / gridCols));
  const sampleBoxHeight = Math.max(1, Math.floor(canvasElement.height / gridRows));
  const animationSpeed = 0.18;

  for (let y = 0; y < gridRows; y++) {
    for (let x = 0; x < gridCols; x++) {
      const heartCenterX = gridOffsetX + x * gridStep + settings.itemSize / 2;
      const heartCenterY = gridOffsetY + y * gridStep + settings.itemSize / 2;
      // Map sampleX/sampleY to the media's coordinates
      const sampleX = Math.floor((x / gridCols) * canvasElement.width);
      const sampleY = Math.floor((y / gridRows) * canvasElement.height);
      let totalR = 0, totalG = 0, totalB = 0, pixelCount = 0;
      try {
        // Utilise willReadFrequently pour accélérer getImageData
        const imageData = canvasCtx.getImageData(sampleX, sampleY, sampleBoxWidth, sampleBoxHeight, { willReadFrequently: true });
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          totalR += data[i];
          totalG += data[i+1];
          totalB += data[i+2];
          pixelCount++;
        }
      } catch (e) { continue; }
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
// Génère une grille SVG complète et centrée pour une taille donnée
function generateFullGridSVG(width, height, settings, canvasElement, canvasCtx) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  // Calcul grille
  const gridStep = settings.itemSize + settings.spacing;
  const gridCols = Math.floor(width / gridStep);
  const gridRows = Math.floor(height / gridStep);
  const totalGridWidth = gridCols * gridStep - settings.spacing;
  const totalGridHeight = gridRows * gridStep - settings.spacing;
  const gridOffsetX = (width - totalGridWidth) / 2;
  const gridOffsetY = (height - totalGridHeight) / 2;
  const sampleBoxWidth = Math.max(1, Math.floor(canvasElement.width / gridCols));
  const sampleBoxHeight = Math.max(1, Math.floor(canvasElement.height / gridRows));
  for (let y = 0; y < gridRows; y++) {
    for (let x = 0; x < gridCols; x++) {
      const heartCenterX = gridOffsetX + x * gridStep + settings.itemSize / 2;
      const heartCenterY = gridOffsetY + y * gridStep + settings.itemSize / 2;
      // Map sampleX/sampleY to la vidéo/image source
      const sampleX = Math.floor((x / gridCols) * canvasElement.width);
      const sampleY = Math.floor((y / gridRows) * canvasElement.height);
      let totalR = 0, totalG = 0, totalB = 0, pixelCount = 0;
      try {
        const imageData = canvasCtx.getImageData(sampleX, sampleY, sampleBoxWidth, sampleBoxHeight, { willReadFrequently: true });
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          totalR += data[i];
          totalG += data[i+1];
          totalB += data[i+2];
          pixelCount++;
        }
      } catch (e) { continue; }
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
      const heartGroup = document.createElementNS(svgNS, 'g');
      const targetDiameter = currentRadius * 2;
      const actualScale = targetDiameter / heartDesignMaxDim;
      heartGroup.setAttribute('transform', `translate(${heartCenterX}, ${heartCenterY}) scale(${actualScale}) translate(-${heartPathOriginalCenterX}, -${heartPathOriginalCenterY})`);
      const outerHeart = document.createElementNS(svgNS, 'path');
      outerHeart.setAttribute('d', heartPathData);
      outerHeart.setAttribute('fill', settings.color1);
      const middleHeart = document.createElementNS(svgNS, 'path');
      middleHeart.setAttribute('d', heartPathData);
      middleHeart.setAttribute('fill', settings.color2);
      const middleHeartTransform = `translate(${heartPathOriginalCenterX}, ${heartPathOriginalCenterY}) scale(${targetMiddleScale}) translate(-${heartPathOriginalCenterX}, -${heartPathOriginalCenterY})`;
      middleHeart.setAttribute('transform', middleHeartTransform);
      const innerHeart = document.createElementNS(svgNS, 'path');
      innerHeart.setAttribute('d', heartPathData);
      innerHeart.setAttribute('fill', settings.color3);
      const innerHeartTransform = `translate(${heartPathOriginalCenterX}, ${heartPathOriginalCenterY}) scale(${targetInnerScale}) translate(-${heartPathOriginalCenterX}, -${heartPathOriginalCenterY})`;
      innerHeart.setAttribute('transform', innerHeartTransform);
      heartGroup.appendChild(outerHeart);
      heartGroup.appendChild(middleHeart);
      heartGroup.appendChild(innerHeart);
      svg.appendChild(heartGroup);
    }
  }
  return svg;
}
const settings = {
  itemSize: 40,
  spacing: 0,
  contrast: 2,
  color1: '#F90900',
  color2: '#07DED6',
  color3: '#F22FEB',
  keepAspectRatio: false // Ajout option aspect ratio
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
  importVideoBtn.addEventListener('click', () => videoInput.click());  videoInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) {
      setupMedia(file);
    }
  });
  const exportVideoBtn = document.getElementById('exportVideoBtn');
  const startExportBtn = document.getElementById('startExportBtn');
  const cancelExportBtn = document.getElementById('cancelExportBtn');
  const exportConfigOverlay = document.getElementById('exportConfigOverlay');
  if (exportVideoBtn) {
    exportVideoBtn.onclick = () => ExportManager.openExportDialog();
  }
  if (startExportBtn) {
    startExportBtn.onclick = () => ExportManager.exportVideo();
  }
  if (cancelExportBtn) {
    cancelExportBtn.onclick = () => ExportManager.closeExportDialog();
  }
  if (exportConfigOverlay) {
    exportConfigOverlay.onclick = () => ExportManager.closeExportDialog();
  }  window.addEventListener('resize', () => {
    videoElement.removeAttribute('data-animation-started');
    if (videoElement.src && videoElement.videoWidth > 0) {
      onMediaLoaded();
    } else if (canvasElement.width > 0) {
      // Pour les images fixes, redessiner simplement la grille
      drawGrid();
    }
  });

  // Charger la vidéo par défaut au démarrage
  setupMedia('bg.mp4');

  // Plus de création dynamique du toggle aspect ratio ici
  // On récupère simplement l'élément existant
  const toggle = document.getElementById('aspectRatioToggle');
  toggle.checked = settings.keepAspectRatio;
  toggle.onchange = e => {
    settings.keepAspectRatio = e.target.checked;
    videoElement.removeAttribute('data-animation-started');
    if (videoElement.src && videoElement.videoWidth > 0) {
      onMediaLoaded();
    } else if (canvasElement.width > 0) {
      drawGrid();
    }
  };

  // Screenshot unique, centré ou stretch selon le toggle
  const screenshotBtn = document.getElementById('screenshotBtn');
  if (screenshotBtn) {
    // Ajout de l'icône Font Awesome (fa-solid fa-file-arrow-down)
    screenshotBtn.innerHTML = '<i class="fa-solid fa-file-arrow-down" style="margin-right:8px;"></i>Screenshot';
    screenshotBtn.onclick = () => {
      const svg = document.getElementById('grid');
      const mw = isCurrentMediaVideo ? videoElement.videoWidth : currentMediaImage.width;
      const mh = isCurrentMediaVideo ? videoElement.videoHeight : currentMediaImage.height;
      // Détermine la résolution 4K cible en respectant l'aspect ratio du média
      let targetW = 3840, targetH = 2160;
      if (mw < mh) {
        // Portrait
        targetW = 2160;
        targetH = 3840;
      }
      // Ajuste pour respecter l'aspect ratio du média
      const mediaRatio = mw / mh;
      let exportW = targetW, exportH = targetH;
      if (mediaRatio > targetW / targetH) {
        // Média plus large que 16:9, ajuste la hauteur
        exportH = Math.round(targetW / mediaRatio);
        exportW = targetW;
      } else {
        // Média plus haut que 16:9, ajuste la largeur
        exportW = Math.round(targetH * mediaRatio);
        exportH = targetH;
      }
      if (settings.keepAspectRatio) {
        // Calcule la zone de fit utilisée à l'écran
        const fit = calculateAspectRatioFit(mw, mh, window.innerWidth, window.innerHeight);
        // Calcule le ratio d'échelle entre l'affichage et l'export
        const scale = fit.width / exportW;
        // Ajuste la taille des cœurs et l'espacement pour l'export
        const exportSettings = {
          ...settings,
          itemSize: settings.itemSize / scale,
          spacing: settings.spacing / scale
        };
        // Génère la grille SVG à la taille d'export 4K, aspect ratio média
        const exportSvg = generateFullGridSVG(exportW, exportH, exportSettings, canvasElement, canvasCtx);
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = exportW;
        exportCanvas.height = exportH;
        const ctx = exportCanvas.getContext('2d');
        ctx.fillStyle = document.body.style.background || '#000';
        ctx.fillRect(0, 0, exportW, exportH);
        const data = new XMLSerializer().serializeToString(exportSvg);
        const url = URL.createObjectURL(new Blob([data], {type:'image/svg+xml'}));
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, exportW, exportH);
          URL.revokeObjectURL(url);
          const a = document.createElement('a');
          a.download = 'ESC2025-Design.png';
          a.href = exportCanvas.toDataURL('image/png');
          a.click();
        };
        img.src = url;
        return;
      } else {
        // Mode stretch classique, exporte en 4K plein écran
        const c = document.createElement('canvas');
        c.width = targetW;
        c.height = targetH;
        const ctx = c.getContext('2d');
        ctx.fillStyle = document.body.style.background || '#000';
        ctx.fillRect(0, 0, targetW, targetH);
        const data = new XMLSerializer().serializeToString(svg);
        const url = URL.createObjectURL(new Blob([data], {type:'image/svg+xml'}));
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, targetW, targetH);
          URL.revokeObjectURL(url);
          const a = document.createElement('a');
          a.download = 'ESC2025-Design.png';
          a.href = c.toDataURL('image/png');
          a.click();
        };
        img.src = url;
      }
    };
  }

  // Ajout Font Awesome si pas déjà présent
  if (!document.getElementById('fa-cdn')) {
    const fa = document.createElement('link');
    fa.id = 'fa-cdn';
    fa.rel = 'stylesheet';
    fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css';
    document.head.appendChild(fa);
  }

  // Ajout de l'icône Font Awesome pour screenshot et export vidéo (sans redéclaration)
  if (screenshotBtn) {
    screenshotBtn.innerHTML = '<i class="fa-solid fa-file-arrow-down" style="margin-right:8px;"></i>Screenshot';
  }
  if (exportVideoBtn) {
    exportVideoBtn.innerHTML = '<i class="fa-solid fa-file-export" style="margin-right:8px;"></i>Export video';
  }
});