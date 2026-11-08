/** Silk is independent of the resident's body palette and the surface beneath it. */
export const silkWhite = '#ffffff';
/** A translucent hairline behind white silk keeps it readable on light surfaces without recoloring it. */
export function strokeSilk(
  ctx: CanvasRenderingContext2D,
  ink: string,
  width: number,
  opacity: number,
): void {
  if (opacity <= 0) return;
  ctx.strokeStyle = '#242424';
  ctx.lineWidth = width + 0.8;
  ctx.globalAlpha = opacity * 0.28;
  ctx.stroke();
  ctx.strokeStyle = ink;
  ctx.lineWidth = width;
  ctx.globalAlpha = opacity;
  ctx.stroke();
  ctx.globalAlpha = 1;
}
