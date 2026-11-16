import type { MetaStorage } from './metaProgression.ts';
import type { SafeRunStorage } from './runSafeSave.ts';

/** A storage port independent of Phaser, DOM UI and WeChat mini-game APIs. */
export interface GameStoragePort extends MetaStorage, SafeRunStorage {}

let injected: GameStoragePort | null = null;

/**
 * Mobile runtimes may supply a storage implementation at boot.
 * Cocos/WeChat integration must map its sync storage APIs here (and test it).
 */
export function configureStoragePort(port: GameStoragePort | null): void {
  injected = port;
}

export function getStoragePort(): GameStoragePort | null {
  if (injected) return injected;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
