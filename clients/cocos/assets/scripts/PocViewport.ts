/**
 * M5.3 mobile battle projection. World coordinates never contain CSS pixels,
 * Cocos UI coordinates, or device pixel ratio. Share the same calculations
 * between the real Creator scene and the Canvas-only preview.
 */
import { MOBILE_WORLD_WIDTH, HUD_DESIGN_WIDTH } from './m6/visibility.ts';

export interface MobileViewport {
  readonly uiWidth: number;
  readonly uiHeight: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly worldScale: number;
  readonly hudScale: number;
}

export interface ScreenPoint { readonly x: number; readonly y: number }

/** Expands visible battle space while keeping the same full-screen UI surface. */
export function mobileViewport(uiWidth: number, uiHeight: number): MobileViewport {
  if (!Number.isFinite(uiWidth) || !Number.isFinite(uiHeight)
    || uiWidth <= 0 || uiHeight <= 0) throw new Error('Invalid mobile viewport');
  const worldScale = uiWidth / MOBILE_WORLD_WIDTH;
  return {
    uiWidth, uiHeight, worldWidth: MOBILE_WORLD_WIDTH,
    worldHeight: uiHeight / worldScale,
    worldScale, hudScale: uiWidth / HUD_DESIGN_WIDTH,
  };
}

/** Screen coordinates are left/top origin, world is center origin and +Y up. */
export function worldToScreen(point: ScreenPoint, v: MobileViewport): ScreenPoint {
  return { x: v.uiWidth / 2 + point.x * v.worldScale,
    y: v.uiHeight / 2 - point.y * v.worldScale };
}
export function screenToWorld(point: ScreenPoint, v: MobileViewport): ScreenPoint {
  return { x: (point.x - v.uiWidth / 2) / v.worldScale,
    y: (v.uiHeight / 2 - point.y) / v.worldScale };
}
