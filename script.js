// ===== Canvas =====
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");

ctx.imageSmoothingEnabled = false;
nextCtx.imageSmoothingEnabled = false;

const scoreEl = document.getElementById("score");
const linesEl = document.getElementById("lines");

// ===== Board =====
const COLS = 10;
const ROWS = 20;
const BLOCK = 56;

// ===== Image (character.png) =====
const img = new Image();
let imgReady = false;
img.onload = () => (imgReady = true);
img.onerror = () => console.log("画像が読み込めません:", img.src);
img.src = "character.png";

// ===== Tetrominoes =====
const TETROS = {
  I: { id: 1, m: [[1,1,1,1]] },
  O: { id: 2, m: [[1,1],[1,1]] },
  T: { id: 3, m: [[0,1,0],[1,1,1]] },
  S: { id: 4, m: [[0,1,1],[1,1,0]] },
  Z: { id: 5, m: [[1,1,0],[0,1,1]] },
  J: { id: 6, m: [[1,0,0],[1,1,1]] },
  L: { id: 7, m: [[0,0,1],[1,1,1]] },
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
function randomTetro(){
  const k = TETRO_KEYS[randInt(0, TETRO_KEYS.length-1)];
  const t = TETROS[k];
  return { key:k, id:t.id, m: cloneMatrix(t.m) };
}

// ===== State =====
const board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

let current = null;
let next = randomTetro();

let running = true;
let score = 0;
let lines = 0;

let lastTime = 0;
let dropCounter = 0;
let dropInterval = 600;

// ===== Core =====
function spawn(){
  current = next;
  next = randomTetro();

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
      if (board[ny][nx]) return true;
    }
  }
  return false;
}

function mergePiece(){
  const m = current.m;
  for (let y=0; y<m.length; y++){
    for (let x=0; x<m[0].length; x++){
      if (!m[y][x]) continue;
      const bx = current.x + x;
      const by = current.y + y;
      if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS){
        board[by][bx] = current.id;
      }
    }
  }
}

function clearLines(){
  let cleared = 0;
  for (let y=ROWS-1; y>=0; y--){
    if (board[y].every(v => v !== 0)){
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(0));
      cleared++;
      y++;
    }
  }

  if (cleared){
    lines += cleared;
    const add =
      cleared === 1 ? 100 :
      cleared === 2 ? 300 :
      cleared === 3 ? 500 :
      800;
    score += add;

    scoreEl.textContent = String(score);
    linesEl.textContent = String(lines);

    dropInterval = Math.max(80, 600 - Math.floor(lines/5)*40);
  }
}

function lockAndNext(){
  mergePiece();
  clearLines();
  spawn();
}

// ===== Draw =====
function clearCanvas(){
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawCell(gx, gy){
  const px = gx * BLOCK;
  const py = gy * BLOCK;

  if (imgReady){
    ctx.drawImage(img, px, py, BLOCK, BLOCK);
  } else {
    ctx.fillStyle = "#ff3b3b";
    ctx.fillRect(px, py, BLOCK, BLOCK);
  }
}

function drawBoard(){
  for (let y=0; y<ROWS; y++){
    for (let x=0; x<COLS; x++){
      if (board[y][x]) drawCell(x, y);
    }
  }
}

function drawPiece(piece, useCtx = ctx, ox = 0, oy = 0, cell = BLOCK){
  const m = piece.m;
  for (let y=0; y<m.length; y++){
    for (let x=0; x<m[0].length; x++){
      if (!m[y][x]) continue;

      if (useCtx === ctx){
        const gx = piece.x + x;
        const gy = piece.y + y;
        if (gy >= 0) drawCell(gx, gy);
      } else {
        const px = ox + x * cell;
        const py = oy + y * cell;
        if (imgReady) useCtx.drawImage(img, px, py, cell, cell);
        else {
          useCtx.fillStyle = "#ff3b3b";
          useCtx.fillRect(px, py, cell, cell);
        }
      }
    }
  }
}

function drawNext(){
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const cell = 56;
  const w = next.m[0].length * cell;
  const h = next.m.length * cell;
  const ox = Math.floor((nextCanvas.width - w)/2);
  const oy = Math.floor((nextCanvas.height - h)/2);
  const tmp = { ...next, x:0, y:0 };
  drawPiece(tmp, nextCtx, ox, oy, cell);
}

function render(){
  clearCanvas();
  drawBoard();
  drawPiece(current);
  drawNext();
}

// ===== Actions (PC/Touch共通で呼ぶ) =====
function moveLeft(){
  if (!running) return;
  if (!collides(current, -1, 0)) current.x -= 1;
}
function moveRight(){
  if (!running) return;
  if (!collides(current, 1, 0)) current.x += 1;
}
function rotate(){
  if (!running) return;
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
  if (!running) return;
  if (!collides(current, 0, 1)){
    current.y += 1;
    score += 1;
    scoreEl.textContent = String(score);
  } else {
    lockAndNext();
  }
}
function hardDrop(){
  if (!running) return;
  let dropped = 0;
  while (!collides(current, 0, 1)){
    current.y += 1;
    dropped++;
  }
  score += dropped * 2;
  scoreEl.textContent = String(score);
  lockAndNext();
}

// ===== Keyboard (スクロール抑止込み) =====
document.addEventListener("keydown", (e) => {
  const blockKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "];
  if (blockKeys.includes(e.key)) e.preventDefault();

  if (e.key === "r" || e.key === "R"){
    resetGame();
    return;
  }
  if (!running) return;

  if (e.key === "ArrowLeft") moveLeft();
  if (e.key === "ArrowRight") moveRight();
  if (e.key === "ArrowUp") rotate();
  if (e.key === "ArrowDown") softDrop();
  if (e.code === "Space") hardDrop();
}, { passive: false });

// ===== Touch Buttons (タップ/長押し) =====
function bindHold(buttonId, onStep, intervalMs = 70){
  const el = document.getElementById(buttonId);
  if (!el) return;

  let timer = null;

  const start = (ev) => {
    ev.preventDefault();
    onStep(); // 押した瞬間に1回
    timer = setInterval(onStep, intervalMs); // 長押しで連続
  };

  const end = (ev) => {
    if (ev) ev.preventDefault();
    if (timer){
      clearInterval(timer);
      timer = null;
    }
  };

  // Pointer events で統一（スマホ/PC両対応）
  el.addEventListener("pointerdown", start, { passive: false });
  el.addEventListener("pointerup", end, { passive: false });
  el.addEventListener("pointercancel", end, { passive: false });
  el.addEventListener("pointerleave", end, { passive: false });
}

bindHold("btnLeft", moveLeft, 80);
bindHold("btnRight", moveRight, 80);
bindHold("btnDown", softDrop, 60);

// 回転とDROPは連打不要なので単発
const btnRot = document.getElementById("btnRot");
if (btnRot){
  btnRot.addEventListener("pointerdown", (e) => { e.preventDefault(); rotate(); }, { passive:false });
}
const btnDrop = document.getElementById("btnDrop");
if (btnDrop){
  btnDrop.addEventListener("pointerdown", (e) => { e.preventDefault(); hardDrop(); }, { passive:false });
}

// ===== Loop =====
function update(time = 0){
  const dt = time - lastTime;
  lastTime = time;

  if (running){
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

  render();
  requestAnimationFrame(update);
}

function gameOver(){
  running = false;
  console.log("GAME OVER");
}

function resetGame(){
  for (let y=0; y<ROWS; y++) board[y].fill(0);
  score = 0;
  lines = 0;
  scoreEl.textContent = "0";
  linesEl.textContent = "0";
  dropInterval = 600;
  dropCounter = 0;
  running = true;
  next = randomTetro();
  spawn();
}

// ===== Start =====
resetGame();
requestAnimationFrame(update);
