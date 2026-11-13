/**
 * The migration branch keeps one canonical copy of M6 rule modules in src/game.
 * Cocos Creator only loads assets/scripts: its generated mirror is an exact copy.
 * CI checks byte equality to prevent two divergent game economies/RNG streams.
 */
import fs from 'node:fs';
import path from 'node:path';
const names = ["progression.ts","runRandom.ts","battlefields.ts","metaProgression.ts","contentCatalog.ts","heroRuntime.ts","weaponRuntime.ts","combat.ts","pressure.ts","visibility.ts","streak.ts","supplies.ts","arsenal.ts","autoGrowth.ts","campaignDirector.ts","routeDecisions.ts","runSafeSave.ts","platformStorage.ts","weaponVisual.ts"];
const write = process.argv.includes('--write');
const root = process.cwd();
for(const name of names){
  const canonical=path.join(root,'src/game',name);
  const mirror=path.join(root,'clients/cocos/assets/scripts/m6',name);
  const source=fs.readFileSync(canonical,'utf8');
  if(write){
    fs.mkdirSync(path.dirname(mirror),{recursive:true});
    fs.writeFileSync(mirror,source,'utf8');
  }
  const actual=fs.existsSync(mirror)?fs.readFileSync(mirror,'utf8'):null;
  if(actual!==source){
    console.error('M6 mirror diverged:',name,'; run node scripts/check-m6-copy.mjs --write');
    process.exitCode=1;
  }else console.log('M6 synced:',name,'bytes:',source.length);
}
