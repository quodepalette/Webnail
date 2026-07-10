(function(){
  'use strict';

  const app = document.getElementById('app');
  const canvas = document.getElementById('outputCanvas');
  const stage = document.getElementById('stage');
  const stageInner = document.getElementById('stageInner');
  const emptyNote = document.getElementById('emptyNote');
  const dimTop = document.getElementById('dimTop');
  const downloadBtn = document.getElementById('downloadBtn');
  const urlBarGroup = document.getElementById('urlBarGroup');
  const exportNote = document.getElementById('exportNote');
  const captureStatus = document.getElementById('captureStatus');

  // ---------- state ----------
  let img = null;          // single mode
  let desktopImg = null;   // pair mode
  let mobileImg = null;    // pair mode
  const tainted = { single:false, desktop:false, mobile:false };

  let state = {
    mode: 'single',        // 'single' | 'pair'
    frame: 'mac',          // single: mac|minimal|phone|none ; pair (desktop side): mac|minimal|none
    chrome: 'dark',
    url: 'yourproject.dev',
    bg: 'custom',
    customColor: '#F0F0F0',
    padding: 160,
    gap: 40,
    mobileScale: 1,
    radius: 32,
    shadow: 100,
    exportScale: 1
  };

  // ================= helpers =================
  function scaleFactor(frameW){ return frameW/900 > 1 ? frameW/900 : 1; }

  function roundRectPath(c, x, y, w, h, r){
    r = Math.max(0, Math.min(r, w/2, h/2));
    c.beginPath();
    c.moveTo(x+r, y);
    c.arcTo(x+w, y, x+w, y+h, r);
    c.arcTo(x+w, y+h, x, y+h, r);
    c.arcTo(x, y+h, x, y, r);
    c.arcTo(x, y, x+w, y, r);
    c.closePath();
  }

  function paintBackground(c, w, h){
    if(state.bg === 'transparent') return;
    if(state.bg === 'grid'){
      c.fillStyle = '#0C2B4E';
      c.fillRect(0,0,w,h);
      c.strokeStyle = 'rgba(133,196,255,0.14)';
      c.lineWidth = 1;
      for(let gx=0; gx<w; gx+=16){ c.beginPath(); c.moveTo(gx,0); c.lineTo(gx,h); c.stroke(); }
      for(let gy=0; gy<h; gy+=16){ c.beginPath(); c.moveTo(0,gy); c.lineTo(w,gy); c.stroke(); }
      return;
    }
    if(state.bg === 'solid-1'){ c.fillStyle = '#EDE7DA'; c.fillRect(0,0,w,h); return; }
    if(state.bg === 'solid-2'){ c.fillStyle = '#1B1F27'; c.fillRect(0,0,w,h); return; }
    if(state.bg === 'custom'){ c.fillStyle = state.customColor; c.fillRect(0,0,w,h); return; }
    const grads = {
      'grad-1': ['#FF9966','#FF6B45'],
      'grad-2': ['#4FD1A5','#2E9E7C'],
      'grad-3': ['#7FC1FF','#2E5C9E']
    };
    if(grads[state.bg]){
      const g = c.createLinearGradient(0,0,w,h);
      g.addColorStop(0, grads[state.bg][0]);
      g.addColorStop(1, grads[state.bg][1]);
      c.fillStyle = g;
      c.fillRect(0,0,w,h);
    }
  }

  // Compute the frame geometry for a given screenshot + style.
  // destW/destH let the caller pre-scale a mockup (used to size the mobile
  // frame relative to the desktop frame in pair mode) without touching the
  // source image itself — drawImage scales on the way out regardless of the
  // source's native resolution.
  function frameMetrics(sourceImg, style, destW, destH){
    const shotW = destW || sourceImg.naturalWidth;
    const shotH = destH || sourceImg.naturalHeight;
    if(style === 'phone'){
      const bezel = Math.round(shotW * 0.032);
      return {
        style, shotW, shotH, bezel, notchH:0, chromeH:0,
        frameW: shotW + bezel*2,
        frameH: shotH + bezel*2
      };
    }
    const chromeH = style === 'mac' ? Math.round(shotW*0.052) :
                    style === 'minimal' ? Math.round(shotW*0.036) : 0;
    return {
      style, shotW, shotH, bezel:0, notchH:0, chromeH,
      frameW: shotW,
      frameH: shotH + chromeH
    };
  }

  function drawFrame(c, m, sourceImg, x, y, radius, chromeMode, urlText){
    const dark = chromeMode === 'dark';
    const surface  = dark ? '#1E2228' : '#ffffff';
    const chromeBg = dark ? '#22262E' : '#F0F0F0';
    const pillBg   = dark ? '#2B3038' : '#FFFFFF';
    const textCol  = dark ? '#B8BEC6' : '#5B6570';
    const mutedDot = dark ? '#9AA3AD' : '#8A929B';
    const hairline = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

    // shadow + base fill
    c.save();
    if(state.shadow > 0){
      c.shadowColor = 'rgba(0,0,0,' + (state.shadow/100*0.55).toFixed(2) + ')';
      c.shadowBlur = state.shadow/100 * 60;
      c.shadowOffsetY = state.shadow/100 * 26;
    }
    c.fillStyle = m.style === 'phone' ? chromeBg : surface;
    roundRectPath(c, x, y, m.frameW, m.frameH, radius);
    c.fill();
    c.restore();

    if(m.style === 'phone'){
      const sx = x + m.bezel, sy = y + m.bezel;
      c.save();
      roundRectPath(c, sx, sy, m.shotW, m.shotH, Math.max(radius - m.bezel*0.55, 6));
      c.clip();
      c.drawImage(sourceImg, sx, sy, m.shotW, m.shotH);
      c.restore();

      // dynamic island — floats over the screen near the top, always dark
      // regardless of chrome mode (it's a physical camera cutout)
      const islandW = m.shotW * 0.30, islandH = m.shotW * 0.022;
      c.fillStyle = '#0B0C0F';
      roundRectPath(c, x + m.frameW/2 - islandW/2, sy + m.bezel*0.42, islandW, islandH, islandH/2);
      c.fill();

      // home indicator — floats over the screen near the bottom, with a
      // soft shadow so it stays legible over any screenshot content
      const barW = m.shotW * 0.32, barH = Math.max(3, m.shotW * 0.007);
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.35)';
      c.shadowBlur = barH * 1.5;
      c.fillStyle = 'rgba(255,255,255,0.92)';
      roundRectPath(c, x + m.frameW/2 - barW/2, sy + m.shotH - m.bezel*0.55, barW, barH, barH/2);
      c.fill();
      c.restore();

      // side buttons, subtle
      const btnW = Math.max(2, m.bezel*0.24);
      c.fillStyle = dark ? '#171A1F' : '#DADDE1';
      roundRectPath(c, x - 1, y + m.frameH*0.15, btnW+1, m.frameH*0.06, 2);
      c.fill();
      roundRectPath(c, x - 1, y + m.frameH*0.24, btnW+1, m.frameH*0.09, 2);
      c.fill();
      roundRectPath(c, x + m.frameW - btnW, y + m.frameH*0.19, btnW+1, m.frameH*0.085, 2);
      c.fill();

      // thin outer rim for a premium device edge
      roundRectPath(c, x+0.5, y+0.5, m.frameW-1, m.frameH-1, radius-0.5);
      c.lineWidth = 1;
      c.strokeStyle = hairline;
      c.stroke();
    } else {
      c.save();
      roundRectPath(c, x, y, m.frameW, m.frameH, radius);
      c.clip();

      if(m.chromeH > 0){
        c.fillStyle = chromeBg;
        c.fillRect(x, y, m.frameW, m.chromeH);

        if(m.style === 'mac'){
          const dotR = m.chromeH*0.15, dotY = y + m.chromeH/2;
          const colors = ['#FF5F57','#FEBC2E','#28C840'];
          colors.forEach((col,i) => {
            c.fillStyle = col;
            c.beginPath();
            c.arc(x + m.chromeH*0.58 + i*m.chromeH*0.44, dotY, dotR, 0, Math.PI*2);
            c.fill();
          });

          const pillX = x + m.chromeH*2.2;
          const pillW = m.frameW - m.chromeH*2.2 - m.chromeH*1.4;
          const pillH = m.chromeH*0.48;
          if(pillW > 4){
            c.fillStyle = pillBg;
            roundRectPath(c, pillX, dotY-pillH/2, pillW, pillH, pillH/2);
            c.fill();
            c.lineWidth = 1;
            c.strokeStyle = hairline;
            roundRectPath(c, pillX, dotY-pillH/2, pillW, pillH, pillH/2);
            c.stroke();
            c.fillStyle = textCol;
            c.font = Math.round(m.chromeH*0.30) + 'px "IBM Plex Mono", monospace';
            c.textBaseline = 'middle';
            c.fillText('🔒 ' + urlText, pillX + pillH*0.6, dotY+1);
          }

          // menu affordance at the right edge, for a bit of modern polish
          c.fillStyle = mutedDot;
          for(let i=0;i<3;i++){
            c.beginPath();
            c.arc(x + m.frameW - m.chromeH*0.55, dotY - m.chromeH*0.16 + i*m.chromeH*0.16, m.chromeH*0.032, 0, Math.PI*2);
            c.fill();
          }
        } else if(m.style === 'minimal'){
          const pillX = x + m.chromeH*0.5, pillW = m.frameW - m.chromeH;
          const pillH = m.chromeH*0.6, pillY = y + (m.chromeH-pillH)/2;
          c.fillStyle = pillBg;
          roundRectPath(c, pillX, pillY, pillW, pillH, pillH/2);
          c.fill();
          c.lineWidth = 1;
          c.strokeStyle = hairline;
          roundRectPath(c, pillX, pillY, pillW, pillH, pillH/2);
          c.stroke();
          c.fillStyle = mutedDot;
          c.beginPath();
          c.arc(pillX + pillH*0.55, pillY+pillH/2, m.chromeH*0.09, 0, Math.PI*2);
          c.fill();
          c.fillStyle = textCol;
          c.font = Math.round(m.chromeH*0.32) + 'px "IBM Plex Mono", monospace';
          c.textBaseline = 'middle';
          c.fillText(urlText, pillX + pillH*1.15, pillY+pillH/2+1);
        }

        // hairline divider, separating chrome from content
        c.fillStyle = hairline;
        c.fillRect(x, y + m.chromeH - 1, m.frameW, 1);
      }
      c.drawImage(sourceImg, x, y+m.chromeH, m.shotW, m.shotH);
      c.restore();

      // thin outer rim, for definition against any background
      roundRectPath(c, x+0.5, y+0.5, m.frameW-1, m.frameH-1, radius-0.5);
      c.lineWidth = 1;
      c.strokeStyle = hairline;
      c.stroke();
    }
  }

  // ================= main draw =================
  function draw(targetCanvas, scaleMultiplier){
    const dpr = scaleMultiplier || 1;

    if(state.mode === 'single'){
      if(!img) return null;
      const m = frameMetrics(img, state.frame);
      const pad = state.padding * scaleFactor(m.frameW);
      const canvasW = Math.round(m.frameW + pad*2);
      const canvasH = Math.round(m.frameH + pad*2);

      targetCanvas.width = canvasW * dpr;
      targetCanvas.height = canvasH * dpr;
      const c = targetCanvas.getContext('2d');
      c.scale(dpr, dpr);
      c.clearRect(0,0,canvasW,canvasH);
      paintBackground(c, canvasW, canvasH);
      drawFrame(c, m, img, pad, pad, state.radius, state.chrome, state.url);
      return {w: canvasW, h: canvasH};
    }

    // pair mode
    if(!desktopImg || !mobileImg) return null;
    const dm = frameMetrics(desktopImg, state.frame);
    const rawMobile = frameMetrics(mobileImg, 'phone');
    const scale = Math.max(0.15, (dm.frameH * state.mobileScale) / rawMobile.frameH);
    const mm = frameMetrics(mobileImg, 'phone', rawMobile.shotW*scale, rawMobile.shotH*scale);

    const pad = state.padding * scaleFactor(dm.frameW);
    const gap = state.gap * scaleFactor(dm.frameW);
    const canvasW = Math.round(pad*2 + dm.frameW + gap + mm.frameW);
    const contentH = Math.max(dm.frameH, mm.frameH);
    const canvasH = Math.round(pad*2 + contentH);

    targetCanvas.width = canvasW * dpr;
    targetCanvas.height = canvasH * dpr;
    const c = targetCanvas.getContext('2d');
    c.scale(dpr, dpr);
    c.clearRect(0,0,canvasW,canvasH);
    paintBackground(c, canvasW, canvasH);

    const desktopY = pad + (contentH - dm.frameH)/2;
    const mobileY = pad + (contentH - mm.frameH)/2;
    drawFrame(c, dm, desktopImg, pad, desktopY, state.radius, state.chrome, state.url);
    drawFrame(c, mm, mobileImg, pad + dm.frameW + gap, mobileY, state.radius*scale, state.chrome, state.url);

    return {w: canvasW, h: canvasH};
  }

  function render(){
    const dims = draw(canvas, 1);
    if(!dims){
      stageInner.style.display = 'none';
      emptyNote.style.display = 'block';
      updateDownloadState();
      return;
    }
    emptyNote.style.display = 'none';
    stageInner.style.display = 'block';
    const available = Math.max(220, stage.clientWidth - 56);
    const displayW = Math.min(dims.w, available, 1100);
    canvas.style.width = displayW + 'px';
    canvas.style.height = 'auto';
    dimTop.textContent = dims.w + ' × ' + dims.h;
    updateDownloadState();
  }

  function updateDownloadState(){
    const ready = state.mode === 'single' ? !!img : !!(desktopImg && mobileImg);
    downloadBtn.disabled = !ready;
    if(!ready && state.mode === 'pair' && (desktopImg || mobileImg)){
      exportNote.textContent = 'Add the other screenshot to enable export.';
      exportNote.classList.remove('error');
    } else if(exportNote.dataset.sticky !== '1'){
      exportNote.textContent = '';
    }
  }

  // ================= mode toggle =================
  document.getElementById('modeToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if(!btn) return;
    document.querySelectorAll('#modeToggle .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.modeBtn;
    app.dataset.mode = state.mode;

    // carry a single-mode upload into the desktop slot as a convenience
    if(state.mode === 'pair' && !desktopImg && img){
      desktopImg = img;
      setPreview(document.getElementById('dzContentDesktop'), img.src, 'desktop');
      document.getElementById('dropzoneDesktop').classList.add('has-image');
    }
    updateUrlBarVisibility();
    render();
  });

  // ================= uploaders =================
  function setPreview(dzContentEl, src, label){
    dzContentEl.innerHTML = '<img src="' + src + '" alt="' + label + ' screenshot preview"><div class="swap-label">Click to swap</div>';
  }

  function wireDropzone(dzEl, inputEl, dzContentEl, onLoaded){
    function loadFile(file){
      if(!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const image = new Image();
        image.onload = () => {
          onLoaded(image);
          setPreview(dzContentEl, e.target.result, 'uploaded');
          dzEl.classList.add('has-image');
          render();
        };
        image.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    dzEl.addEventListener('click', () => inputEl.click());
    dzEl.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); inputEl.click(); } });
    inputEl.addEventListener('change', (e) => loadFile(e.target.files[0]));
    ['dragenter','dragover'].forEach(ev => dzEl.addEventListener(ev, (e) => { e.preventDefault(); dzEl.classList.add('drag'); }));
    ['dragleave','drop'].forEach(ev => dzEl.addEventListener(ev, (e) => { e.preventDefault(); dzEl.classList.remove('drag'); }));
    dzEl.addEventListener('drop', (e) => { if(e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]); });

    return loadFile;
  }

  wireDropzone(
    document.getElementById('dropzone'),
    document.getElementById('fileInput'),
    document.getElementById('dzContent'),
    (image) => { img = image; tainted.single = false; }
  );
  wireDropzone(
    document.getElementById('dropzoneDesktop'),
    document.getElementById('fileInputDesktop'),
    document.getElementById('dzContentDesktop'),
    (image) => { desktopImg = image; tainted.desktop = false; }
  );
  wireDropzone(
    document.getElementById('dropzoneMobile'),
    document.getElementById('fileInputMobile'),
    document.getElementById('dzContentMobile'),
    (image) => { mobileImg = image; tainted.mobile = false; }
  );

  window.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if(!items) return;
    for(const item of items){
      if(item.type.startsWith('image/')){
        const file = item.getAsFile();
        if(state.mode === 'single'){
          document.getElementById('fileInput').files = null; // no-op, guard
          const reader = new FileReader();
          reader.onload = (e2) => {
            const image = new Image();
            image.onload = () => {
              img = image; tainted.single = false;
              setPreview(document.getElementById('dzContent'), e2.target.result, 'uploaded');
              document.getElementById('dropzone').classList.add('has-image');
              render();
            };
            image.src = e2.target.result;
          };
          reader.readAsDataURL(file);
        } else {
          const targetIsDesktop = !desktopImg;
          const reader = new FileReader();
          reader.onload = (e2) => {
            const image = new Image();
            image.onload = () => {
              if(targetIsDesktop){
                desktopImg = image; tainted.desktop = false;
                setPreview(document.getElementById('dzContentDesktop'), e2.target.result, 'desktop');
                document.getElementById('dropzoneDesktop').classList.add('has-image');
              } else {
                mobileImg = image; tainted.mobile = false;
                setPreview(document.getElementById('dzContentMobile'), e2.target.result, 'mobile');
                document.getElementById('dropzoneMobile').classList.add('has-image');
              }
              render();
            };
            image.src = e2.target.result;
          };
          reader.readAsDataURL(file);
        }
      }
    }
  });

  // ================= URL capture (Microlink) =================
  const captureUrlInput = document.getElementById('captureUrl');
  const captureBtn = document.getElementById('captureBtn');

  function normalizeUrl(raw){
    let v = (raw || '').trim();
    if(!v) return null;
    if(!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try{
      const u = new URL(v);
      if(!u.hostname.includes('.')) return null;
      return u.toString();
    } catch(err){
      return null;
    }
  }

  const DESKTOP_VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false };
  const MOBILE_VIEWPORT  = { width: 390,  height: 844, deviceScaleFactor: 1, isMobile: true };

  // Asks Microlink to screenshot `target` at the given viewport, then fetches
  // the resulting image itself and turns it into a blob: URL. Fetching it
  // ourselves (rather than just pointing an <img> at Microlink's CDN url)
  // means the browser reads the bytes locally afterwards, so the canvas
  // export later isn't tainted by a cross-origin source.
  async function fetchScreenshot(target, vp){
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    try{
      const api = new URL('https://api.microlink.io/');
      api.searchParams.set('url', target);
      api.searchParams.set('screenshot', 'true');
      api.searchParams.set('meta', 'false');
      api.searchParams.set('viewport.width', String(vp.width));
      api.searchParams.set('viewport.height', String(vp.height));
      api.searchParams.set('viewport.deviceScaleFactor', String(vp.deviceScaleFactor));
      if(vp.isMobile) api.searchParams.set('viewport.isMobile', 'true');
      const res = await fetch(api.toString(), { signal: controller.signal });
      if(!res.ok) throw new Error('capture-failed');
      const json = await res.json();
      if(json.status !== 'success' || !json.data || !json.data.screenshot || !json.data.screenshot.url){
        throw new Error('capture-empty');
      }
      const imgRes = await fetch(json.data.screenshot.url, { signal: controller.signal });
      if(!imgRes.ok) throw new Error('image-fetch-failed');
      const blob = await imgRes.blob();
      return URL.createObjectURL(blob);
    } finally{
      clearTimeout(timeoutId);
    }
  }

  function loadImageFromBlobUrl(blobUrl){
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('image-decode-failed'));
      image.src = blobUrl;
    });
  }

  function setCaptureStatus(text, kind){
    captureStatus.textContent = text;
    captureStatus.className = 'capture-status' + (kind ? (' ' + kind) : '');
  }

  async function runCapture(){
    const target = normalizeUrl(captureUrlInput.value);
    if(!target){
      setCaptureStatus('Enter a valid website address, e.g. example.com', 'error');
      captureUrlInput.focus();
      return;
    }

    captureBtn.disabled = true;
    captureBtn.textContent = 'Capturing…';
    setCaptureStatus('Requesting a screenshot of ' + target + ' — this can take up to 20s…', 'loading');

    // Keep the address-bar text in sync with whatever URL was actually
    // captured, so the frame's chrome doesn't show a stale/mismatched URL.
    function syncAddressBar(){
      state.url = target;
      document.getElementById('urlText').value = target;
    }

    try{
      if(state.mode === 'single'){
        const wantMobile = state.frame === 'phone';
        const blobUrl = await fetchScreenshot(target, wantMobile ? MOBILE_VIEWPORT : DESKTOP_VIEWPORT);
        const image = await loadImageFromBlobUrl(blobUrl);
        img = image;
        tainted.single = false;
        setPreview(document.getElementById('dzContent'), blobUrl, 'captured');
        document.getElementById('dropzone').classList.add('has-image');
        syncAddressBar();
        render();
        setCaptureStatus('Captured ' + target + '.', 'success');
      } else {
        setCaptureStatus('Capturing desktop and mobile views of ' + target + ' — this can take up to 20s…', 'loading');
        const [desktopBlobUrl, mobileBlobUrl] = await Promise.all([
          fetchScreenshot(target, DESKTOP_VIEWPORT),
          fetchScreenshot(target, MOBILE_VIEWPORT)
        ]);
        const [desktopImage, mobileImage] = await Promise.all([
          loadImageFromBlobUrl(desktopBlobUrl),
          loadImageFromBlobUrl(mobileBlobUrl)
        ]);
        desktopImg = desktopImage;
        tainted.desktop = false;
        setPreview(document.getElementById('dzContentDesktop'), desktopBlobUrl, 'desktop');
        document.getElementById('dropzoneDesktop').classList.add('has-image');

        mobileImg = mobileImage;
        tainted.mobile = false;
        setPreview(document.getElementById('dzContentMobile'), mobileBlobUrl, 'mobile');
        document.getElementById('dropzoneMobile').classList.add('has-image');

        syncAddressBar();
        render();
        setCaptureStatus('Captured desktop and mobile shots of ' + target + '.', 'success');
      }
    } catch(err){
      setCaptureStatus("Couldn't capture that site — it may block automated screenshots, or the free capture quota was hit. Try again shortly, or upload a screenshot manually.", 'error');
    } finally{
      captureBtn.disabled = false;
      captureBtn.textContent = 'Capture';
    }
  }

  captureBtn.addEventListener('click', runCapture);
  captureUrlInput.addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.preventDefault(); runCapture(); } });

  // ================= frame style controls =================
  function updateUrlBarVisibility(){
    if(state.mode === 'single'){
      urlBarGroup.style.display = (state.frame === 'phone' || state.frame === 'none') ? 'none' : 'block';
    } else {
      urlBarGroup.style.display = (state.frame === 'none') ? 'none' : 'block';
    }
  }

  document.getElementById('frameStyle').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if(!btn) return;
    document.querySelectorAll('#frameStyle .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.frame = btn.dataset.frame;
    updateUrlBarVisibility();
    render();
  });

  document.getElementById('frameStylePair').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if(!btn) return;
    document.querySelectorAll('#frameStylePair .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.frame = btn.dataset.framePair;
    updateUrlBarVisibility();
    render();
  });

  document.querySelectorAll('[data-chrome]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-chrome]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.chrome = btn.dataset.chrome;
      render();
    });
  });

  document.getElementById('urlText').addEventListener('input', (e) => {
    state.url = e.target.value || ' ';
    render();
  });

  document.getElementById('bgSwatches').addEventListener('click', (e) => {
    const sw = e.target.closest('.swatch');
    if(!sw) return;
    document.querySelectorAll('#bgSwatches .swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
    state.bg = sw.dataset.bg;
    render();
  });
  document.getElementById('customColor').addEventListener('input', (e) => {
    state.customColor = e.target.value;
    document.querySelectorAll('#bgSwatches .swatch').forEach(s => s.classList.remove('active'));
    e.target.closest('.swatch').classList.add('active');
    state.bg = 'custom';
    render();
  });

  function bindSlider(id, key, suffix){
    const el = document.getElementById(id);
    const valEl = document.getElementById(key + 'Val');
    el.addEventListener('input', () => {
      state[key] = Number(el.value);
      valEl.textContent = el.value + suffix;
      render();
    });
  }
  bindSlider('paddingSlider', 'padding', 'px');
  bindSlider('gapSlider', 'gap', 'px');
  bindSlider('radiusSlider', 'radius', 'px');
  bindSlider('shadowSlider', 'shadow', '%');
  document.getElementById('mobileScaleSlider').addEventListener('input', (e) => {
    state.mobileScale = Number(e.target.value) / 100;
    document.getElementById('mobileScaleVal').textContent = e.target.value + '%';
    render();
  });

  document.querySelectorAll('.export-scale .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.export-scale .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.exportScale = Number(btn.dataset.scale);
    });
  });

  downloadBtn.addEventListener('click', () => {
    const ready = state.mode === 'single' ? !!img : !!(desktopImg && mobileImg);
    if(!ready) return;
    const anyTainted = state.mode === 'single' ? tainted.single : (tainted.desktop || tainted.mobile);
    const exportCanvas = document.createElement('canvas');
    draw(exportCanvas, state.exportScale);
    try{
      const dataUrl = exportCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = state.mode === 'pair' ? 'Webnail-desktop-mobile-mockup.png' : 'Webnail-mockup.png';
      link.href = dataUrl;
      link.click();
      exportNote.textContent = '';
      exportNote.classList.remove('error');
      exportNote.dataset.sticky = '0';
    } catch(err){
      exportNote.textContent = "Can't export this one: a URL-captured screenshot didn't allow cross-origin export. Right-click the preview to save it as-is, or upload the screenshot as a file instead (uploaded files always export cleanly).";
      exportNote.classList.add('error');
      exportNote.dataset.sticky = '1';
    }
  });

  window.addEventListener('resize', render);

  // initial paint
  updateUrlBarVisibility();
  render();
})();