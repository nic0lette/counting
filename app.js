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

const state = reactive({ count: 0, digits: 4, negative: false });

const counterEl = document.getElementById("counter");

effect(() => {
  renderCounter(state.count, state.digits);
});

function renderCounter(value, width) {
  const negative = value < 0;
  const digits = String(Math.abs(value)).split("");
  const padCount = Math.max(0, width - digits.length);
  const slots = [...Array(padCount).fill(null), ...digits];

  const children = [];
  if (negative) children.push(createSign());

  slots.forEach((digit, index) => {
    const place = 10 ** (slots.length - 1 - index);
    children.push(createPlace(digit, place));
  });

  counterEl.replaceChildren(...children);
}

function createSign() {
  const el = document.createElement("span");
  el.className = "digit digit--sign";
  el.textContent = "−";
  return el;
}

function createPlace(digit, place) {
  const node = document.createElement("div");
  node.className = "place";
  node.dataset.place = String(place);

  node.append(
    createStep("up", place),
    createDigit(digit),
    createStep("down", place)
  );

  return node;
}

function createDigit(digit) {
  const el = document.createElement("span");
  el.className = "digit";
  el.textContent = digit ?? "";
  return el;
}

function createStep(dir, place) {
  const el = document.createElement("button");
  el.className = "step";
  el.type = "button";
  el.dataset.dir = dir;
  el.textContent = dir === "up" ? "+" : "−";
  el.setAttribute(
    "aria-label",
    `${dir === "up" ? "Add" : "Subtract"} ${place}`
  );
  return el;
}

function step(place, dir) {
  const delta = dir === "up" ? place : -place;
  let next = state.count + delta;
  if (!state.negative && next < 0) next = 0;
  state.count = next;
}

counterEl.addEventListener("click", (event) => {
  const button = event.target.closest(".step");
  if (!button) return;
  const place = Number(button.closest(".place").dataset.place);
  step(place, button.dataset.dir);
});

document.getElementById("reset").addEventListener("click", () => {
  state.count = 0;
});

document.getElementById("digits").addEventListener("change", (event) => {
  state.digits = Number(event.target.value);
});

document.getElementById("negative").addEventListener("change", (event) => {
  state.negative = event.target.checked;
  if (!state.negative && state.count < 0) state.count = 0;
});
