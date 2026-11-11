import Phaser from 'phaser';

/** Small original vector textures. No downloaded art or external game assets. */
export function createArt(scene: Phaser.Scene): void {
  if (scene.textures.exists('marine')) return;

  const make = (key: string, width: number, height: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    const g = scene.add.graphics();
    draw(g);
    g.generateTexture(key, width, height);
    g.destroy();
  };

  make('marine', 64, 64, (g) => {
    // Heavy armor legs, shoulder plates, helmet + luminous chest reactor.
    g.fillStyle(0x05171e); g.fillRoundedRect(17, 8, 30, 50, 11);
    g.fillStyle(0x4d7380); g.fillRoundedRect(19, 38, 12, 20, 4); g.fillRoundedRect(33, 38, 12, 20, 4);
    g.fillStyle(0x91b8c0); g.fillRoundedRect(12, 18, 40, 29, 10);
    g.fillStyle(0x2a5869); g.fillRoundedRect(17, 22, 30, 22, 6);
    g.fillStyle(0x7fabb4); g.fillRoundedRect(8, 15, 14, 19, 6); g.fillRoundedRect(42, 15, 14, 19, 6);
    g.fillStyle(0x102b37); g.fillRoundedRect(21, 7, 22, 22, 8);
    g.fillStyle(0x51f1db); g.fillRoundedRect(22, 17, 20, 6, 3);
    g.fillStyle(0xe6fdf4); g.fillRect(27, 18, 8, 2);
    g.fillStyle(0x071920); g.fillCircle(32, 34, 7);
    g.fillStyle(0x72ffe3); g.fillCircle(32, 34, 4);
    g.lineStyle(2, 0xd8f5ee, 0.65); g.strokeCircle(32, 34, 7);
  });

  make('rifle', 53, 17, (g) => {
    g.fillStyle(0x0a222c); g.fillRoundedRect(3, 4, 44, 10, 3);
    g.fillStyle(0x52717c); g.fillRoundedRect(10, 2, 32, 13, 3);
    g.fillStyle(0x172f3b); g.fillRoundedRect(34, 5, 17, 6, 2);
    g.fillStyle(0x85f2df); g.fillRect(18, 5, 15, 3);
    g.fillStyle(0xefbf69); g.fillRect(46, 6, 5, 4);
  });

  make('crawler', 48, 48, (g) => {
    g.lineStyle(4, 0x426858, 1);
    for (const side of [-1, 1]) {
      g.lineBetween(24 + side * 8, 17, 24 + side * 21, 6);
      g.lineBetween(24 + side * 11, 25, 24 + side * 23, 24);
      g.lineBetween(24 + side * 8, 32, 24 + side * 20, 42);
    }
    g.fillStyle(0x0d2b29); g.fillEllipse(24, 25, 28, 35);
    g.fillStyle(0x638a67); g.fillEllipse(24, 27, 23, 32);
    g.fillStyle(0x89bc79); g.fillEllipse(24, 13, 17, 17);
    g.fillStyle(0x273f36); g.fillEllipse(24, 29, 14, 16);
    g.lineStyle(2, 0xb3e48b, 0.65); g.strokeEllipse(24, 27, 22, 32);
    g.fillStyle(0xff8f67); g.fillCircle(19, 12, 2.6); g.fillCircle(29, 12, 2.6);
    g.lineStyle(2, 0x274237); g.lineBetween(24, 19, 24, 35);
  });

  make('bolt', 24, 9, (g) => {
    g.fillStyle(0x55ffe0, 0.35); g.fillEllipse(11, 4.5, 23, 9);
    g.fillStyle(0xe9fff0); g.fillRoundedRect(6, 3, 17, 3, 2);
    g.fillStyle(0x4beacb); g.fillRoundedRect(0, 3, 15, 3, 2);
  });

  make('dust', 64, 64, (g) => {
    g.fillStyle(0x101e28); g.fillRect(0, 0, 64, 64);
    g.lineStyle(1, 0x203641, 0.45);
    g.lineBetween(0, 0, 64, 0); g.lineBetween(0, 0, 0, 64);
    g.fillStyle(0x4b7380, 0.19);
    for (let i = 0; i < 10; i++) {
      const x = (i * 29 + 11) % 63;
      const y = (i * 43 + 5) % 63;
      g.fillCircle(x, y, i % 3 === 0 ? 1.8 : 0.8);
    }
  });
}
