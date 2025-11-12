const LOGICAL_WIDTH = 288;
const LOGICAL_HEIGHT = 512;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('start-screen');
const bgMusic = document.getElementById('bg-music');
const hitSound = document.getElementById('hit-sound');
const flapSound = document.getElementById('flap-sound');
const tokensEl = document.getElementById('tokens');

let started = false;
let running = false;
let safeRestartTimer = 0;
let lastTime = 0;
let gameOver = false;
let score = 0;
let bestScore = 0;
let gameOverAlpha = 0;

const GRAVITY = 0.11;
const FLAP_STRENGTH = -3.6;
const MAX_FALL_SPEED = 3.6;
const GROUND_Y = LOGICAL_HEIGHT - 112;
const BIRD_X = 60;
const BASE_PIPE_SPEED = 1.45;
const BASE_PIPE_GAP = 155;
const PIPE_SCALE = 0.15;
const PIPE_HITBOX_SCALE = 0.8;

const bird = { x: BIRD_X, y: LOGICAL_HEIGHT / 2, vy: 0, r: 18 };
const pipes = [];
let pipeTimer = 0;

const targets = [];
let targetTimer = 0;
let tokens = 0;

const teacherImg = new Image(); teacherImg.src = 'Assets/images/teacher.png';
const pipeImg = new Image(); pipeImg.src = 'Assets/images/pipe.png';
const bgImg = new Image(); bgImg.src = 'Assets/images/bg.png';
const tokenImg = new Image(); tokenImg.src = 'Assets/images/token.png';

[teacherImg, pipeImg, bgImg, tokenImg].forEach(img => {
  img.addEventListener('error', () => console.error('Image failed to load:', img.src));
  img.addEventListener('load', () => console.log('Loaded:', img.src));
});

function tryPlay(audio) {
  if (!audio) return;
  audio.play().then(()=>{}).catch(err => {
    console.warn('play() blocked for', audio.src, err);
    try {
      audio.muted = true;
      audio.play().then(() => {
        const unmute = () => {
          audio.muted = false;
          window.removeEventListener('mousedown', unmute);
          window.removeEventListener('touchstart', unmute);
        };
        window.addEventListener('mousedown', unmute, { once: true });
        window.addEventListener('touchstart', unmute, { once: true });
      }).catch(e => console.error('fallback muted play failed', e));
    } catch(e) { }
  });
}

function resizeCanvas() {
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = Math.floor(LOGICAL_WIDTH * dpr);
  canvas.height = Math.floor(LOGICAL_HEIGHT * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function flap() {
  if (!started) return startGame();
  if (gameOver) return resetGame();

  bird.vy = FLAP_STRENGTH;
  try { flapSound.currentTime = 0; tryPlay(flapSound); } catch(e){}
}
window.addEventListener('keydown', e => { if (['Space','ArrowUp'].includes(e.code)) { e.preventDefault(); flap(); }});
window.addEventListener('mousedown', flap);
window.addEventListener('touchstart', e => { e.preventDefault(); flap(); }, { passive: false });

if (startScreen) {
  startScreen.addEventListener('mousedown', (e) => { e.preventDefault(); flap(); });
  startScreen.addEventListener('touchstart', (e) => { e.preventDefault(); flap(); }, { passive: false });
}

function startGame() {
  if (started) return;
  started = true;
  gameOver = false;
  running = true;
  if (startScreen) startScreen.classList.add('hide');
  bgMusic.currentTime = 0;
  tryPlay(bgMusic);
  resetGame(true);
  requestAnimationFrame(loop);
}

function resetGame(initial = false) {
  bird.y = LOGICAL_HEIGHT / 2;
  bird.vy = 0;
  pipes.length = 0;
  targets.length = 0;
  score = 0;
  tokens = 0;
  gameOver = false;
  gameOverAlpha = 0;
  pipeTimer = 0;
  targetTimer = 0;
  safeRestartTimer = 60;
  if (!initial) { bgMusic.currentTime = 0; tryPlay(bgMusic); }
  running = true;
  lastTime = performance.now();
  updateHUD();
}

function loop(ts) {
  if (!running) return;
  const dt = Math.min(32, ts - lastTime) / 1000;
  lastTime = ts;
  update(dt);
  updateHUD();
  draw();
  requestAnimationFrame(loop);
}

function getPipeSpeed() {
  const level = Math.floor(score / 50);
  return BASE_PIPE_SPEED + level * 0.15;
}
function getPipeGap() {
  const level = Math.floor(score / 50);
  return Math.max(BASE_PIPE_GAP - level * 10, 110);
}
function spawnTarget() {
  const r = 20;
  const y = Math.floor(Math.random() * (GROUND_Y - 160)) + 80;
  const x = LOGICAL_WIDTH + 20;
  const ang = Math.random() * Math.PI * 2;
  const angVel = (Math.random() * 0.05) + 0.01;
  targets.push({ x, y, r, angle: ang, angVel });
}

function update(dt) {
  if (gameOver) { gameOverAlpha = Math.min(1, gameOverAlpha + dt * 2); return; }
  if (safeRestartTimer > 0) safeRestartTimer--;

  if (safeRestartTimer <= 0) {
    bird.vy += GRAVITY;
    if (bird.vy > MAX_FALL_SPEED) bird.vy = MAX_FALL_SPEED;
    bird.y += bird.vy;
  }
  if (bird.y < bird.r) { bird.y = bird.r; bird.vy = 0; }

  const pipeSpeed = getPipeSpeed();
  const pipeGap = getPipeGap();

  pipeTimer += dt * 60;
  if (pipeTimer > 85) {
    pipeTimer = 0;
    const top = Math.floor(Math.random() * 150) + 50;
    pipes.push({ x: LOGICAL_WIDTH, top, gap: pipeGap, scored: false });
  }

  targetTimer += dt * 60;
  if (targetTimer > 140 + Math.random() * 80) { targetTimer = 0; spawnTarget(); }

  const pw = pipeImg.width * PIPE_SCALE;
  for (let i = pipes.length - 1; i >= 0; i--) {
    const p = pipes[i];
    p.x -= pipeSpeed;
    if (!p.scored && p.x + pw < BIRD_X) { p.scored = true; score++; bestScore = Math.max(bestScore, score); }
    if (p.x + pw < 0) pipes.splice(i, 1);
    if (safeRestartTimer <= 0) {
      const hitX = p.x + (1 - PIPE_HITBOX_SCALE) * pw / 2;
      const hitW = pw * PIPE_HITBOX_SCALE;
      if (bird.x + bird.r > hitX && bird.x - bird.r < hitX + hitW &&
          (bird.y - bird.r < p.top || bird.y + bird.r > p.top + p.gap)) triggerGameOver();
    }
  }

  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    t.x -= pipeSpeed;
    t.angle += t.angVel;

    const dx = bird.x - t.x;
    const dy = bird.y - t.y;
    const distSq = dx*dx + dy*dy;
    const minDist = bird.r + t.r;
    if (distSq <= minDist*minDist && safeRestartTimer <= 0) {
      tokens++;
      pulseTokensHUD();
      try { flapSound.currentTime = 0; tryPlay(flapSound); } catch(e){}
      targets.splice(i, 1);
      continue;
    }
    if (t.x + t.r < 0) targets.splice(i, 1);
  }

  if (safeRestartTimer <= 0 && bird.y + bird.r >= GROUND_Y) {
    bird.y = GROUND_Y - bird.r;
    triggerGameOver();
  }
}

function triggerGameOver() {
  if (!gameOver) {
    gameOver = true;
    bgMusic.pause();
    try { hitSound.currentTime = 0; tryPlay(hitSound); } catch(e){}
  }
}

function updateHUD() {
  const s = document.getElementById('score');
  const b = document.getElementById('best');
  const t = document.getElementById('tokens');
  if (s) s.textContent = score;
  if (b) b.textContent = bestScore;
  if (t) t.textContent = tokens;
}

function pulseTokensHUD() {
  if (!tokensEl) return;
  tokensEl.classList.add('tokens-pulse');
  setTimeout(() => tokensEl.classList.remove('tokens-pulse'), 420);
}

function drawText(txt, size, color, y, alpha = 1, glow = false) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `bold ${size}px 'Poppins', sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 10; }
  ctx.fillText(txt, LOGICAL_WIDTH/2, y);
  ctx.restore();
}

function drawTargetCoin(x, y, r, angle) {
  ctx.save();
  if (tokenImg.complete && tokenImg.width > 0) {
    const size = r * 2;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(tokenImg, -r, -r, size, size);
    ctx.restore();
  } else {
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

function draw() {
  if (bgImg.complete) ctx.drawImage(bgImg, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  else { ctx.fillStyle = '#6fc3f7'; ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT); }

  for (const p of pipes) {
    const ph = pipeImg.height * PIPE_SCALE;
    const pw = pipeImg.width * PIPE_SCALE;
    if (pipeImg.complete) ctx.drawImage(pipeImg, p.x, p.top + p.gap, pw, ph);
    ctx.save();
    ctx.translate(p.x, p.top);
    ctx.scale(1, -1);
    if (pipeImg.complete) ctx.drawImage(pipeImg, 0, 0, pw, ph);
    ctx.restore();
  }

  for (const t of targets) drawTargetCoin(t.x, t.y, t.r, t.angle);

  ctx.save();
  const tilt = Math.max(-0.6, Math.min(0.8, bird.vy / 8));
  ctx.translate(bird.x, bird.y);
  ctx.rotate(tilt);
  if (teacherImg.complete) ctx.drawImage(teacherImg, -17, -17, 35, 35);
  else {
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath(); ctx.arc(0, 0, bird.r, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = '#ded895';
  ctx.fillRect(0, GROUND_Y, LOGICAL_WIDTH, LOGICAL_HEIGHT - GROUND_Y);
  ctx.strokeStyle = '#b9a96b';
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(LOGICAL_WIDTH, GROUND_Y); ctx.stroke();

  if (gameOver) {
    const grad = ctx.createLinearGradient(0,0,0,LOGICAL_HEIGHT);
    grad.addColorStop(0, '#ff6347'); grad.addColorStop(1, '#ffcc00');
    ctx.save();
    ctx.fillStyle = grad; ctx.shadowColor = '#ff6347'; ctx.shadowBlur = 15;
    drawText('GAME OVER!', 30, '#ff3300', LOGICAL_HEIGHT/2 - 10, gameOverAlpha, true);
    drawText('Click or press Space to Restart', 15, '#000', LOGICAL_HEIGHT/2 + 25, gameOverAlpha);
    ctx.restore();
  }
}

window.addEventListener('load', () => {
  const splash = document.getElementById('splash-screen');
  const start = document.getElementById('start-screen');
  if (!splash) return;

  const animDurationMs = 1200;
  const animDelayMs = 250;
  const extraAfterAnimMs = 1000;
  const fadeDurationMs = 500;

  if (start) start.classList.add('hide');

  const totalWait = animDelayMs + animDurationMs + extraAfterAnimMs;

  setTimeout(() => {
    splash.style.transition = `opacity ${fadeDurationMs}ms ease`;
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.style.display = 'none';
      if (start) start.classList.remove('hide');
    }, fadeDurationMs + 20);
  }, totalWait);
});
