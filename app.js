let currentEffect = null;

function effect(fn) {
  currentEffect = fn;
  fn();
  currentEffect = null;
}

function reactive(target) {
  const deps = new Map();

  return new Proxy(target, {
    get(obj, prop) {
      if (!deps.has(prop)) deps.set(prop, new Set());
      if (currentEffect) deps.get(prop).add(currentEffect);
      return obj[prop];
    },
    set(obj, prop, value) {
      if (obj[prop] === value) return true;
      obj[prop] = value;
      deps.get(prop)?.forEach((fn) => fn());
      return true;
    },
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const T = { hold: 380, fly: 420, settle: 70, step: 150 };

const state = reactive({ count: 0, digits: 4, negative: false });

const counterEl = document.getElementById("counter");
const amountEl = document.getElementById("amount");
const setBtn = document.getElementById("set");
const addBtn = document.getElementById("add");
const subtractBtn = document.getElementById("subtract");

let isAnimating = false;
let runId = 0;
const queue = [];

effect(() => {
  const count = state.count;
  const width = state.digits;
  const negative = state.negative;
  if (isAnimating) return;
  renderResting(count, width, negative);
});

effect(() => {
  const isZero = state.count === 0;
  setBtn.hidden = !isZero;
  addBtn.hidden = isZero;
  subtractBtn.hidden = isZero;
});

function renderResting(count, width, negative) {
  const value = Math.abs(count);
  const length = Math.max(width, numDigits(value));
  const tiles = buildTiles(length, negative && count < 0);
  paint(toDigits(value, length), tiles);
}

function buildTiles(length, sign) {
  const nodes = [];
  if (sign) nodes.push(createSign());

  const tiles = [];
  for (let d = 0; d < length; d++) {
    const place = 10 ** (length - 1 - d);
    const node = createPlace(place);
    nodes.push(node);
    tiles.push({ node, digitEl: node.querySelector(".digit") });
  }

  counterEl.replaceChildren(...nodes);
  return tiles;
}

function paint(digits, tiles) {
  const length = tiles.length;
  const anyNonzero = digits.some((v) => v !== 0);
  let seen = false;

  for (let d = 0; d < length; d++) {
    const le = length - 1 - d;
    const value = digits[le];

    let text;
    if (!anyNonzero) {
      text = le === 0 ? 0 : "";
    } else if (value === 0 && !seen) {
      text = "";
    } else {
      text = value;
    }

    if (value !== 0) seen = true;
    renderValue(tiles[d].digitEl, text);
  }
}

function renderValue(el, value) {
  if (value === 10) {
    el.innerHTML = '<span class="fly-one">1</span><span class="digit-zero">0</span>';
  } else {
    el.textContent = value === "" ? "" : String(value);
  }
}

function setTile(tiles, le, value) {
  renderValue(tiles[tiles.length - 1 - le].digitEl, value);
}

function collapseLeading(tiles) {
  let seen = false;

  for (let d = 0; d < tiles.length; d++) {
    const el = tiles[d].digitEl;
    const text = el.textContent;
    if (text === "") continue;

    const value = Number(text);
    if (value !== 0) {
      seen = true;
    } else if (!seen && d !== tiles.length - 1) {
      el.textContent = "";
    }
  }
}

function numDigits(n) {
  return n === 0 ? 1 : Math.floor(Math.log10(n)) + 1;
}

function toDigits(n, length) {
  const digits = new Array(length).fill(0);
  for (let i = 0; i < length; i++) {
    digits[i] = n % 10;
    n = Math.floor(n / 10);
  }
  return digits;
}

function toValue(digits) {
  return digits.reduce((sum, v, i) => sum + v * 10 ** i, 0);
}

function placeToIndex(place) {
  return Math.round(Math.log10(place));
}

function planAdd(start, index) {
  const digits = start.slice();
  const events = [];

  digits[index] += 1;
  events.push({ type: "inc", index, value: digits[index] });

  let j = index;
  while (digits[j] >= 10) {
    if (j + 1 >= digits.length) digits.push(0);
    digits[j + 1] += 1;
    digits[j] -= 10;
    events.push({
      type: "carry",
      from: j,
      to: j + 1,
      toValue: digits[j + 1],
    });
    j += 1;
  }

  return { final: digits, events };
}

function planSub(start, index) {
  const digits = start.slice();
  const events = [];

  if (digits[index] > 0) {
    digits[index] -= 1;
    events.push({ type: "dec", index, value: digits[index] });
    return { final: digits, events };
  }

  let k = index + 1;
  while (k < digits.length && digits[k] === 0) k += 1;
  if (k >= digits.length) return { final: digits, events, noop: true };

  digits[k] -= 1;
  for (let j = k; j > index; j--) {
    const fromValue = digits[j];
    digits[j - 1] = 9;
    events.push({
      type: "borrow",
      from: j,
      to: j - 1,
      fromValue,
      toValue: 9,
    });
  }

  return { final: digits, events };
}

async function performStep({ place, dir }, myRun) {
  const start = state.count;
  const next = start + (dir === "up" ? place : -place);

  if (start < 0 || next < 0) {
    const value = next < 0 && !state.negative ? 0 : next;
    state.count = value;
    renderResting(value, state.digits, state.negative);
    return;
  }

  const width = state.digits;
  const length = Math.max(width, numDigits(Math.max(start, next)));
  const startDigits = toDigits(start, length);
  const index = placeToIndex(place);
  const plan = dir === "up" ? planAdd(startDigits, index) : planSub(startDigits, index);
  if (plan.noop) return;

  const tiles = buildTiles(length, false);
  paint(startDigits, tiles);

  await playEvents(plan.events, tiles, myRun);
  if (myRun !== runId) return;

  const value = toValue(plan.final);
  state.count = value;
  renderResting(value, width, state.negative);
}

async function playEvents(events, tiles, myRun) {
  for (const event of events) {
    if (myRun !== runId) return;

    if (event.type === "inc") {
      setTile(tiles, event.index, event.value);
      collapseLeading(tiles);
      if (event.value >= 10) await wait(T.hold);
    } else if (event.type === "dec") {
      setTile(tiles, event.index, event.value);
      collapseLeading(tiles);
    } else if (event.type === "carry") {
      const fromEl = tiles[tiles.length - 1 - event.from].digitEl;
      const toEl = tiles[tiles.length - 1 - event.to].digitEl;
      const flyer = fromEl.querySelector(".fly-one");
      const toEmpty = toEl.textContent === "";
      if (flyer) await flySpan(flyer, toEl, !toEmpty);
      if (myRun !== runId) return;
      flyer?.remove();
      renderValue(fromEl, 0);
      renderValue(toEl, event.toValue);
      collapseLeading(tiles);
      await wait(T.settle);
    } else if (event.type === "borrow") {
      await flyChip(tiles, event.from, event.to, 0.5);
      if (myRun !== runId) return;
      setTile(tiles, event.from, event.fromValue);
      setTile(tiles, event.to, event.toValue);
      collapseLeading(tiles);
      await wait(T.settle);
    }
  }
}

async function flyChip(tiles, fromLE, toLE, startFraction) {
  const fromEl = tiles[tiles.length - 1 - fromLE].digitEl;
  const toEl = tiles[tiles.length - 1 - toLE].digitEl;

  const base = counterEl.getBoundingClientRect();
  const from = fromEl.getBoundingClientRect();
  const to = toEl.getBoundingClientRect();

  const startX = from.left - base.left + from.width * startFraction;
  const startY = from.top - base.top + from.height / 2;
  const dx = to.left - base.left + to.width / 2 - startX;
  const dy = to.top - base.top + to.height / 2 - startY;
  const lift = from.height * 0.6;

  const chip = document.createElement("span");
  chip.className = "carry-chip";
  chip.textContent = "1";
  chip.style.left = `${startX}px`;
  chip.style.top = `${startY}px`;
  counterEl.appendChild(chip);

  const animation = chip.animate(
    [
      { offset: 0, transform: "translate(-50%, -50%) translate(0, 0)", opacity: 1 },
      { offset: 0.25, opacity: 1 },
      {
        offset: 0.5,
        transform: `translate(-50%, -50%) translate(${dx * 0.5}px, ${dy * 0.5 - lift}px)`,
      },
      { offset: 0.9, opacity: 0 },
      {
        offset: 1,
        transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(0.85)`,
        opacity: 0,
      },
    ],
    { duration: T.fly, easing: "linear", fill: "forwards" }
  );

  await animation.finished;
  chip.remove();
}

async function flySpan(el, toEl, fade) {
  const from = el.getBoundingClientRect();
  const to = toEl.getBoundingClientRect();
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const lift = from.height * 0.6;

  const keyframes = fade
    ? [
        { offset: 0, transform: "translate(0, 0)", opacity: 1 },
        { offset: 0.25, opacity: 1 },
        {
          offset: 0.5,
          transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px)`,
        },
        { offset: 0.9, opacity: 0 },
        { offset: 1, transform: `translate(${dx}px, ${dy}px) scale(0.85)`, opacity: 0 },
      ]
    : [
        { offset: 0, transform: "translate(0, 0)", opacity: 1 },
        {
          offset: 0.5,
          transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px)`,
          opacity: 1,
        },
        { offset: 1, transform: `translate(${dx}px, ${dy}px)`, opacity: 1 },
      ];

  const animation = el.animate(keyframes, {
    duration: T.fly,
    easing: "linear",
    fill: "forwards",
  });

  await animation.finished;
}

function processQueue() {
  if (isAnimating) return;
  const job = queue.shift();
  if (!job) return;

  isAnimating = true;
  const myRun = runId;
  performStep(job, myRun).then(async () => {
    if (myRun !== runId) return;
    if (job.hold) await wait(job.hold);
    if (myRun !== runId) return;
    isAnimating = false;
    processQueue();
  });
}

function createSign() {
  const el = document.createElement("span");
  el.className = "digit digit--sign";
  el.textContent = "−";
  return el;
}

function createPlace(place) {
  const node = document.createElement("div");
  node.className = "place";
  node.dataset.place = String(place);

  node.append(createStep("up", place), createDigit(), createStep("down", place));

  return node;
}

function createDigit() {
  const el = document.createElement("span");
  el.className = "digit";
  return el;
}

function createStep(dir, place) {
  const el = document.createElement("button");
  el.className = "step";
  el.type = "button";
  el.dataset.dir = dir;
  el.textContent = dir === "up" ? "+" : "−";
  el.setAttribute("aria-label", `${dir === "up" ? "Add" : "Subtract"} ${place}`);
  return el;
}

counterEl.addEventListener("click", (event) => {
  const button = event.target.closest(".step");
  if (!button) return;
  const place = Number(button.closest(".place").dataset.place);
  queue.push({ place, dir: button.dataset.dir });
  processQueue();
});

function cancelAnimation() {
  queue.length = 0;
  runId += 1;
  isAnimating = false;
}

document.getElementById("reset").addEventListener("click", () => {
  cancelAnimation();
  state.count = 0;
  renderResting(0, state.digits, state.negative);
});

function clampAmount() {
  amountEl.maxLength = state.digits;
  const digits = amountEl.value.replace(/\D/g, "").slice(0, state.digits);
  if (digits !== amountEl.value) amountEl.value = digits;
}

function amountValue() {
  return Number(amountEl.value || 0);
}

function enqueueDelta(delta) {
  if (!delta) return;
  const dir = delta > 0 ? "up" : "down";
  let remaining = Math.abs(delta);

  const places = [];
  for (let place = 1; place <= remaining; place *= 10) places.push(place);

  for (const place of places) {
    const times = Math.floor(remaining / place) % 10;
    for (let k = 0; k < times; k++) queue.push({ place, dir, hold: T.step });
  }

  processQueue();
}

amountEl.addEventListener("input", clampAmount);

setBtn.addEventListener("click", () => {
  enqueueDelta(amountValue());
});

addBtn.addEventListener("click", () => {
  enqueueDelta(amountValue());
});

subtractBtn.addEventListener("click", () => {
  enqueueDelta(-amountValue());
});

document.getElementById("digits").addEventListener("change", (event) => {
  cancelAnimation();
  state.digits = Number(event.target.value);
  clampAmount();
  renderResting(state.count, state.digits, state.negative);
});

document.getElementById("negative").addEventListener("change", (event) => {
  cancelAnimation();
  state.negative = event.target.checked;
  if (!state.negative && state.count < 0) state.count = 0;
  renderResting(state.count, state.digits, state.negative);
});
