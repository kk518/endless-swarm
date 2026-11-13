#!/usr/bin/env node
/**
 * Add a bounded, self-contained startup diagnostic to the *real* Creator
 * generated HTML. Never replaces the engine or modifies simulation modules.
 */
import { readFile, writeFile } from 'node:fs/promises';
const indexPath=process.argv[2];
if(!indexPath)throw Error('Usage: node scripts/inject-cocos-startup-guard.mjs <index.html>');
let html=await readFile(indexPath,'utf8');
if(!/<\/head>/i.test(html))throw Error('Creator index lacks </head>');
if(html.includes('id="swarm-startup-guard"'))throw Error('Startup guard already injected');
const guard=`<script id="swarm-startup-guard">
(function () {
  'use strict';
  var errors = [];
  function add(message) {
    if (errors.length >= 5) return;
    errors.push(String(message).slice(0, 150));
  }
  window.addEventListener('error', function (event) {
    var target=event.target;
    if (target && target !== window && target.tagName) {
      var src=target.src || target.href || '';
      var path='';
      try {path=new URL(src,window.location.href).pathname.slice(-100);} catch(_) {}
      add('Resource failed: ' + target.tagName + ' ' + path);
    } else add('Runtime: ' + (event.message || 'unknown'));
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    add('Promise: ' + String(event.reason && event.reason.message || event.reason || 'unknown'));
  });
  function loaded() {
    try {
      return window.__swarmCocosDebug && typeof window.__swarmCocosDebug.state === 'function'
        && window.__swarmCocosDebug.state().initialized === true;
    } catch (_) { return false; }
  }
  function showFailure() {
    if(loaded()) return;
    var layer=document.createElement('div');
    layer.id='swarm-startup-error';
    layer.setAttribute('role','alert');
    layer.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;'+
      'align-items:center;justify-content:center;padding:22px;background:#08141bf2;'+
      'color:#e6eeea;font:14px/1.7 system-ui,-apple-system,sans-serif;text-align:center';
    if(document.getElementById('swarm-startup-error'))return;
    var card=document.createElement('div');
    card.style.cssText='max-width:370px;border:1px solid #648c91;background:#12242c;'+
      'padding:24px 20px;border-radius:12px;box-shadow:0 12px 40px #0009';
    var title=document.createElement('h2');
    title.textContent='游戏启动超时';
    title.style.cssText='font-size:19px;margin:0 0 12px;color:#ffcf8e';
    var description=document.createElement('p');
    description.textContent='Cocos 场景未能正常启动。请点击重试；若仍无法进入，请展开诊断信息并反馈。';
    var detail=document.createElement('pre');
    detail.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;text-align:left;'+
      'font-size:11px;color:#9fbfc6;background:#071820;padding:10px';
    var webgl='unknown';
    try {
      var canvas=document.createElement('canvas');
      webgl=(canvas.getContext('webgl2') || canvas.getContext('webgl'))
        ? 'available' : 'unavailable';
    } catch (_) {webgl='error';}
    detail.textContent='WebGL: '+webgl+String.fromCharCode(10)+(errors.join(String.fromCharCode(10)) || 'No JavaScript error captured');
    var retry=document.createElement('button');
    retry.textContent='重新加载游戏';
    retry.style.cssText='padding:12px 20px;background:#6aebc8;color:#092125;'+
      'border:0;font-weight:700;margin:8px;cursor:pointer';
    retry.onclick=function(){window.location.reload();};
    var copy=document.createElement('button');
    copy.textContent='显示诊断信息';
    copy.style.cssText='padding:12px 16px;background:#264a53;color:white;'+
      'border:1px solid #86bbbc;margin:8px;cursor:pointer';
    copy.onclick=function(){detail.hidden=!detail.hidden;};
    detail.hidden=true;
    card.append(title,description,retry,copy,detail);
    layer.appendChild(card);
    document.body.appendChild(layer);
    // If initialization eventually succeeds, dismiss the timeout UI.
    var check=window.setInterval(function(){
      if(loaded()){window.clearInterval(check);layer.remove();}
    },1000);
  }
  window.setTimeout(function(){
    if(document.body)showFailure();
    else window.addEventListener('DOMContentLoaded',showFailure,{once:true});
  },45000);
})();
</script>`;
html=html.replace(/<\/head>/i,guard+'\n</head>');
await writeFile(indexPath,html);
console.log('Injected Creator startup guard into '+indexPath);
