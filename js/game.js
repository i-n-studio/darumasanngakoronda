// game.js - シンプルな骨組み
(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const lifeCount = document.getElementById('lifeCount');
  const distanceCount = document.getElementById('distanceCount');
  const timerCount = document.getElementById('timerCount');
  const moveBtn = document.getElementById('moveBtn');
  const sensorDot = document.getElementById('sensorDot');
  const safeArea = document.getElementById('safeArea');
  const modeSelect = document.getElementById('modeSelect');
  const toggleDebug = document.getElementById('toggleDebug');
  const togglePlayAudio = document.getElementById('togglePlayAudio');

  // Game state
  let state = 'idle'; // idle, safe, preturn, danger, balance, finish
  let progress = 0; // 0..100
  let life = 3;
  let distance = 100;
  let timer = 60;
  let isHolding = false;
  let debugMode = false;
  let audioEnabled = false;
  let mode = 'normal';

  // Sensor values
  let roll = 0; // tilt left-right (-90..90)
  let pitch = 0; // tilt front-back (-180..180)

  // Balance challenge config
  const balanceConfig = {
    easy: {safeSize: 120, moveSpeed: 0.5, duration: 2500},
    normal: {safeSize: 80, moveSpeed: 1.0, duration: 2500},
    hard: {safeSize: 40, moveSpeed: 1.8, duration: 2000}
    ,hell: {safeSize: 28, moveSpeed: 3.2, duration: 1200}
  };

  // Audio
  let audioCtx = null;
  let bgmGain = null;

  // initialize
  function init() {
    lifeCount.textContent = life;
    distanceCount.textContent = Math.round(distance);
    timerCount.textContent = timer;
    mode = modeSelect.value;

    moveBtn.addEventListener('pointerdown', () => { isHolding = true; });
    moveBtn.addEventListener('pointerup', () => { isHolding = false; });
    moveBtn.addEventListener('pointercancel', () => { isHolding = false; });

    modeSelect.addEventListener('change', ()=>{ mode = modeSelect.value; });
    toggleDebug.addEventListener('click', ()=>{ debugMode = !debugMode; toggleDebug.textContent = debugMode ? 'デバッグ非表示' : 'デバッグ表示'; if (debugMode) showDebug(); else hideDebug(); });
    togglePlayAudio.addEventListener('click', () => { audioEnabled = !audioEnabled; togglePlayAudio.textContent = audioEnabled ? 'BGM停止' : 'BGM再生'; if (audioEnabled) startBGM(); else stopBGM();});

    // sensor
    setupDeviceMotion();

    // start game loop
    state = 'safe';
    window.requestAnimationFrame(loop);
    setInterval(()=>{ if (timer>0) { timer--; timerCount.textContent = timer; } }, 1000);

    // ghost rotate interval
    setInterval(()=>{ if (state === 'safe') { startPreTurn(); } }, 3000 + Math.random()*2800);
  }

  // UI/UX helpers
  const stateText = document.getElementById('stateText');
  const stateBadge = document.getElementById('stateBadge');
  const moveBtnProgress = document.getElementById('moveBtnProgress');
  const helpModal = document.getElementById('helpModal');

  function setStateBadge(s){
    stateText.textContent = s;
    if (s === '危険') { stateBadge.style.background = 'rgba(239,68,68,0.08)'; stateBadge.style.borderColor = 'rgba(239,68,68,0.25)'; }
    else if (s === '予兆') { stateBadge.style.background = 'rgba(245,158,11,0.06)'; stateBadge.style.borderColor = 'rgba(245,158,11,0.15)'; }
    else { stateBadge.style.background = 'transparent'; stateBadge.style.borderColor = 'var(--border)'; }
  }

  // help modal
  const helpBtn = document.getElementById('helpBtn');
  const closeHelp = document.getElementById('closeHelp');
  if (helpBtn){
    helpBtn.addEventListener('click', ()=>{ helpModal.setAttribute('aria-hidden','false'); helpModal.style.display='block'; closeHelp.focus(); });
    closeHelp.addEventListener('click', ()=>{ helpModal.setAttribute('aria-hidden','true'); helpModal.style.display='none'; helpBtn.focus(); });
    // close help modal on ESC
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape' && helpModal.getAttribute('aria-hidden') === 'false'){ helpModal.setAttribute('aria-hidden','true'); helpModal.style.display='none'; helpBtn.focus(); } });
  }

  // move progress feedback
  let holdStartTs = 0;
  moveBtn.addEventListener('pointerdown', ()=>{ holdStartTs = performance.now(); moveBtnProgress.style.width = '0%'; moveBtnProgress.style.display = 'block'; });
  moveBtn.addEventListener('pointerup', ()=>{ moveBtnProgress.style.width = '0%'; setTimeout(()=> moveBtnProgress.style.display='none', 120); });

  moveBtn.addEventListener('pointerup', ()=>{ holdStartTs = 0; });

  setInterval(()=>{
    if (!holdStartTs) return; const elapsed = performance.now()-holdStartTs; const pct = Math.min(1, elapsed/3000); moveBtnProgress.style.width = (pct*100)+'%';
  }, 120);

  // helper to read CSS variable values (returns fallback if missing)
  function cssVar(name, fallback) {
    try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }
    catch (e) { return fallback || '' }
  }

  function showDebug(){
    let debugPanel = document.createElement('div');
    debugPanel.id = 'debugPanel';
    debugPanel.innerHTML = `<div class='small'>roll: <span id='dRoll'>0</span></div><div class='small'>pitch: <span id='dPitch'>0</span></div>
      <div class='small'>モード: <span id='dMode'>${mode}</span></div>
      <div class='small'>Balance duration(ms): <input id='dDur' type='number' value='${balanceConfig[mode].duration}' style='width:80px'/></div>
      <div class='small'>Safe width(px): <input id='dSafe' type='number' value='${balanceConfig[mode].safeSize}' style='width:80px'/></div>`;
    document.body.appendChild(debugPanel);
    window._debugPanel = debugPanel;
  }
  function hideDebug(){ if(window._debugPanel){ window._debugPanel.remove(); delete window._debugPanel;} }

  function setDebugText(){ if(!debugMode) return; document.getElementById('dRoll').textContent = Math.round(roll); document.getElementById('dPitch').textContent = Math.round(pitch);}

  // update debug settings
  document.addEventListener('input', (e)=>{
    const id = e.target && e.target.id;
    if (!id) return;
    if (id === 'dDur') {
      balanceConfig[mode].duration = Number(e.target.value);
    } else if (id === 'dSafe') {
      balanceConfig[mode].safeSize = Number(e.target.value); // will be applied next frame
    }
  });

  // device motion
  function setupDeviceMotion(){
    // On iOS 13+ we must request permission from the user.
    function requestIosMotionPermission(){
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function'){
        DeviceMotionEvent.requestPermission().then(response => {
          if (response === 'granted') {
            console.log('Device motion permission granted');
          } else {
            console.warn('Device motion permission denied');
          }
        }).catch(console.error);
      }
    }
    // Call permission request on first user action
    document.addEventListener('pointerdown', requestIosMotionPermission, {once:true});
    // Browser API
    if (window.DeviceMotionEvent) {
      window.addEventListener('devicemotion', (ev) => {
        // use rotationRate or accelerationIncludingGravity
        const acc = ev.accelerationIncludingGravity || ev.acceleration || {x:0,y:0,z:0};
        // approximate tilt from gravity vector
        pitch = Math.atan2(acc.x, acc.y) * (180/Math.PI);
        roll = Math.atan2(acc.y, acc.z) * (180/Math.PI);
      });
    }

    // fallback to DeviceOrientationEvent
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', (ev) =>{
        // alpha beta gamma
        pitch = ev.beta || pitch; // -180 .. 180 (front/back)
        roll = ev.gamma || roll; // -90 .. 90 (left/right)
      });
    }

    // keyboard fallback
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') roll -= 5; if (e.key === 'ArrowRight') roll += 5;
      if (e.key === 'z') pitch -= 5; if (e.key === 'x') pitch += 5;
    });
  }

  function startPreTurn(){ state = 'preturn'; setTimeout(()=>{ state = 'danger'; setTimeout(()=>{ // move to safe after danger
      if (state === 'danger') {
        state = 'safe';
        setStateBadge('安全');
      }
    }, 800); }, 700);
    setStateBadge('予兆');
  }

  // prevent spammy multiple triggers of danger penalty
  let lastDangerTs = 0;

  // Balance mini-game
  function doBalanceChallenge(){
    state = 'balance';
    const cfg = balanceConfig[mode] || balanceConfig['normal'];
    const start = performance.now();
    let success = false;

    // safe area center x in pixel within sensorUI
    const safeRect = safeArea.getBoundingClientRect();
    const sensorRect = document.getElementById('sensorUI').getBoundingClientRect();
    const safeLeft = safeRect.left - sensorRect.left;
    const safeWidth = safeRect.width;

    // challenge loop
    function check() {
      const elapsed = performance.now() - start;

      // convert roll (-90..90) to sensorUI x
      const minX = 0; const maxX = sensorRect.width;
      const center = minX + (roll + 90) / 180 * (maxX - minX);

      // animate sensorDot
      sensorDot.style.left = Math.min(maxX-16, Math.max(0, center - 16)) + 'px';

      // if in safe
      if (center >= safeLeft && center <= safeLeft + safeWidth) {
        // hold
        if (elapsed >= cfg.duration) { success = true; }
      }

      if (success) {
        endBalance(true);
      } else if (elapsed > cfg.duration + 1200) {
        endBalance(false);
      } else {
        requestAnimationFrame(check);
      }
    }

    requestAnimationFrame(check);
  }

  function endBalance(success){
    state = 'safe';
    if (success) {
      // buff: speed up
      console.log('balance success');
      distance = Math.max(0, distance - 20);
      playSfxSuccess();
      // slightly raise BGM pitch as buff
      if (audioCtx && window._bgOsc) { window._bgOsc.frequency.value += 30; setTimeout(()=>{ if(window._bgOsc) window._bgOsc.frequency.value -= 30; }, 1600); }
      // haptic
      if (navigator.vibrate) navigator.vibrate([20,40,20]);
      // visual badge
      setStateBadge('成功'); setTimeout(()=> setStateBadge('安全'), 1500);
    } else {
      // debuff
      console.log('balance failed');
      distance = Math.min(1000, distance + 10);
      life--;
      lifeCount.textContent = life;
      playSfxFail();
      if (audioCtx && window._bgOsc) { window._bgOsc.frequency.value -= 20; setTimeout(()=>{ if(window._bgOsc) window._bgOsc.frequency.value += 20; }, 2000); }
      if (navigator.vibrate) navigator.vibrate([50,100,50]);
      setStateBadge('失敗'); setTimeout(()=> setStateBadge('安全'), 1600);
    }
    distanceCount.textContent = Math.round(distance);
    if (life <= 0) { state = 'finish'; }
  }

  function loop(ts) {
    // game update
    if (state === 'safe') {
      if (isHolding) {
        // move forward
        distance = Math.max(0, distance - 0.1);
        distanceCount.textContent = Math.round(distance);
        if (distance <= 0) { state = 'finish'; }
      }
    }
    if (state === 'danger' && isHolding) {
      // fail instantly
      life--;
      lifeCount.textContent = life;
      // if stopped in danger: start balance
    }

    if (state === 'preturn') {
      // show trembling - not yet implemented visual
    }

    // if in danger and not walking when it flips to safe => start balance
    if (state === 'safe' && !isHolding && Math.random() < 0.01) {
      // pylint placeholder
    }

    if (state === 'safe' && !isHolding && Math.random() < 0.001) {
      // randomly trigger balancing in the background occasionally
    }

    // debug
    setDebugText();
    // update status badge for safe/danger etc
    if (state === 'safe') setStateBadge('安全');
    else if (state === 'danger') setStateBadge('危険');
    else if (state === 'preturn') setStateBadge('予兆');

    // draw
    draw();
    window.requestAnimationFrame(loop);
  }

  function draw(){
    const W = canvas.width; const H = canvas.height;

    // 背景グラデーション (8bit風)
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, cssVar('--bg-1', '#2c3e50'));
    grad.addColorStop(1, cssVar('--bg-2', '#34495e'));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // グリッド線（オプショナル・8bit風）
    ctx.strokeStyle = cssVar('--grid', 'rgba(0,0,0,0.05)');
    ctx.lineWidth = 1;
    for (let i = 0; i < W; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, H);
      ctx.stroke();
    }

    // ゴールライン
    const goalX = W - 80;
    ctx.fillStyle = cssVar('--goal', '#2563eb');
    ctx.fillRect(goalX, 0, 4, H);
    ctx.fillStyle = cssVar('--accent2', '#e6eefc');
    for (let y = 0; y < H; y += 20) {
      ctx.fillRect(goalX, y, 4, 10);
    }

    // プレイヤーのX位置
    const playerX = 60 + progress / 100 * (W - 160);
    let tremor = 0;
    if (state === 'preturn') {
      tremor = Math.sin(Date.now() / 80) * 6;
    }

    // プレイヤー (8bit ドット風キャラクター)
    drawPixelPlayer(playerX + tremor, H / 2 - 30);

    // 鬼 (8bit ドット風)
    const ghostX = W - 120;
    const ghostY = H / 2 - 35;
    drawPixelGhost(ghostX, ghostY, state === 'danger' || state === 'preturn');

    // ステータステキスト (8bit フォント風)
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = cssVar('--accent', '#2563eb');
    ctx.fillText('State: ' + state.toUpperCase(), 20, 25);

    // ライフ (ハート型ピクセル)
    for (let i = 0; i < life; i++) {
      drawPixelHeart(20 + i * 24, 40);
    }

    // プログレスバー
    ctx.fillStyle = cssVar('--border', '#e6e9ef');
    ctx.fillRect(20, H - 30, W - 40, 12);
    ctx.fillStyle = cssVar('--accent', '#2563eb');
    ctx.fillRect(20, H - 30, (W - 40) * (progress / 100), 12);
    ctx.strokeStyle = cssVar('--border', '#e6e9ef');
    ctx.lineWidth = 2;
    ctx.strokeRect(20, H - 30, W - 40, 12);
  }

  // 8bitプレイヤー描画
  function drawPixelPlayer(x, y) {
    const pixels = [
      [0,0,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,0,0],
      [0,0,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,0],
      [1,1,0,1,1,0,1,1],
      [0,0,0,1,1,0,0,0],
      [0,0,1,0,0,1,0,0]
    ];
    const size = 3;
    ctx.fillStyle = cssVar('--player', '#2563eb');
    for (let row = 0; row < pixels.length; row++) {
      for (let col = 0; col < pixels[row].length; col++) {
        if (pixels[row][col]) {
          ctx.fillRect(x + col * size, y + row * size, size, size);
        }
      }
    }
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x, y + pixels.length * size + 2, pixels[0].length * size, 3);
  }

  // 8bit鬼描画
  function drawPixelGhost(x, y, isFacingPlayer) {
    const pixels = [
      [0,0,1,1,1,1,0,0],
      [0,1,0,1,1,0,1,0],
      [1,1,1,1,1,1,1,1],
      [1,0,0,1,1,0,0,1],
      [1,1,1,1,1,1,1,1],
      [1,1,0,1,1,0,1,1],
      [1,0,0,0,0,0,0,1],
      [0,1,0,0,0,0,1,0]
    ];
    const size = 4;
    ctx.fillStyle = isFacingPlayer ? cssVar('--ghost-active', '#1e40af') : cssVar('--ghost', '#94a3b8');
    for (let row = 0; row < pixels.length; row++) {
      for (let col = 0; col < pixels[row].length; col++) {
        if (pixels[row][col]) {
          ctx.fillRect(x + col * size, y + row * size, size, size);
        }
      }
    }
    // 目
    ctx.fillStyle = isFacingPlayer ? '#fff' : '#000';
    if (isFacingPlayer) {
      ctx.fillRect(x + size * 2, y + size * 2, size, size);
      ctx.fillRect(x + size * 5, y + size * 2, size, size);
    }
  }

  // 8bitハート描画
  function drawPixelHeart(x, y) {
    const pixels = [
      [0,1,1,0,1,1,0],
      [1,1,1,1,1,1,1],
      [1,1,1,1,1,1,1],
      [0,1,1,1,1,1,0],
      [0,0,1,1,1,0,0],
      [0,0,0,1,0,0,0]
    ];
    const size = 2;
    ctx.fillStyle = cssVar('--heart', '#ef4444');
    for (let row = 0; row < pixels.length; row++) {
      for (let col = 0; col < pixels[row].length; col++) {
        if (pixels[row][col]) {
          ctx.fillRect(x + col * size, y + row * size, size, size);
        }
      }
    }
  }

  // UI interactions and ghost timer
  // hold on button to move
  let lastMove = 0;
  setInterval(()=>{
    if (isHolding && state === 'safe'){
      progress += 0.6 + (mode==='easy'?1.0:0.0) - (mode==='hard'?0.3:0);
      if (progress >= 100) { progress = 100; state = 'finish'; }
    }
    if (state === 'danger'){
      if (isHolding && Date.now() - lastDangerTs > 300){
        // moving while danger - immediate penalty
        lastDangerTs = Date.now();
        life = Math.max(0, life - 1);
        lifeCount.textContent = life;
        console.warn('動いていたためミス');
        // small penalty and return to safe
        state = 'safe';
      } else if (!isHolding && Date.now() - lastDangerTs > 300){
        // start balance challenge after player stops in danger
        lastDangerTs = Date.now();
        doBalanceChallenge();
      }
    }
  }, 20);

  // Move safe area slowly to prevent easy cheating on table
  let safeOffsetPhase = 0;
  setInterval(()=>{
    safeOffsetPhase += 0.02;
    const container = document.getElementById('sensorUI');
    if (!container) return;
    const w = container.clientWidth;
    const cfg = balanceConfig[mode] || balanceConfig['normal'];
    const safeW = cfg.safeSize; // configure width for current difficulty
    safeArea.style.width = safeW + 'px';
    // oscillate within container
    const left = (w - safeW) / 2 + Math.sin(safeOffsetPhase) * (w/4);
    safeArea.style.left = Math.max(0, Math.min(w - safeW, left)) + 'px';
  }, 60);

  // Hellモードアンロック: シェイク検出
  let lastShake = 0;
  let hellUnlocked = false;
  if (window.DeviceMotionEvent) {
    window.addEventListener('devicemotion', (ev) => {
      const a = ev.accelerationIncludingGravity || ev.acceleration || {x:0,y:0,z:0};
      const mag = Math.sqrt(a.x*a.x + a.y*a.y + a.z*a.z);
      if (mag > 22 && Date.now() - lastShake > 8000) {
        lastShake = Date.now();
        if (!hellUnlocked) {
          hellUnlocked = true;
          alert('隠しモード「Hell」をアンロックしました！');
          if (!Array.from(modeSelect.options).find(o=>o.value==='hell')) {
            const o = new Option('Hell (隠し)', 'hell');
            modeSelect.add(o);
          }
        }
      }
    });
  }

  // audio functions
  function startBGM(){
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      bgmGain = audioCtx.createGain();
      bgmGain.gain.value = 0.1;
      bgmGain.connect(audioCtx.destination);
      const o = audioCtx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = 110;
      o.connect(bgmGain);
      o.start();
      window._bgOsc = o;
    } catch(e){ console.warn('Web Audio error', e); }
  }
  function stopBGM(){ if (window._bgOsc) { window._bgOsc.stop(); delete window._bgOsc; } }

  function playSfxSuccess(){
    if (!audioCtx) return;
    const g = audioCtx.createGain(); g.gain.value = 0.3; g.connect(audioCtx.destination);
    const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.value = 660; o.connect(g); o.start();
    setTimeout(()=>{ o.frequency.value = 880; g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4); setTimeout(()=>{ o.stop(); }, 420); }, 60);
  }
  function playSfxFail(){
    if (!audioCtx) return;
    const g = audioCtx.createGain(); g.gain.value = 0.45; g.connect(audioCtx.destination);
    const o = audioCtx.createOscillator(); o.type = 'square'; o.frequency.value = 120; o.connect(g); o.start();
    setTimeout(()=>{ g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6); setTimeout(()=>{ o.stop(); }, 620); }, 10);
  }

  // expose debug API
  window.game = {
    start: init,
  };

  // auto start
  init();
})();
