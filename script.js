// ===== Canvas =====
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");

ctx.imageSmoothingEnabled = false;
nextCtx.imageSmoothingEnabled = false;

// HUD（スマホ）
const scoreEl = document.getElementById("score");
const linesEl = document.getElementById("lines");

// PCパネル（存在する場合だけ同期）
const pcNext = document.querySelector(".pcNext");
const pcNextCtx = pcNext ? pcNext.getContext("2d") : null;
if (pcNextCtx) pcNextCtx.imageSmoothingEnabled = false;

const pcScoreEl = document.querySelector('[data-bind="score"]');
const pcLinesEl = document.querySelector('[data-bind="lines"]');

// ===== Board =====
const COLS = 10;
const ROWS = 20;
const BLOCK = 56;

// ===== Multi Images =====
const SPRITE_FILES = [
  "character1.png",
  "character2.png",
  "character3.png",
  "character4.png",
];

const sprites = SPRITE_FILES.map(() => new Image());
const spritesReady = Array(SPRITE_FILES.length).fill(false);

SPRITE_FILES.forEach((src, i) => {
  sprites[i].onload = () => { spritesReady[i] = true; };
  sprites[i].onerror = () => console.log("画像が読み込めません:", src);
  sprites[i].src = src;
});

// ===== Tetrominoes =====
const TETROS = {
  I: { m: [[1,1,1,1]] },
  O: { m: [[1,1],[1,1]] },
  T: { m: [[0,1,0],[1,1,1]] },
  S: { m: [[0,1,1],[1,1,0]] },
  Z: { m: [[1,1,0],[0,1,1]] },
  J: { m: [[1,0,0],[1,1,1]] },
  L: { m: [[0,0,1],[1,1,1]] },
};
const TETRO_KEYS = Object.keys(TETROS);

function cloneMatrix(m){ return m.map(r => r.slice()); }

function rotateCW(m){
  const h = m.length;
  const w = m[0].length;
  const out = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y=0; y<h; y++){
    for (let x=0; x<w; x++){
      out[x][h - 1 - y] = m[y][x];
    }
  }
  return out;
}

// ===== RNG =====
function randInt(min, max){
  return Math.floor(Math.random()*(max-min+1)) + min;
}
function randomSpriteIndex(){
  return randInt(0, SPRITE_FILES.length - 1);
}
function randomPiece(){
  const k = TETRO_KEYS[randInt(0, TETRO_KEYS.length-1)];
  const t = TETROS[k];
  return {
    key: k,
    m: cloneMatrix(t.m),
    sprite: randomSpriteIndex(), // ← 毎回ランダム画像
    x: 0,
    y: 0,
  };
}

// ===== State =====
// boardは「0=空」, 「1..N=画像index+1」を保存（盤面に残ったブロックも画像が固定）
const board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

let current = null;
let next = randomPiece();

// 状態: "play" | "pause" | "over"
let state = "play";

let score = 0;
let lines = 0;

let lastTime = 0;
let dropCounter = 0;
let dropInterval = 600;

// ===== Speed (lines + score) =====
function updateSpeed(){
  const level = Math.max(Math.floor(lines/5), Math.floor(score/500)); // ← 500点ごとに加速
  dropInterval = Math.max(80, 600 - level*40);
}

function setScoreLines(){
  scoreEl.textContent = String(score);
  linesEl.textContent = String(lines);
  if (pcScoreEl) pcScoreEl.textContent = String(score);
  if (pcLinesEl) pcLinesEl.textContent = String(lines);
  updateSpeed();
}

// ===== Line Clear Animation =====
let clearing = false;
let clearingRows = [];
let clearTimer = 0;
const CLEAR_DURATION = 220; // ms
let pendingSpawnAfterClear = false;
let pendingAddLines = 0;
let pendingAddScore = 0;

// GAME OVERエフェクト
let overAt = 0;
let particles = [];

// ===== Core =====
function spawn(){
  current = next;
  next = randomPiece();

  current.x = Math.floor((COLS - current.m[0].length)/2);
  current.y = 0;

  if (collides(current, 0, 0, current.m)){
    gameOver();
  }
}

function collides(piece, dx, dy, matrix){
  const m = matrix || piece.m;
  for (let y=0; y<m.length; y++){
    for (let x=0; x<m[0].length; x++){
      if (!m[y][x]) continue;

      const nx = piece.x + x + dx;
      const ny = piece.y + y + dy;

      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny < 0) continue;
      if (board[ny][nx]) return true; // 0以外は埋まってる
    }
  }
  return false;
}

function mergePiece(){
  const m = current.m;
  const v = current.sprite + 1; // boardに入れる値
  for (let y=0; y<m.length; y++){
    for (let x=0; x<m[0].length; x++){
      if (!m[y][x]) continue;
      const bx = current.x + x;
      const by = current.y + y;
      if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS){
        board[by][bx] = v;
      }
    }
  }
}

function calcScoreForClears(cleared){
  return (
    cleared === 1 ? 100 :
    cleared === 2 ? 300 :
    cleared === 3 ? 500 :
    800
  );
}

// 満タン行を探して「アニメ開始」する（実削除は後で）
function startClearAnimation(fullRows){
  clearing = true;
  clearingRows = fullRows.slice();
  clearTimer = CLEAR_DURATION;

  const cleared = clearingRows.length;
  pendingAddLines = cleared;
  pendingAddScore = calcScoreForClears(cleared);

  pendingSpawnAfterClear = true;
}

// アニメ終了時に行を削除＆スコア反映
function finalizeClear(){
  // 下から順に消す（indexズレ防止で降順）
  clearingRows.sort((a,b)=>b-a);
  for (const y of clearingRows){
    board.splice(y, 1);
    board.unshift(Array(COLS).fill(0));
  }

  lines += pendingAddLines;
  score += pendingAddScore;

  // 後始末
  clearing = false;
  clearingRows = [];
  pendingAddLines = 0;
  pendingAddScore = 0;

  setScoreLines();

  if (pendingSpawnAfterClear){
    pendingSpawnAfterClear = false;
    spawn();
  }
}

// ライン検出（見つかったら true）
function detectFullRows(){
  const full = [];
  for (let y=ROWS-1; y>=0; y--){
    if (board[y].every(v => v !== 0)) full.push(y);
  }
  return full;
}

function lockAndNext(){
  mergePiece();

  const full = detectFullRows();
  if (full.length){
    startClearAnimation(full);
  } else {
    spawn();
  }
}

// ===== Draw =====
function clearCanvas(){
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawCell(gx, gy, spriteIndex){
  const px = gx * BLOCK;
  const py = gy * BLOCK;

  const si = spriteIndex;
  const img = sprites[si];

  if (spritesReady[si]){
    ctx.drawImage(img, px, py, BLOCK, BLOCK);
  } else {
    ctx.fillStyle = "#ff3b3b";
    ctx.fillRect(px, py, BLOCK, BLOCK);
  }
}

function drawBoard(){
  for (let y=0; y<ROWS; y++){
    for (let x=0; x<COLS; x++){
      const v = board[y][x];
      if (!v) continue;
      const si = v - 1;
      drawCell(x, y, si);
    }
  }
}

function drawPiece(piece){
  const m = piece.m;
  for (let y=0; y<m.length; y++){
    for (let x=0; x<m[0].length; x++){
      if (!m[y][x]) continue;
      const gx = piece.x + x;
      const gy = piece.y + y;
      if (gy >= 0) drawCell(gx, gy, piece.sprite);
    }
  }
}

function drawMiniNext(useCtx){
  useCtx.clearRect(0, 0, 224, 224);

  const cell = 56;
  const w = next.m[0].length * cell;
  const h = next.m.length * cell;
  const ox = Math.floor((224 - w)/2);
  const oy = Math.floor((224 - h)/2);

  const si = next.sprite;
  const img = sprites[si];

  for (let y=0; y<next.m.length; y++){
    for (let x=0; x<next.m[0].length; x++){
      if (!next.m[y][x]) continue;
      const px = ox + x * cell;
      const py = oy + y * cell;

      if (spritesReady[si]){
        useCtx.drawImage(img, px, py, cell, cell);
      } else {
        useCtx.fillStyle = "#ff3b3b";
        useCtx.fillRect(px, py, cell, cell);
      }
    }
  }
}

function drawOverlay(text, sub){
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 86px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width/2, canvas.height/2 - 40);

  if (sub){
    ctx.font = "bold 32px sans-serif";
    ctx.fillText(sub, canvas.width/2, canvas.height/2 + 50);
  }
  ctx.restore();
}

// ライン消去のフラッシュ（アニメ中のみ）
function drawClearFlash(){
  if (!clearing || !clearingRows.length) return;

  const phase = 1 - (clearTimer / CLEAR_DURATION); // 0->1
  const blink = Math.sin(phase * Math.PI * 6);     // ちらつき
  const alpha = 0.20 + Math.max(0, blink) * 0.55;  // 0.20..0.75

  ctx.save();
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  for (const y of clearingRows){
    ctx.fillRect(0, y * BLOCK, COLS * BLOCK, BLOCK);
  }
  ctx.restore();
}

// ===== GAME OVER Effect =====
function spawnParticles(){
  particles = [];
  const n = 90;
  for (let i=0; i<n; i++){
    particles.push({
      x: randInt(0, canvas.width),
      y: randInt(0, canvas.height),
      vx: (Math.random()-0.5) * 9,
      vy: (Math.random()-0.5) * 9,
      life: randInt(25, 60)
    });
  }
}
function updateParticles(){
  for (const p of particles){
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.life -= 1;
  }
  particles = particles.filter(p => p.life > 0);
}
function drawParticles(){
  if (!particles.length) return;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (const p of particles){
    ctx.fillRect(p.x, p.y, 6, 6);
  }
  ctx.restore();
}

function render(){
  clearCanvas();
  drawBoard();
  if (current) drawPiece(current);

  // ライン消去フラッシュ
  drawClearFlash();

  drawMiniNext(nextCtx);
  if (pcNextCtx) drawMiniNext(pcNextCtx);

  if (state === "pause"){
    drawOverlay("PAUSED", "P / PAUSEで再開");
  }
  if (state === "over"){
    const t = performance.now() - overAt;
    if (t < 200){
      ctx.save();
      ctx.fillStyle = `rgba(255,255,255,${(200 - t)/200 * 0.45})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    updateParticles();
    drawParticles();
    drawOverlay(`SCORE ${score}`, "GAME OVER / Rでリスタート");
  }
}

// ===== Actions =====
function moveLeft(){
  if (state !== "play") return;
  if (clearing) return;
  if (!collides(current, -1, 0)) current.x -= 1;
}
function moveRight(){
  if (state !== "play") return;
  if (clearing) return;
  if (!collides(current, 1, 0)) current.x += 1;
}
function rotate(){
  if (state !== "play") return;
  if (clearing) return;
  const rotated = rotateCW(current.m);
  const kicks = [0, -1, 1, -2, 2];
  for (const k of kicks){
    if (!collides(current, k, 0, rotated)){
      current.m = rotated;
      current.x += k;
      return;
    }
  }
}
function softDrop(){
  if (state !== "play") return;
  if (clearing) return;
  if (!collides(current, 0, 1)){
    current.y += 1;
    score += 1;
    setScoreLines();
  } else {
    lockAndNext();
  }
}
function hardDrop(){
  if (state !== "play") return;
  if (clearing) return;
  let dropped = 0;
  while (!collides(current, 0, 1)){
    current.y += 1;
    dropped++;
  }
  score += dropped * 2;
  setScoreLines();
  lockAndNext();
}
function togglePause(){
  if (state === "over") return;
  state = (state === "play") ? "pause" : "play";
  const btnPause = document.getElementById("btnPause");
  if (btnPause) btnPause.textContent = (state === "play") ? "PAUSE" : "RESUME";
}
function gameOver(){
  state = "over";
  overAt = performance.now();
  spawnParticles();
}

// ===== Keyboard =====
document.addEventListener("keydown", (e) => {
  const blockKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "];
  if (blockKeys.includes(e.key)) e.preventDefault();

  if (e.key === "p" || e.key === "P"){ togglePause(); return; }
  if (e.key === "r" || e.key === "R"){ resetGame(); return; }

  if (e.key === "ArrowLeft") moveLeft();
  if (e.key === "ArrowRight") moveRight();
  if (e.key === "ArrowUp") rotate();
  if (e.key === "ArrowDown") softDrop();
  if (e.code === "Space") hardDrop();
}, { passive:false });

// ===== Touch Buttons =====
function bindHold(buttonId, onStep, intervalMs = 70){
  const el = document.getElementById(buttonId);
  if (!el) return;

  let timer = null;

  const start = (ev) => {
    ev.preventDefault();
    onStep();
    timer = setInterval(onStep, intervalMs);
  };

  const end = (ev) => {
    if (ev) ev.preventDefault();
    if (timer){
      clearInterval(timer);
      timer = null;
    }
  };

  el.addEventListener("pointerdown", start, { passive:false });
  el.addEventListener("pointerup", end, { passive:false });
  el.addEventListener("pointercancel", end, { passive:false });
  el.addEventListener("pointerleave", end, { passive:false });
}

bindHold("btnLeft", moveLeft, 80);
bindHold("btnRight", moveRight, 80);
bindHold("btnDown", softDrop, 60);

const btnRot = document.getElementById("btnRot");
if (btnRot){
  btnRot.addEventListener("pointerdown", (e) => { e.preventDefault(); rotate(); }, { passive:false });
}
const btnDrop = document.getElementById("btnDrop");
if (btnDrop){
  btnDrop.addEventListener("pointerdown", (e) => { e.preventDefault(); hardDrop(); }, { passive:false });
}
const btnPause = document.getElementById("btnPause");
if (btnPause){
  btnPause.addEventListener("pointerdown", (e) => { e.preventDefault(); togglePause(); }, { passive:false });
}

// ===== Loop =====
function update(time = 0){
  const dt = time - lastTime;
  lastTime = time;

  if (state === "play"){
    if (clearing){
      clearTimer -= dt;
      if (clearTimer <= 0){
        finalizeClear();
      }
    } else {
      dropCounter += dt;
      if (dropCounter > dropInterval){
        dropCounter = 0;
        if (!collides(current, 0, 1)){
          current.y += 1;
        } else {
          lockAndNext();
        }
      }
    }
  }

  render();
  requestAnimationFrame(update);
}

function resetGame(){
  for (let y=0; y<ROWS; y++) board[y].fill(0);

  score = 0;
  lines = 0;
  setScoreLines();

  dropInterval = 600;
  dropCounter = 0;
  state = "play";

  // clear anim reset
  clearing = false;
  clearingRows = [];
  clearTimer = 0;
  pendingSpawnAfterClear = false;
  pendingAddLines = 0;
  pendingAddScore = 0;

  const btnPause = document.getElementById("btnPause");
  if (btnPause) btnPause.textContent = "PAUSE";

  next = randomPiece();
  spawn();
}

// ===== Start =====
resetGame();
requestAnimationFrame(update);

