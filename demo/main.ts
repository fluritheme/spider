import { createSpider, type SpiderController } from '../src/index';
const get = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const stage = get<HTMLDivElement>('stage');
let spider: SpiderController;
let paused = false;
const size = get<HTMLInputElement>('spider-size'),
  webSize = get<HTMLInputElement>('web-size');
const shy = get<HTMLInputElement>('shy'),
  webs = get<HTMLInputElement>('webs');
function mount(): void {
  spider?.destroy();
  spider = createSpider({
    targets: '[data-spider-web]',
    spiders: 1,
    maxWebs: 3,
    size: Number(size.value),
    webSize: Number(webSize.value),
    fearRadius: shy.checked ? 120 : 0,
    webOpacity: webs.checked ? 0.48 : 0,
    weave: true,
    zIndex: 50,
  });
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
webs.addEventListener('change', () => spider.update({ webOpacity: webs.checked ? 0.48 : 0 }));
get('clear-webs').addEventListener('click', () => spider.clearWebs());
document.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((button) =>
  button.addEventListener('click', () => {
    stage.classList.toggle('dark', button.dataset.theme === 'dark');
    document
      .querySelectorAll('[data-theme]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    spider.refresh();
  }),
);
get('layer-button').addEventListener('click', () => {
  const flipped = stage.classList.toggle('flipped');
  get('layer-button').setAttribute('aria-pressed', String(flipped));
  get('activity').textContent = flipped
    ? 'The back card is now in front. Watch the silk.'
    : 'One curious resident. The whole page to explore.';
  spider.refresh();
});
function setPause(value: boolean): void {
  paused = value;
  if (paused) spider.pause();
  else spider.resume();
  get('pause').textContent = paused ? '▷ Wake the little resident' : 'Ⅱ Take a little nap';
  get('pause').setAttribute('aria-pressed', String(paused));
}
get('pause').addEventListener('click', () => setPause(!paused));
get('reset').addEventListener('click', () => {
  size.value = '1.2';
  webSize.value = '140';
  shy.checked = true;
  webs.checked = true;
  get('size-value').textContent = '1.2×';
  get('web-value').textContent = '140px';
  stage.classList.remove('dark', 'flipped');
  document
    .querySelectorAll<HTMLButtonElement>('[data-theme]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === 'light')));
  get('layer-button').setAttribute('aria-pressed', 'false');
  get('activity').textContent = 'One curious resident. The whole page to explore.';
  setPause(false);
  mount();
});
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
  clearTimeout(toastTimer);
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) mount();
});
