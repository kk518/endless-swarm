import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { HIVE_TEXTURE, HIVE_GORE, FACTION_COLORS } from '../src/game/artStyle.ts';
import { WAVES, type EnemyKind } from '../src/game/progression.ts';

test('M4 gives each hive species a distinct authored silhouette', () => {
  const kinds: EnemyKind[] = ['grunt', 'leaper', 'armored', 'spitter', 'bomber', 'boss'];
  const names = kinds.map(kind => HIVE_TEXTURE[kind]);
  assert.equal(new Set(names).size, kinds.length);
  assert.equal(HIVE_TEXTURE.boss, 'broodlord');
  for (const wave of WAVES) {
    for (const { kind } of wave.mix) assert.ok(HIVE_TEXTURE[kind]);
  }
  const source = readFileSync(new URL('../src/game/Art.ts', import.meta.url), 'utf8');
  for (const name of [...names, 'marine', 'rifle', 'dust', 'acid', 'bolt', 'supply']) {
    assert.ok(source.includes(`make('${name}',`), `missing authored texture ${name}`);
  }
});

test('M4 separates tech vs organic impact colors in the actual palette', () => {
  for (const color of Object.values(HIVE_GORE)) assert.ok(color >= 0 && color <= 0xffffff);
  assert.notEqual(FACTION_COLORS.marine, FACTION_COLORS.infection);
  assert.notEqual(FACTION_COLORS.command, FACTION_COLORS.acid);
  assert.ok(Object.values(HIVE_GORE).length >= 6);
});
