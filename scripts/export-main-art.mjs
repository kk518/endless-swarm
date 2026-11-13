#!/usr/bin/env node
/**
 * Exact M4 texture exporter. main Art.ts has procedural Phaser Graphics rather
 * than PNG files. Replay its literal draw calls to SVG then rasterize as PNG.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const art = await readFile(join(root, 'src/game/Art.ts'), 'utf8');
const targets = [
  join(root,'clients/cocos/assets/resources/main-art'),
  join(root,'clients/cocos-preview/public/main-art'),
];
const expected=['marine','rifle','crawler','leaper','armored','spitter','bomber',
  'broodlord','supply','mount-scatter','mount-arc','mount-flame',
  'muzzle-flash','bolt','acid','dust'];
const hex=v=>'#'+(v>>>0).toString(16).padStart(6,'0');
const fmt=v=>Number(v.toFixed(3));
const shapes=new Map();
const matcher=/make\('([^']+)',\s*(\d+),\s*(\d+),\s*g\s*=>\s*\{/g;
for(const match of art.matchAll(matcher)){
 let index=match.index+match[0].length, depth=1, quote='';
 const begin=index;
 for(;index<art.length&&depth;index++){
   const ch=art[index];
   if(quote){if(ch==='\\'){index++;continue;}if(ch===quote)quote='';}
   else if(ch==="'"||ch==='"'||ch===String.fromCharCode(96))quote=ch;
   else if(ch==='{')depth++;
   else if(ch==='}')depth--;
 }
 if(depth)throw Error('Unbalanced Art.ts body for '+match[1]);
 shapes.set(match[1],{width:Number(match[2]),height:Number(match[3]),body:art.slice(begin,index-1)});
}
if(shapes.size!==expected.length||expected.some(k=>!shapes.has(k)))
  throw Error('main Art.ts changed: update original art asset manifest');

class G {
 constructor(w,h){this.width=w;this.height=h;this.fill='#fff';this.alpha=1;
   this.stroke='#fff';this.strokeAlpha=1;this.strokeWidth=1;this.list=[];}
 fillStyle(c,a=1){this.fill=hex(c);this.alpha=a;return this;}
 lineStyle(w,c,a=1){this.strokeWidth=w;this.stroke=hex(c);this.strokeAlpha=a;return this;}
 add(tag,attrs,outline=false){
   const style=outline
     ? ' fill="none" stroke="'+this.stroke+'" stroke-opacity="'+this.strokeAlpha
       +'" stroke-width="'+fmt(this.strokeWidth)+'" stroke-linecap="round"'
     : ' fill="'+this.fill+'" fill-opacity="'+this.alpha+'"';
   this.list.push('<'+tag+' '+attrs+style+'/>');
 }
 rect(x,y,w,h,r=0){this.add('rect','x="'+fmt(x)+'" y="'+fmt(y)
   +'" width="'+fmt(w)+'" height="'+fmt(h)+'" rx="'+fmt(r)+'"');}
 fillRect(x,y,w,h){this.rect(x,y,w,h);}
 fillRoundedRect(x,y,w,h,r){this.rect(x,y,w,h,r);}
 fillTriangle(ax,ay,bx,by,cx,cy){this.add('polygon','points="'
   +fmt(ax)+','+fmt(ay)+' '+fmt(bx)+','+fmt(by)+' '+fmt(cx)+','+fmt(cy)+'"');}
 circle(x,y,r,outline=false){this.add('circle','cx="'+fmt(x)+'" cy="'+fmt(y)
   +'" r="'+fmt(r)+'"',outline);}
 ellipse(x,y,w,h,outline=false){this.add('ellipse','cx="'+fmt(x)+'" cy="'+fmt(y)
   +'" rx="'+fmt(w/2)+'" ry="'+fmt(h/2)+'"',outline);}
 fillCircle(x,y,r){this.circle(x,y,r);}
 fillEllipse(x,y,w,h){this.ellipse(x,y,w,h);}
 strokeCircle(x,y,r){this.circle(x,y,r,true);}
 strokeEllipse(x,y,w,h){this.ellipse(x,y,w,h,true);}
 lineBetween(ax,ay,bx,by){this.add('line','x1="'+fmt(ax)+'" y1="'+fmt(ay)
   +'" x2="'+fmt(bx)+'" y2="'+fmt(by)+'"',true);}
 svg(){return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '
  +this.width+' '+this.height+'" width="'+this.width+'" height="'+this.height+'">'
  +this.list.join('')+'</svg>';}
}
const ART={steel:0x263a43,shadow:0x0b181f,armor:0x607b7c,edge:0xb8c6b8,
  signal:0xf8ad63,screen:0x7ee7dc,bone:0xd0b692,shell:0x583b40,
  flesh:0x8a4554,acid:0xb4dc65};
function seam(g,x1,y1,x2,y2,c,a=.9){g.lineStyle(1.4,c,a);g.lineBetween(x1,y1,x2,y2);}
function plate(g,x,y,w,h,base,trim){
 g.fillStyle(0x0b131a);g.fillRoundedRect(x-2,y+3,w+4,h+1,3);
 g.fillStyle(base);g.fillRoundedRect(x,y,w,h,3);
 seam(g,x+3,y+2,x+w-4,y+2,trim,.7);
}
function claw(g,ax,ay,bx,by,cx,cy,c){
 g.lineStyle(4,0x271e23);g.lineBetween(ax,ay,bx,by);
 g.lineStyle(2.5,c);g.lineBetween(ax,ay,bx,by);
 g.fillStyle(ART.bone);g.fillTriangle(bx-2,by-1,bx+2,by+1,cx,cy);
}
function eyePair(g,mid,y,gap,c,r=2){
 g.fillStyle(0x150e18);g.fillCircle(mid-gap,y+1,r+1);g.fillCircle(mid+gap,y+1,r+1);
 g.fillStyle(c);g.fillCircle(mid-gap,y,r);g.fillCircle(mid+gap,y,r);
}
for(const dir of targets)await mkdir(dir,{recursive:true});
let bytes=0;
for(const key of expected){
 const {width,height,body}=shapes.get(key),g=new G(width,height);
 new Function('g','ART','plate','seam','claw','eyePair',body)(g,ART,plate,seam,claw,eyePair);
 const png=await sharp(Buffer.from(g.svg()),{density:192})
   .resize(width*2,height*2).png({compressionLevel:9}).toBuffer();
 for(const dir of targets)await writeFile(join(dir,key+'.png'),png);
 bytes+=png.length;
}
console.log('Exported '+expected.length+' original main textures ('+bytes+' bytes) into Creator + Canvas');
