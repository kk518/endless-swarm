#!/usr/bin/env node
/**
 * Vanguard art pack: distinctive layered silhouettes for the Creator migration.
 * Pure vector originals, baked to transparent 3x PNGs during CI; no remote art.
 * This is visual-only and does not alter the canonical hitboxes or combat core.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sizes={
  marine:[76,100],crawler:[58,64],leaper:[68,74],
  armored:[74,76],spitter:[70,76],bomber:[68,72],broodlord:[114,120],
};
const targets=[
  join(root,'clients/cocos/assets/resources/vanguard-art'),
  join(root,'clients/cocos-preview/public/vanguard-art'),
];
const defs='<defs>'+
'<linearGradient id="steel" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="#e2f3ef"/><stop offset=".25" stop-color="#8db6c5"/><stop offset=".64" stop-color="#43687c"/><stop offset="1" stop-color="#182b42"/></linearGradient>'+
'<linearGradient id="dark" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#506279"/><stop offset=".4" stop-color="#293749"/><stop offset="1" stop-color="#101c2e"/></linearGradient>'+
'<linearGradient id="shell" x1=".18" y1="0" x2=".85" y2="1"><stop stop-color="#b78382"/><stop offset=".24" stop-color="#75526a"/><stop offset=".65" stop-color="#3b324d"/><stop offset="1" stop-color="#171b30"/></linearGradient>'+
'<linearGradient id="bone" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4d6a4"/><stop offset=".6" stop-color="#9c8178"/><stop offset="1" stop-color="#3c3e4d"/></linearGradient>'+
'<radialGradient id="reactor"><stop stop-color="#e6fffd"/><stop offset=".28" stop-color="#70f2f0"/><stop offset=".65" stop-color="#168fba"/><stop offset="1" stop-color="#0a3649"/></radialGradient>'+
'<radialGradient id="toxin"><stop stop-color="#f1ffc0"/><stop offset=".3" stop-color="#b5f25c"/><stop offset="1" stop-color="#346f4d"/></radialGradient>'+
'<radialGradient id="blast"><stop stop-color="#ffeec6"/><stop offset=".35" stop-color="#ff744b"/><stop offset="1" stop-color="#68243b"/></radialGradient>'+
'</defs>';

const polygon=(p,fill,stroke='#111c2a',strokeWidth=2)=>
  '<polygon points="'+p+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+strokeWidth+'" stroke-linejoin="round"/>';
const path=(d,fill,stroke='#121c29',sw=2)=>
  '<path d="'+d+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'" stroke-linejoin="round" stroke-linecap="round"/>';
const ellipse=(x,y,rx,ry,fill,stroke='#101b27',sw=2)=>
  '<ellipse cx="'+x+'" cy="'+y+'" rx="'+rx+'" ry="'+ry+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'"/>';
const line=(x1,y1,x2,y2,color='#d2e7eb',sw=1)=>
  '<path d="M'+x1+' '+y1+'L'+x2+' '+y2+'" fill="none" stroke="'+color+'" stroke-width="'+sw+'" stroke-linecap="round"/>';
const svg=(w,h,body)=>'<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+
  '" viewBox="0 0 100 112">'+defs+body+'</svg>';

function marine(){
  let s='';
  // Rear thrusters, shoulder servos, broad armored boots.
  s+=polygon('26,42 15,53 12,76 24,82 33,61','url(#dark)');
  s+=polygon('74,42 85,53 88,76 76,82 67,61','url(#dark)');
  s+=polygon('30,70 23,90 28,107 43,107 47,85 44,70','url(#steel)');
  s+=polygon('70,70 77,90 72,107 57,107 53,85 56,70','url(#steel)');
  s+=polygon('24,95 21,108 43,108 42,100','url(#dark)');
  s+=polygon('76,95 79,108 57,108 58,100','url(#dark)');
  s+=ellipse(50,59,29,32,'url(#dark)');
  s+=polygon('26,41 20,60 29,83 44,88 51,76 50,44','url(#steel)');
  s+=polygon('74,41 80,60 71,83 56,88 49,76 50,44','url(#steel)');
  s+=polygon('30,42 42,38 50,45 58,38 70,42 76,62 64,73 50,67 36,73 24,62','url(#dark)');
  s+=polygon('13,41 20,30 35,30 39,49 29,60 15,55','url(#steel)');
  s+=polygon('87,41 80,30 65,30 61,49 71,60 85,55','url(#steel)');
  s+=polygon('14,45 9,65 21,73 29,58','url(#dark)');
  s+=polygon('86,45 91,65 79,73 71,58','url(#dark)');
  s+=polygon('37,10 50,4 63,10 69,29 62,42 38,42 31,29','url(#steel)');
  s+=polygon('35,22 46,18 54,18 65,22 60,33 40,33','url(#dark)');
  s+=polygon('39,23 61,23 57,29 43,29','url(#reactor)','#124b61',1);
  s+=polygon('43,38 50,32 57,38 62,53 50,62 38,53','url(#reactor)','#1a6675',2);
  s+=polygon('50,40 54,50 50,56 46,50','#e2ffff','#8bc3be',1);
  s+=line(17,39,31,37,'#e5f8f3',1.7)+line(83,39,69,37,'#e5f8f3',1.7);
  s+=line(29,73,42,78,'#b8efdc',1)+line(71,73,58,78,'#b8efdc',1);
  s+=line(33,92,39,96,'#78e3e7',1)+line(67,92,61,96,'#78e3e7',1);
  s+=polygon('16,54 23,59 21,66 14,63','#f5a969','#60422d',1);
  s+=polygon('84,54 77,59 79,66 86,63','#f5a969','#60422d',1);
  return s;
}

const themes={
  crawler:{spike:'#b98c93',core:'url(#blast)',armor:'url(#shell)',leg:30},
  leaper:{spike:'#e3a48d',core:'url(#blast)',armor:'url(#shell)',leg:40},
  armored:{spike:'#e5c0a3',core:'url(#reactor)',armor:'url(#bone)',leg:26},
  spitter:{spike:'#a2d66c',core:'url(#toxin)',armor:'url(#shell)',leg:31},
  bomber:{spike:'#ff7f93',core:'url(#blast)',armor:'url(#shell)',leg:28},
  broodlord:{spike:'#e7b78a',core:'url(#blast)',armor:'url(#shell)',leg:40},
};
function bug(kind){
  const t=themes[kind];
  let s='';
  const boss=kind==='broodlord',scale=boss?1:0.94;
  // Six separated legs and claws preserve species readability at 50px display.
  for(const side of [-1,1]){
    const sign=side;
    for(let i=0;i<3;i++){
      const y=40+i*22,sideX=50+sign*19;
      const knee=50+sign*(t.leg+(i===1?11:0));
      const end=50+sign*(t.leg+10);
      s+=path('M'+sideX+' '+y+' Q'+knee+' '+(y-11)+' '+knee+' '+(y+4)+' L'+end+' '+(y+19),
        'none','#1c1b2c',8);
      s+=path('M'+sideX+' '+y+' Q'+knee+' '+(y-11)+' '+knee+' '+(y+4)+' L'+end+' '+(y+19),
        'none',t.spike,3.5);
    }
  }
  if(kind==='leaper'){
    s+=polygon('28,43 9,18 21,53 3,64 33,66',t.armor);
    s+=polygon('72,43 91,18 79,53 97,64 67,66',t.armor);
  }
  if(boss){
    s+=polygon('29,28 4,1 11,42 25,55','url(#bone)');
    s+=polygon('71,28 96,1 89,42 75,55','url(#bone)');
    s+=polygon('20,55 1,39 9,83 25,90','url(#shell)');
    s+=polygon('80,55 99,39 91,83 75,90','url(#shell)');
  }
  s+=ellipse(50,65,boss?31:27,boss?40:36,t.armor,'#131424',3);
  s+=path('M23 52 Q50 34 77 52 L70 72 Q50 82 30 72 Z','url(#shell)');
  s+=polygon('50,28 38,43 50,48 62,43','url(#bone)');
  s+=polygon('32,51 50,47 68,51 65,64 50,70 35,64',t.armor);
  s+=line(50,45,50,70,'#ffdcad',1.7);
  s+=line(34,53,50,57,'#d4a1a4',1)+line(66,53,50,57,'#d4a1a4',1);
  s+=ellipse(50,80,kind==='bomber'?18:12,kind==='bomber'?21:12,t.core,'#272b30',2);
  if(kind==='armored'){
    s+=polygon('22,55 50,46 78,55 72,75 50,82 28,75','url(#bone)','#302934',3);
    s+=polygon('50,49 58,63 50,78 42,63','url(#dark)');
    s+=line(30,68,40,72,'#f7dcc7',2)+line(70,68,60,72,'#f7dcc7',2);
  }
  if(kind==='spitter'){
    s+=ellipse(31,74,9,14,'url(#toxin)','#264a2c',1.5);
    s+=ellipse(69,74,9,14,'url(#toxin)','#264a2c',1.5);
    s+=path('M40 81 Q50 106 60 81','none','#b7ff8c',3);
  }
  if(kind==='bomber'){
    s+=ellipse(50,83,18,19,'url(#blast)','#5c253b',3);
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3;
      s+=ellipse(50+Math.cos(a)*12,83+Math.sin(a)*12,2.5,3,'#ffc383','#aa473b',.6);
    }
  }
  if(kind==='leaper'){
    s+=polygon('31,69 21,105 40,91','#f2b2a1');
    s+=polygon('69,69 79,105 60,91','#f2b2a1');
  }
  if(boss){
    s+=polygon('27,64 6,89 26,83 32,101 42,83','url(#bone)');
    s+=polygon('73,64 94,89 74,83 68,101 58,83','url(#bone)');
    s+=ellipse(50,79,16,15,'url(#blast)','#eab28c',2);
  }
  s+=polygon('29,25 40,17 50,22 60,17 71,25 64,40 50,44 36,40',t.armor);
  s+=polygon('33,29 45,30 43,37 32,36',t.core,'#241a28',1);
  s+=polygon('67,29 55,30 57,37 68,36',t.core,'#241a28',1);
  s+=polygon('40,38 50,45 60,38 54,51 46,51','url(#bone)');
  for(const side of [-1,1]){
    const x=50+side*21;
    s+=polygon(x+','+30+' '+(x+side*13)+',7 '+(x+side*9)+',38',t.spike);
  }
  return '<g transform="translate(50,56) scale('+scale+') translate(-50,-56)">'+s+'</g>';
}

for(const dest of targets)await mkdir(dest,{recursive:true});
for(const [key,size] of Object.entries(sizes)){
  const [w,h]=size;
  const data=Buffer.from(svg(w,h,key==='marine'?marine():bug(key)));
  const png=await sharp(data,{density:240}).resize(w*3,h*3).png({compressionLevel:9}).toBuffer();
  for(const dest of targets)await writeFile(join(dest,key+'.png'),png);
  console.log('Vanguard sprite '+key+' '+w*3+'x'+h*3+' ('+png.length+' bytes)');
}
