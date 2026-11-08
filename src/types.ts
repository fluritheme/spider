export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export interface SpiderOptions {
  /** Defaults to document. Must be the current document or one of its elements. */
  root?: Document | HTMLElement;
  /** Explicit targets; otherwise uses [data-spider-web], then a small set of semantic elements. */
  targets?: string | readonly HTMLElement[];
  /** Maximum webs, including offscreen targets. 1–24; default 6. */
  maxWebs?: number;
  /** Maximum animated residents. 1–8; default 1. */
  spiders?: number;
  /** Web span in CSS pixels; responsive size is capped by each target. 40–240; default 112. */
  webSize?: number;
  /** Arrive from above on silk, or appear immediately. Default 'silk'. */
  entrance?: 'silk' | 'appear';
  /** Cross-thread density, 0–1. Default 0.7. */
  webDensity?: number;
  /** Explore the document, weave nets, and hide behind real elements. Default true. */
  roam?: boolean;
  /** Roaming area: whole document (default) or the supplied root's visible rectangle. */
  territory?: 'page' | 'root';
  /** CSS selector for objects the spider can shelter behind. */
  objects?: string;
  /** Spider scale. 0.5–2; default 1. */
  size?: number;
  /** Movement speed. 0.25–3; default 1. */
  speed?: number;
  /** Pointer fear radius in CSS pixels. 0 disables fear. 0–300; default 110. */
  fearRadius?: number;
  /** 'auto' adapts corner silk and keeps the spider's sable palette stable. */
  color?: string;
  /** Web opacity, 0–1; default 0.4. */
  webOpacity?: number;
  /** Global overlay stacking level. Default 100. Native top-layer dialogs remain above it. */
  zIndex?: number;
  /** 'system' stops animation and reactions when reduced motion is requested; default 'system'. */
  motion?: 'system' | 'full' | 'none';
  /** Animate each web being woven. Default true. */
  weave?: boolean;
  /** Automatically observe DOM changes and periodically refresh moving targets. Default true. */
  observe?: boolean;
}
export interface SpiderSnapshot {
  readonly state: 'running' | 'paused' | 'destroyed' | 'idle';
  readonly reducedMotion: boolean;
  readonly webs: number;
  readonly spiders: readonly {
    x: number;
    y: number;
    scared: boolean;
    visible: boolean;
    threads: number;
    behavior: 'descending' | 'exploring' | 'weaving' | 'hiding' | 'resting' | 'fleeing' | 'hanging';
  }[];
}
export type SpiderTuning = Pick<
  SpiderOptions,
  'size' | 'speed' | 'fearRadius' | 'webOpacity' | 'webDensity' | 'webSize' | 'color'
>;
export interface SpiderController {
  /** Re-measure targets, clipping, stacking, and background colors. */
  refresh(): void;
  /** Remove all silk. The resident can begin weaving again afterward. */
  clearWebs(): void;
  /** Change appearance and behavior without removing existing silk. */
  update(options: SpiderTuning): void;
  pause(): void;
  resume(): void;
  /** Remove the canvas, listeners, observers, and scheduled frames. Safe to call twice. */
  destroy(): void;
  getState(): SpiderSnapshot;
}
