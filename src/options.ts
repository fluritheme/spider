import type { SpiderOptions } from './types.js';
export const defaults = {
  maxWebs: 6,
  spiders: 1,
  webSize: 112,
  size: 1,
  speed: 1,
  fearRadius: 110,
  color: 'auto',
  webOpacity: 0.4,
  zIndex: 100,
  motion: 'system',
  weave: true,
  observe: true,
  roam: true,
  entrance: 'silk',
  webDensity: 0.7,
  territory: 'page',
  objects:
    '[data-spider-object], [data-spider-web], article, aside, button, input, select, textarea, img, video, pre, .code-panel',
} as const;
export type Options = Omit<Required<SpiderOptions>, 'root' | 'targets'>;
export function resolveOptions(input: SpiderOptions): Options {
  const result = { ...defaults, ...input };
  const bounds = {
    maxWebs: [1, 24],
    spiders: [1, 8],
    webSize: [40, 240],
    size: [0.5, 2],
    speed: [0.25, 3],
    fearRadius: [0, 300],
    webOpacity: [0, 1],
    webDensity: [0, 1],
    zIndex: [-2147483648, 2147483647],
  } as const;
  for (const key of Object.keys(bounds) as (keyof typeof bounds)[]) {
    const value = result[key],
      [min, max] = bounds[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
      throw new RangeError(`Spider: ${key} must be between ${min} and ${max}.`);
  }
  for (const key of ['maxWebs', 'spiders', 'zIndex'] as const)
    if (!Number.isInteger(result[key])) throw new TypeError(`Spider: ${key} must be an integer.`);
  if (!['system', 'full', 'none'].includes(result.motion))
    throw new TypeError('Spider: invalid motion setting.');
  if (typeof result.color !== 'string' || !result.color.trim())
    throw new TypeError('Spider: color must be a CSS color or auto.');
  if (!['silk', 'appear'].includes(result.entrance))
    throw new TypeError('Spider: invalid entrance.');
  if (!['page', 'root'].includes(result.territory))
    throw new TypeError('Spider: invalid territory.');
  if (typeof result.objects !== 'string')
    throw new TypeError('Spider: objects must be a selector.');
  for (const key of ['weave', 'observe', 'roam'] as const)
    if (typeof result[key] !== 'boolean') throw new TypeError(`Spider: ${key} must be a boolean.`);
  return result;
}
