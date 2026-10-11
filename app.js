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

const state = reactive({ count: 0, digits: 4 });

const counterEl = document.getElementById("counter");

effect(() => {
  renderCounter(state.count, state.digits);
});

function renderCounter(value, width) {
  const digits = String(value).split("");
  const padCount = Math.max(0, width - digits.length);
  const tiles = [...Array(padCount).fill(null), ...digits];

  counterEl.replaceChildren(
    ...tiles.map((digit) => {
      const el = document.createElement("span");
      el.className = "digit";
      el.textContent = digit ?? "";
      return el;
    })
  );
}

document.getElementById("inc").addEventListener("click", () => {
  state.count += 1;
});

document.getElementById("dec").addEventListener("click", () => {
  state.count -= 1;
});

document.getElementById("reset").addEventListener("click", () => {
  state.count = 0;
});

document.getElementById("digits").addEventListener("change", (event) => {
  state.digits = Number(event.target.value);
});
