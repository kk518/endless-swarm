#!/usr/bin/env node
/**
 * Import the AI-generated eight-frame mech motion study into both Web Mobile
 * and the browser parity preview. Keeping the source as base64 permits clean
 * deterministic regeneration of a PNG before Creator scans resources.
 *
 * Art is a 2D sprite experiment, not a 3D model or skeletal animation.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=join(root,'art/ai/mech-motion.png.base64');
const data=Buffer.from((await readFile(source,'utf8')).replace(/\s/g,''),'base64');
const meta=await sharp(data).metadata();
if(meta.format!=='png'||meta.width!==288||meta.height!==144||
  data.length<5000||data.length>300000)
  throw Error('Invalid AI mech motion atlas: expected a 4x2 grid of 72px PNG cells');
const targets=[
  join(root,'clients/cocos/assets/resources/ai-motion/mech-motion.png'),
  join(root,'clients/cocos-preview/public/ai-motion/mech-motion.png'),
];
for(const destination of targets){
  await mkdir(dirname(destination),{recursive:true});
  await writeFile(destination,data);
}
console.log('Installed 8-frame AI mech motion PNG to both runtimes ('+data.length+' bytes)');
