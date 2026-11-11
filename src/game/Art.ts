import Phaser from 'phaser';

/**
 * M4 art bible: industrial angular alloys and cold phosphor for the marine;
 * irregular chitin, bone seams and viscera for the hive. Every texture is
 * hand-authored in code, created once and reused by all moving entities.
 */
export const ART = {
  steel: 0x263a43, shadow: 0x0b181f, armor: 0x607b7c, edge: 0xb8c6b8,
  signal: 0xf8ad63, screen: 0x7ee7dc, bone: 0xd0b692,
  shell: 0x583b40, flesh: 0x8a4554, acid: 0xb4dc65,
} as const;

type G = Phaser.GameObjects.Graphics;

function seam(g: G, x1: number, y1: number, x2: number, y2: number, color: number, alpha = 0.9): void {
  g.lineStyle(1.4, color, alpha);
  g.lineBetween(x1, y1, x2, y2);
}
function plate(g: G, x: number, y: number, w: number, h: number, base: number, trim: number): void {
  g.fillStyle(0x0b131a);
  g.fillRoundedRect(x - 2, y + 3, w + 4, h + 1, 3);
  g.fillStyle(base); g.fillRoundedRect(x, y, w, h, 3);
  seam(g, x + 3, y + 2, x + w - 4, y + 2, trim, 0.7);
}
function claw(g: G, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, color: number): void {
  g.lineStyle(4, 0x271e23); g.lineBetween(ax, ay, bx, by);
  g.lineStyle(2.5, color); g.lineBetween(ax, ay, bx, by);
  g.fillStyle(ART.bone); g.fillTriangle(bx - 2, by - 1, bx + 2, by + 1, cx, cy);
}
function eyePair(g: G, mid: number, y: number, gap: number, color: number, radius = 2): void {
  g.fillStyle(0x150e18); g.fillCircle(mid - gap, y + 1, radius + 1); g.fillCircle(mid + gap, y + 1, radius + 1);
  g.fillStyle(color); g.fillCircle(mid - gap, y, radius); g.fillCircle(mid + gap, y, radius);
}

/** Synchronous Phaser Graphics texture creation—no external downloads or loading race. */
export function createArt(scene: Phaser.Scene): void {
  if (scene.textures.exists('marine')) return;
  const make = (key: string, w: number, h: number, draw: (g: G) => void): void => {
    const g = scene.add.graphics();
    draw(g); g.generateTexture(key, w, h); g.destroy();
  };

  // Assault frame, photographed from above: offset hip plates, angular pauldrons,
  // tactical hazard stripe and powered back-cartridge. Facing local negative Y.
  // Agile bipedal exosuit, NOT a tank: compact torso, visible elbows, thigh gaps,
  // narrow ankles and two rear thrust pods with a distinct humanoid silhouette.
  make('marine', 76, 100, g => {
    // Long articulated legs, separated by negative space.
    g.fillStyle(0x0b151b); g.fillRoundedRect(19, 54, 16, 34, 4);
    g.fillRoundedRect(42, 54, 16, 34, 4);
    plate(g, 21, 60, 12, 20, 0x586e70, 0xa9b5aa);
    plate(g, 44, 60, 12, 20, 0x586e70, 0xa9b5aa);
    g.fillStyle(0x15252b); g.fillRoundedRect(20, 77, 13, 15, 3);
    g.fillRoundedRect(44, 77, 13, 15, 3);
    g.fillStyle(0x97a89e); g.fillRect(22, 84, 9, 3); g.fillRect(46, 84, 9, 3);
    g.fillStyle(0x0b1219); g.fillTriangle(19, 91, 17, 98, 35, 98);
    g.fillTriangle(42, 98, 59, 98, 56, 91);
    // Slim hip harness and torso core: width no longer dominates the legs.
    g.fillStyle(0x141e25); g.fillRoundedRect(25, 36, 27, 31, 5);
    plate(g, 28, 48, 20, 15, 0x455f63, 0x9aaca5);
    g.fillStyle(0x31454b); g.fillRect(27, 61, 7, 6); g.fillRect(43, 61, 7, 6);
    // Open elbow joints and hand guards.
    for (const sign of [-1, 1]) {
      const x = 38 + sign * 21;
      g.fillStyle(0x1b2c35); g.fillRoundedRect(x - 5, 30, 10, 18, 3);
      g.fillStyle(0x6c8380); g.fillRoundedRect(x - 6, 37, 12, 14, 3);
      g.fillStyle(0x14242d); g.fillRoundedRect(x - 5, 49, 10, 12, 3);
      g.fillStyle(ART.signal); g.fillRect(x - 4, 46, 8, 2);
      // The compact shoulder shells expose the elbow gap.
      plate(g, x - 10, 21, 20, 17, 0x667d7b, 0xb8c8b4);
    }
    // Twin thruster pods sit behind the shoulders (bottom-right camera shadow).
    plate(g, 20, 41, 7, 13, 0x2d454e, 0x88a4a4);
    plate(g, 50, 41, 7, 13, 0x2d454e, 0x88a4a4);
    g.fillStyle(0xf2a263); g.fillRect(22, 52, 3, 5); g.fillRect(52, 52, 3, 5);
    g.fillStyle(0x172c35); g.fillRoundedRect(25, 29, 26, 23, 4);
    plate(g, 27, 30, 22, 20, 0x506d70, 0xb9c6b4);
    g.fillStyle(0x0b1f29); g.fillCircle(38, 41, 8);
    g.lineStyle(2, 0xbdcbc1); g.strokeCircle(38, 41, 8);
    g.fillStyle(ART.screen, 0.4); g.fillCircle(38, 41, 6);
    g.fillStyle(0xb7ffed); g.fillCircle(38, 41, 3.5);
    // Helmet, split visor and a respirator chin with visible neck.
    g.fillStyle(0x0e1d25); g.fillRoundedRect(31, 23, 14, 7, 3);
    g.fillStyle(0x7a9089); g.fillRoundedRect(27, 9, 22, 20, 7);
    g.fillStyle(0x192b35); g.fillRoundedRect(28, 15, 20, 9, 3);
    g.fillStyle(0x8ef9e9); g.fillRect(30, 16, 16, 3);
    g.fillStyle(0x202e34); g.fillRect(36, 12, 4, 7);
    g.fillStyle(0x4c6568); g.fillTriangle(33, 25, 43, 25, 38, 32);
    seam(g, 28, 14, 33, 9, 0xbccabd);
    // Strong asymmetrical orange tactical mark, not an all-over glow.
    g.fillStyle(0xf2ab72); g.fillRect(13, 25, 6, 3);
    g.fillRect(29, 34, 4, 8);
    g.fillStyle(0xe2e7cf); g.fillRect(30, 35, 2, 4);
  });

  make('rifle', 66, 22, g => {
    g.fillStyle(0x071116); g.fillRoundedRect(2, 6, 62, 11, 2);
    g.fillStyle(0x3f575c); g.fillRoundedRect(10, 3, 43, 13, 2);
    g.fillStyle(0x82918a); g.fillRect(15, 3, 26, 3);
    g.fillStyle(0x172a30); g.fillRect(39, 7, 25, 6);
    g.fillStyle(0xc0c8b4); g.fillRect(55, 7, 8, 3);
    g.fillStyle(ART.signal); g.fillRect(49, 3, 5, 3);
    g.fillStyle(0x89eddb); g.fillRect(20, 9, 19, 2);
    g.fillStyle(0x26383d); g.fillRect(13, 16, 10, 5);
    seam(g, 7, 6, 7, 16, 0xb7c7bb);
  });

  // Common chitin runner: wedge skull and long pointed mandibles.
  make('crawler', 58, 64, g => {
    for (const sign of [-1, 1]) {
      claw(g, 29 + sign * 11, 25, 29 + sign * 24, 13, 29 + sign * 28, 6, 0x92635d);
      claw(g, 29 + sign * 13, 36, 29 + sign * 26, 35, 29 + sign * 28, 44, 0x755257);
      claw(g, 29 + sign * 10, 44, 29 + sign * 23, 55, 29 + sign * 25, 62, 0x7b5451);
    }
    g.fillStyle(0x1b141c); g.fillEllipse(29, 39, 31, 38);
    g.fillStyle(0x67414a); g.fillEllipse(29, 35, 25, 38);
    g.fillStyle(0x402d34); g.fillEllipse(29, 43, 22, 22);
    seam(g, 18, 40, 40, 40, 0xb08b79);
    seam(g, 20, 47, 38, 47, 0xa57970);
    g.fillStyle(0xac8675); g.fillTriangle(29, 7, 13, 26, 45, 26);
    g.fillStyle(0x39242a); g.fillTriangle(29, 13, 21, 25, 37, 25);
    eyePair(g, 29, 22, 7, 0xf38c66, 2);
    g.fillStyle(ART.bone); g.fillTriangle(16, 27, 22, 28, 21, 38);
    g.fillTriangle(42, 27, 36, 28, 37, 38);
  });

  // Jump-hunter: asymmetric sickle forearms, tapered thorax and narrow abdomen.
  make('leaper', 68, 74, g => {
    for (const sign of [-1, 1]) {
      claw(g, 34 + sign * 12, 24, 34 + sign * 30, 14, 34 + sign * 32, 0, 0xc47761);
      claw(g, 34 + sign * 15, 38, 34 + sign * 31, 44, 34 + sign * 33, 58, 0x8f484b);
      claw(g, 34 + sign * 9, 54, 34 + sign * 20, 66, 34 + sign * 17, 73, 0xa26b63);
    }
    g.fillStyle(0x241920); g.fillEllipse(34, 43, 27, 50);
    g.fillStyle(0x975761); g.fillTriangle(34, 18, 19, 41, 49, 41);
    g.fillStyle(0x4a2d35); g.fillEllipse(34, 54, 19, 31);
    g.fillStyle(0xd09a77); g.fillTriangle(34, 9, 23, 23, 45, 23);
    g.fillStyle(0x201921); g.fillTriangle(34, 16, 27, 29, 41, 29);
    eyePair(g, 34, 23, 5, 0xfcd079, 2.4);
    seam(g, 34, 37, 34, 63, 0xf0b17c, 0.7);
  });

  // Bulwark beetle: heavy layered carapace shields, shielded sensory slit.
  make('armored', 74, 76, g => {
    for (const sign of [-1, 1]) {
      claw(g, 37 + sign * 20, 32, 37 + sign * 33, 24, 37 + sign * 35, 18, 0x8b8178);
      claw(g, 37 + sign * 21, 50, 37 + sign * 33, 60, 37 + sign * 35, 66, 0x847971);
    }
    g.fillStyle(0x151b24); g.fillEllipse(37, 41, 54, 57);
    g.fillStyle(0x665e5d); g.fillEllipse(37, 43, 49, 55);
    g.fillStyle(0x35333c); g.fillTriangle(37, 12, 13, 24, 13, 58);
    g.fillTriangle(37, 12, 61, 24, 61, 58);
    g.fillStyle(0x90847b); g.fillTriangle(37, 15, 16, 30, 33, 53);
    g.fillTriangle(37, 15, 58, 30, 41, 53);
    seam(g, 37, 14, 37, 69, ART.bone, 0.55);
    seam(g, 17, 35, 29, 49, 0xd3a998);
    seam(g, 57, 35, 45, 49, 0xd3a998);
    g.fillStyle(0x241b27); g.fillRoundedRect(26, 19, 22, 10, 3);
    g.fillStyle(0xff9a6c); g.fillRect(31, 22, 12, 2);
    g.lineStyle(2, 0xc2b3a0); g.strokeEllipse(37, 41, 48, 55);
  });

  // Acid sac: bloated translucent vesicle, ribs and dripping proboscis.
  make('spitter', 70, 76, g => {
    for (const sign of [-1, 1]) {
      claw(g, 35 + sign * 15, 29, 35 + sign * 31, 16, 35 + sign * 33, 13, 0x795b4e);
      claw(g, 35 + sign * 18, 54, 35 + sign * 32, 64, 35 + sign * 34, 72, 0x8a645c);
    }
    g.fillStyle(0x211a20); g.fillEllipse(35, 43, 44, 58);
    g.fillStyle(0x655049); g.fillEllipse(35, 44, 38, 54);
    g.fillStyle(0x8cad67); g.fillEllipse(35, 49, 31, 36);
    g.fillStyle(ART.acid, 0.32); g.fillEllipse(32, 45, 20, 28);
    for (let i = 0; i < 5; i++) seam(g, 23, 35 + i * 5, 47, 36 + i * 5, 0x37513e, 0.7);
    g.fillStyle(0x352b2c); g.fillTriangle(35, 8, 22, 26, 48, 26);
    eyePair(g, 35, 22, 7, 0xd0ff72, 2);
    g.fillStyle(0x3f663d); g.fillRoundedRect(31, 17, 8, 17, 4);
    g.fillStyle(0xd6f889); g.fillCircle(35, 14, 3);
    g.fillStyle(0x9fcf63, 0.8); g.fillCircle(35, 6, 2);
  });

  // Suicider: ruptured biocapsule with exposed, cracked volatile organ.
  make('bomber', 68, 72, g => {
    for (const sign of [-1, 1]) {
      claw(g, 34 + sign * 17, 29, 34 + sign * 30, 16, 34 + sign * 33, 8, 0x9d5367);
      claw(g, 34 + sign * 19, 43, 34 + sign * 30, 60, 34 + sign * 33, 67, 0x9e4d64);
    }
    g.fillStyle(0x2d1b28); g.fillEllipse(34, 39, 43, 57);
    g.fillStyle(0x743748); g.fillEllipse(34, 43, 36, 46);
    g.fillStyle(0xba4e63); g.fillEllipse(34, 42, 29, 36);
    g.fillStyle(0xff8fa1, 0.40); g.fillCircle(34, 43, 18);
    g.fillStyle(0xffd4a8); g.fillCircle(34, 43, 12);
    g.fillStyle(0xfa5b7a); g.fillCircle(34, 43, 8);
    g.fillStyle(0x471f32); g.fillTriangle(20, 39, 25, 21, 32, 31);
    g.fillTriangle(48, 39, 43, 21, 36, 31);
    seam(g, 27, 43, 35, 50, 0xffecb0, 0.9);
    seam(g, 34, 34, 42, 40, 0xffecb0, 0.9);
    g.fillStyle(0x3a202b); g.fillTriangle(34, 7, 24, 19, 44, 19);
    eyePair(g, 34, 18, 6, 0xffb18a, 2);
  });

  // Hive tyrant: hooked crown, split carapace and marrow-colored spine.
  make('broodlord', 114, 120, g => {
    for (const sign of [-1, 1]) {
      claw(g, 57 + sign * 25, 32, 57 + sign * 49, 16, 57 + sign * 55, 3, 0x996660);
      claw(g, 57 + sign * 35, 58, 57 + sign * 53, 72, 57 + sign * 55, 90, 0x9d5454);
      claw(g, 57 + sign * 26, 85, 57 + sign * 45, 105, 57 + sign * 46, 116, 0xa47369);
    }
    g.fillStyle(0x241b23); g.fillEllipse(57, 66, 76, 90);
    g.fillStyle(0x6d4146); g.fillEllipse(57, 69, 66, 86);
    g.fillStyle(0xc0997c); g.fillTriangle(57, 12, 26, 51, 88, 51);
    g.fillStyle(0x4c2e37); g.fillTriangle(57, 25, 33, 59, 51, 97);
    g.fillTriangle(57, 25, 81, 59, 63, 97);
    g.fillStyle(0x291b27); g.fillEllipse(57, 72, 28, 57);
    seam(g, 57, 44, 57, 103, 0xe1b08d, 0.8);
    for(let i=0;i<6;i++){
      const y=55+i*9;
      seam(g, 40, y, 53, y+3, 0xbf8374, 0.7);
      seam(g, 74, y, 61, y+3, 0xbf8374, 0.7);
    }
    g.fillStyle(0xe8c49d); g.fillTriangle(25, 21, 38, 2, 43, 35);
    g.fillTriangle(89, 21, 76, 2, 71, 35);
    g.fillStyle(0x261a24); g.fillRoundedRect(37, 34, 40, 14, 4);
    eyePair(g, 57, 42, 12, 0xffb572, 4);
    g.lineStyle(3, 0xd6a27e, 0.75); g.strokeEllipse(57, 67, 67, 84);
  });

  // Technology drops: hard octagonal case, central service cross, warning nibs.
  make('supply', 54, 54, g => {
    g.fillStyle(0x111c24);
    g.fillTriangle(13, 6, 41, 6, 48, 13);
    g.fillRect(6, 13, 42, 28);
    g.fillTriangle(6, 41, 13, 48, 41, 48);
    g.fillStyle(0x53676c); g.fillRoundedRect(10, 10, 34, 34, 3);
    g.fillStyle(0x1c3138); g.fillRoundedRect(14, 14, 26, 26, 2);
    g.fillStyle(0xe7eee0); g.fillRect(24, 18, 6, 18); g.fillRect(18, 24, 18, 6);
    g.fillStyle(ART.signal); g.fillRect(11, 12, 7, 3); g.fillRect(36, 38, 7, 3);
    seam(g, 14, 17, 20, 17, 0xc3d4cd); seam(g, 33, 36, 40, 36, 0xc3d4cd);
  });

  // Distinct hardware module silhouettes. Oriented along local +X like the rifle.
  make('mount-scatter', 58, 26, g => {
    g.fillStyle(0x111a22); g.fillRoundedRect(2, 7, 40, 15, 3);
    plate(g, 10, 4, 30, 16, 0x6a6662, 0xdab38a);
    for (let row = 0; row < 3; row++) {
      g.fillStyle(0x1b2029); g.fillRoundedRect(36, 5 + row * 7, 21, 5, 1);
      g.fillStyle(0xf2bd84); g.fillRect(53, 6 + row * 7, 3, 2);
    }
    g.fillStyle(0xff9a56); g.fillRect(18, 10, 13, 3);
    g.fillStyle(0xded8c5); g.fillRect(5, 10, 6, 4);
  });

  make('mount-arc', 56, 30, g => {
    g.fillStyle(0x0b1723); g.fillRoundedRect(2, 8, 50, 17, 4);
    plate(g, 7, 9, 38, 14, 0x495c71, 0xa7b6d4);
    for (let i = 0; i < 4; i++) {
      g.lineStyle(2, 0x91bdff, 0.92);
      g.strokeEllipse(19 + i * 8, 15, 8, 20);
    }
    g.fillStyle(0x1b2432); g.fillRoundedRect(43, 11, 13, 9, 2);
    g.fillStyle(0xc1dbff); g.fillRect(50, 12, 6, 3);
  });

  make('mount-flame', 62, 26, g => {
    g.fillStyle(0x10151b); g.fillRoundedRect(2, 5, 50, 16, 3);
    plate(g, 7, 6, 35, 15, 0x59504b, 0xd4a48a);
    g.fillStyle(0x9d614c); g.fillRoundedRect(10, 9, 20, 9, 3);
    for (let i = 0; i < 4; i++) {
      seam(g, 32 + i * 6, 8, 32 + i * 6, 20, 0xf3ac72, 0.88);
    }
    g.fillStyle(0x222028); g.fillRoundedRect(45, 10, 17, 7, 1);
    g.fillStyle(0xffbc6d); g.fillRect(57, 11, 4, 4);
  });

  make('muzzle-flash', 64, 52, g => {
    g.fillStyle(0xff9653, 0.32); g.fillEllipse(28, 26, 60, 46);
    g.fillStyle(0xffcf7b, 0.76); g.fillTriangle(10, 20, 62, 26, 9, 32);
    g.fillStyle(0xffffff, 0.94); g.fillTriangle(3, 23, 50, 26, 3, 29);
    g.fillStyle(0xf3d590); g.fillTriangle(13, 6, 25, 26, 13, 47);
    g.fillStyle(0xfff4d7); g.fillEllipse(16, 26, 23, 9);
  });

  make('bolt', 34, 12, g => {
    g.fillStyle(ART.screen, 0.25); g.fillEllipse(17, 6, 32, 11);
    g.fillStyle(0xffffff); g.fillRoundedRect(9, 4, 23, 4, 2);
    g.fillStyle(0x6eefd9); g.fillRoundedRect(2, 4, 20, 4, 2);
    g.fillStyle(ART.signal); g.fillRect(27, 5, 3, 2);
  });
  make('acid', 26, 26, g => {
    g.fillStyle(0xc8f48d, 0.21); g.fillCircle(13, 13, 13);
    g.fillStyle(0x405d3e); g.fillCircle(13, 13, 9);
    g.fillStyle(0xb4df73); g.fillCircle(12, 12, 6);
    g.fillStyle(0xf2ffa9); g.fillCircle(9, 9, 2.6);
    g.lineStyle(1.6, 0xa8ed78, 0.8); g.strokeCircle(13, 13, 10);
  });

  // Worn 64px environmental tile. Unlike a uniform grid, the cracks and
  // edge washes are deliberate, restrained details that tile seamlessly.
  make('dust', 128, 128, g => {
    g.fillStyle(0x101a22); g.fillRect(0, 0, 128, 128);
    g.fillStyle(0x18242c); g.fillRect(1, 1, 125, 125);
    g.fillStyle(0x0c151c, 0.65); g.fillRect(0, 0, 128, 7);
    g.fillRect(0, 0, 6, 128);
    g.lineStyle(1, 0x39424a, 0.5);
    g.lineBetween(0, 0, 128, 0); g.lineBetween(0, 0, 0, 128);
    g.lineStyle(2, 0x0b1319, 0.75);
    g.lineBetween(17, 29, 52, 34); g.lineBetween(52, 34, 59, 57);
    g.lineBetween(89, 79, 108, 64); g.lineBetween(108, 64, 116, 66);
    seam(g, 17, 28, 50, 33, 0x3d464b, 0.5);
    seam(g, 88, 78, 108, 63, 0x3d464b, 0.5);
    g.fillStyle(0x664840, 0.22); g.fillEllipse(92, 24, 50, 23);
    g.fillStyle(0x5b6147, 0.14); g.fillEllipse(34, 98, 62, 38);
    for(let i=0;i<16;i++){
      const x=(i*53+19)%123, y=(i*37+29)%122;
      g.fillStyle(i%4===0?0x92836e:0x566369, i%4===0?0.28:0.19);
      g.fillRect(x,y,i%5===0?3:1, i%5===0?2:1);
    }
    g.fillStyle(0xc8a477, 0.22); g.fillRect(113, 3, 9, 2);
    g.fillRect(5, 109, 2, 12);
  });
}
