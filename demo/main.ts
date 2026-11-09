import { createSpider, type SpiderController } from '../src/index';
declare global {
  interface Window {
    __fluriSpider?: SpiderController;
  }
}
const get = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const hero = get<HTMLElement>('playground');
let spider: SpiderController,
  paused = false;
const size = get<HTMLInputElement>('spider-size'),
  webSize = get<HTMLInputElement>('web-size'),
  shy = get<HTMLInputElement>('shy');
function mount(): void {
  spider?.destroy();
  spider = createSpider({
    targets: '[data-spider-web]',
    spiders: 1,
    maxWebs: 3,
    size: Number(size.value),
    webSize: Number(webSize.value),
    speed: 1.3,
    fearRadius: shy.checked ? 120 : 0,
    webOpacity: 0.68,
    webDensity: 0.85,
    flies: get<HTMLInputElement>('flies').checked,
    zIndex: 50,
  });
  window.__fluriSpider = spider;
  if (paused) spider.pause();
}
mount();
size.addEventListener('input', () => {
  get('size-value').textContent = `${Number(size.value).toFixed(1)}×`;
  spider.update({ size: Number(size.value) });
});
webSize.addEventListener('input', () => {
  get('web-value').textContent = `${webSize.value}px`;
  spider.update({ webSize: Number(webSize.value) });
});
shy.addEventListener('change', () => spider.update({ fearRadius: shy.checked ? 120 : 0 }));
get('flies').addEventListener('change', () =>
  spider.update({ flies: get<HTMLInputElement>('flies').checked }),
);
get('send-fly').addEventListener('click', () => {
  if (paused || spider.getState().reducedMotion) {
    toast('Resume motion to invite a fly. Reduced-motion preferences stay respected.');
    return;
  }
  get<HTMLInputElement>('flies').checked = true;
  spider.update({ flies: true });
  spider.releaseFly();
  toast('A little visitor. Watch the spider hunt, catch, wrap and eat.');
});
get('clear-webs').addEventListener('click', () => spider.clearWebs());
document.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((button) =>
  button.addEventListener('click', () => {
    hero.classList.remove('ember', 'paper', 'dark');
    hero.classList.add(button.dataset.theme!);
    document
      .querySelectorAll('[data-theme]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    spider.refresh();
  }),
);
function setPause(value: boolean): void {
  paused = value;
  window.__fluriSpider = spider;
  if (paused) spider.pause();
  else spider.resume();
  get('pause').textContent = paused ? '▷ Resume resident' : 'Ⅱ Pause resident';
  get('pause').setAttribute('aria-pressed', String(paused));
}
get('pause').addEventListener('click', () => setPause(!paused));
get('reset').addEventListener('click', () => {
  size.value = '1.6';
  webSize.value = '160';
  shy.checked = true;
  get<HTMLInputElement>('flies').checked = true;
  get('size-value').textContent = '1.6×';
  get('web-value').textContent = '160px';
  hero.classList.remove('paper', 'dark');
  hero.classList.add('ember');
  document
    .querySelectorAll<HTMLButtonElement>('[data-theme]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === 'ember')));
  setPause(false);
  mount();
});
const behaviors: Record<string, string> = {
  descending: 'DESCENDING ON SILK',
  weaving: 'WEAVING A LITTLE HOME',
  exploring: 'EXPLORING THE PAGE',
  resting: 'TAKING A MOMENT',
  hiding: 'A LITTLE HIDE & SEEK',
  fleeing: 'A LITTLE TOO CLOSE',
  hunting: 'HUNTING A LITTLE VISITOR',
  eating: 'HAVING A LITTLE SNACK',
};
const statusTimer = setInterval(() => {
  const state = spider.getState();
  const fly = state.flies[0];
  get('fly-status').textContent = fly
    ? `Fly: ${fly.state} · ${state.fliesEaten} eaten`
    : `${state.fliesEaten} flies eaten · an occasional visitor`;
  const resident = state.spiders[0];
  if (!resident) return;
  const status = paused ? 'TAKING A LITTLE NAP' : (behaviors[resident.behavior] ?? 'AT HOME');
  if (get('activity').textContent !== status) get('activity').textContent = status;
  const count = String(resident.threads).padStart(3, '0');
  if (get('thread-count').textContent !== count) get('thread-count').textContent = count;
}, 500);
const examples = {
  vanilla: `import { createSpider } from '@fluritheme/spider';\n\n// Add data-spider-web to a card in your HTML.\n// <article data-spider-web="top-right">…</article>\nconst spider = createSpider({\n  targets: '[data-spider-web]',\n  size: 1,\n  fearRadius: 110,\n});\n\n// When your page unmounts:\nspider.destroy();`,
  react: `import { useEffect } from 'react';\nimport { createSpider } from '@fluritheme/spider';\n\nexport function Card() {\n  useEffect(() => {\n    const spider = createSpider();\n    return () => spider.destroy();\n  }, []);\n\n  return <article data-spider-web="top-right">\n    A little room for a little resident.\n  </article>;\n}`,
  vue: `<script setup>\nimport { onMounted, onUnmounted } from 'vue';\nimport { createSpider } from '@fluritheme/spider';\nlet spider;\nonMounted(() => { spider = createSpider(); });\nonUnmounted(() => spider?.destroy());\n</script>\n\n<template>\n  <article data-spider-web="top-right">\n    A little room for a little resident.\n  </article>\n</template>`,
};
let active: keyof typeof examples = 'vanilla';
get('code').textContent = examples[active];
const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-code]')];
function selectTab(button: HTMLButtonElement): void {
  active = button.dataset.code as keyof typeof examples;
  tabs.forEach((b) => {
    b.setAttribute('aria-selected', String(b === button));
    b.tabIndex = b === button ? 0 : -1;
  });
  get('code').textContent = examples[active];
  get('code-content').setAttribute('aria-labelledby', button.id);
}
tabs.forEach((button, index) => {
  button.addEventListener('click', () => selectTab(button));
  button.addEventListener('keydown', (event) => {
    let next: number | undefined;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      selectTab(tabs[next]!);
      tabs[next]!.focus();
    }
  });
});
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string): void {
  get('toast').textContent = message;
  get('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    get('toast').hidden = true;
  }, 3500);
}
async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    get('toast').textContent = 'Copied. Make room for a little friend.';
  } catch {
    get('toast').textContent = 'Clipboard unavailable. Select and copy the command or example.';
  }
  get('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    get('toast').hidden = true;
  }, 3000);
}
document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) =>
  button.addEventListener('click', () => {
    void copy(button.dataset.copy!);
  }),
);
get('copy-code').addEventListener('click', () => {
  void copy(examples[active]);
});
window.addEventListener('pagehide', () => {
  spider.destroy();
  delete window.__fluriSpider;
  clearInterval(statusTimer);
  clearTimeout(toastTimer);
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) mount();
});
