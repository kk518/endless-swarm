/**
 * Actual Creator Sprite presenter for the PNGs re-exported from main/Art.ts.
 * Artwork is a pure render layer; gameplay state and hitboxes are unchanged.
 * If an asset is still loading/missing, PocBattle's Graphics fallback remains.
 */
import { Node, Sprite, SpriteFrame, Texture2D, UITransform, resources, Color } from 'cc';
import type { PocState, PocEnemyKind } from './PocWorld.ts';
import type { PocHeroId } from './PocRoster.ts';
import type { WeaponId } from './m6/progression.ts';
import { buildWeaponRig } from './PocWeaponRig.ts';

const VANGUARD_KEYS=new Set(['marine','crawler','leaper','armored','spitter','bomber','broodlord']);
const ENEMY_ART: Record<PocEnemyKind,string> = {
  grunt:'crawler', leaper:'leaper', armored:'armored',
  spitter:'spitter', bomber:'bomber', boss:'broodlord',
};
const DIMENSIONS: Record<string, readonly [number, number]> = {
  marine:[76,100],rifle:[66,22],crawler:[58,64],leaper:[68,74],
  armored:[74,76],spitter:[70,76],bomber:[68,72],broodlord:[114,120],
  supply:[54,54],'mount-scatter':[58,26],'mount-arc':[56,30],
  'mount-flame':[62,26],'muzzle-flash':[64,52],bolt:[34,12],acid:[26,26],
  dust:[128,128],
};
export class PocArtSprites {
  private readonly frames=new Map<string,SpriteFrame>();
  private readonly pending=new Set<string>();
  private readonly vanguardReady=new Set<string>();
  private readonly enemies=new Map<number,Sprite>();
  // Renderer-only health sampling: no damage, hitbox or RNG changes.
  private readonly enemyLastHp=new Map<number,number>();
  private readonly enemyHitUntil=new Map<number,number>();
  private lastFrameTimeMs=-1;
  private readonly weapons=new Map<WeaponId,Sprite>();
  private readonly evolutionGlows=new Map<WeaponId,Sprite>();
  private readonly supplies: Sprite[]=[];
  private readonly acid: Sprite[]=[];
  private readonly muzzleFlashes: Sprite[]=[];
  private readonly player: Sprite;
  private readonly floor: Sprite;
  private readonly enemyLayer: Node;
  private readonly pickupLayer: Node;
  private readonly playerLayer: Node;
  private readonly evolutionLayer: Node;
  private readonly weaponLayer: Node;
  private readonly projectileLayer: Node;
  constructor(private readonly root:Node, floorRoot:Node){
    this.floor=this.create(floorRoot,'MainDustTiles');
    this.floor.node.setPosition(0,0,0);
    this.floor.type=Sprite.Type.TILED;
    // Explicit front-to-back ordering: enemy silhouettes never cover the
    // marine, while attached guns and hostile projectiles stay readable.
    // All layers inherit the same M5.3 world transform from root.
    this.enemyLayer=this.layer('MainEnemyLayer');
    this.pickupLayer=this.layer('MainPickupLayer');
    this.playerLayer=this.layer('MainPlayerLayer');
    this.evolutionLayer=this.layer('MainEvolutionLayer');
    this.weaponLayer=this.layer('MainWeaponLayer');
    this.projectileLayer=this.layer('MainProjectileLayer');
    this.player=this.create(this.playerLayer,'MainMarineSprite');
    for(const key of Object.keys(DIMENSIONS))this.load(key);
  }
  private layer(name:string):Node{
    const node=new Node(name);
    this.root.addChild(node);
    return node;
  }
  ready(key:string):boolean{return this.frames.has(key);}
  enhanced(key:string):boolean{return this.vanguardReady.has(key);}
  enemyKey(kind:PocEnemyKind):string{return ENEMY_ART[kind];}
  private create(parent:Node,name:string):Sprite{
    const node=new Node(name);parent.addChild(node);
    return node.addComponent(Sprite);
  }
  private load(key:string):void{
    if(this.pending.has(key))return;
    this.pending.add(key);
    // Layered original vanguard silhouettes are the default for all characters.
    // Source art remains available as a safe fallback if a texture is missing.
    if(VANGUARD_KEYS.has(key)){
      resources.load('vanguard-art/'+key+'/texture',Texture2D,(err,texture)=>{
        if(!err&&texture){
          this.installFrame(key,texture);
          this.vanguardReady.add(key);
        }else this.loadOriginal(key);
      });
    }else this.loadOriginal(key);
  }
  private installFrame(key:string,texture:Texture2D):void{
    const frame=new SpriteFrame();
    frame.texture=texture;
    this.frames.set(key,frame);
  }
  private loadOriginal(key:string):void{
    // Creator 3.8.8 imports generated PNGs as Texture2D sub-assets.
    resources.load('main-art/'+key+'/texture',Texture2D,(err,texture)=>{
      if(err||!texture){console.warn('Art texture unavailable:',key,err);return;}
      this.installFrame(key,texture);
    });
  }
  private assign(sprite:Sprite,key:string,width:number,height:number):boolean{
    const frame=this.frames.get(key);
    if(!frame){sprite.node.active=false;return false;}
    if(sprite.spriteFrame!==frame)sprite.spriteFrame=frame;
    sprite.sizeMode=Sprite.SizeMode.CUSTOM;
    sprite.node.getComponent(UITransform)!.setContentSize(width,height);
    sprite.node.active=true;
    return true;
  }
  resizeFloor(w:number,h:number):void{
    if(this.assign(this.floor,'dust',w,h))this.floor.node.setPosition(0,0,0);
  }
  sync(s:PocState,hero:PocHeroId,width:number,height:number):void{
    // A fresh run may restart the clock while reusing enemy numeric IDs.
    if(s.elapsedMs<this.lastFrameTimeMs){
      this.enemyLastHp.clear();
      this.enemyHitUntil.clear();
    }
    this.lastFrameTimeMs=s.elapsedMs;
    this.resizeFloor(width,height);
    if(this.assign(this.player,'marine',68,90)){
      this.player.node.setPosition(s.player.x,s.player.y+11,0);
      this.player.color=hero==='kane'?new Color(255,207,159,255):Color.WHITE;
      this.player.node.angle=0;
    }
    const living=new Set<number>();
    for(const e of s.enemies){
      living.add(e.id);
      let sprite=this.enemies.get(e.id);
      if(!sprite){sprite=this.create(this.enemyLayer,'MainBug-'+e.id);this.enemies.set(e.id,sprite);}
      const priorHp=this.enemyLastHp.get(e.id);
      if(priorHp!==undefined&&e.hp<priorHp)
        this.enemyHitUntil.set(e.id,s.elapsedMs+130);
      this.enemyLastHp.set(e.id,e.hp);
      const key=this.enemyKey(e.kind??'grunt');
      const scale=e.kind==='boss'?1.0:e.kind==='armored'?.85:e.kind==='leaper'?.8:.75;
      const dims=DIMENSIONS[key];
      if(this.assign(sprite,key,dims[0]*scale,dims[1]*scale)){
        sprite.node.setPosition(e.x,e.y+10,0);
        const damaged=(this.enemyHitUntil.get(e.id)??0)>s.elapsedMs;
        const elitePulse=.83+.17*Math.sin(s.elapsedMs/190);
        sprite.color=damaged?new Color(255,165,165,255)
          :e.elite?new Color(255,Math.round(170+46*elitePulse),
            Math.round(116+38*elitePulse),255):Color.WHITE;
        sprite.node.setScale(damaged?1.09:e.elite?1+.045*elitePulse:1,
          damaged?1.09:e.elite?1+.045*elitePulse:1,1);
      }
    }
    for(const [id,sprite]of this.enemies)if(!living.has(id)){
      sprite.node.destroy();this.enemies.delete(id);
      this.enemyLastHp.delete(id);this.enemyHitUntil.delete(id);
    }
    const mounted=new Set<WeaponId>();
    const rig=buildWeaponRig({player:s.player,deployed:s.player.deployed,
      weapons:s.weapons,weaponAim:s.weaponAim,weaponLevels:s.weaponLevels,
      evolved:s.evolved,visualTier:s.visualTier,timeMs:s.elapsedMs});
    for(const mount of rig){
      mounted.add(mount.id);
      // Evolution energy remains behind the weapon sprite, independent of
      // Graphics drawing order and without changing any combat parameters.
      let glow=this.evolutionGlows.get(mount.id);
      if(mount.evolved){
        if(!glow){
          glow=this.create(this.evolutionLayer,'MainEvolution-'+mount.id);
          this.evolutionGlows.set(mount.id,glow);
        }
        const size=35+mount.level*3;
        if(this.assign(glow,'muzzle-flash',size,size)){
          const phase=.5+.5*Math.sin(s.elapsedMs/180);
          const alpha=Math.round(75+100*phase);
          glow.color=new Color((mount.tint>>16)&255,(mount.tint>>8)&255,
            mount.tint&255,alpha);
          glow.node.setPosition(mount.anchor.x,mount.anchor.y+8,0);
          glow.node.angle=mount.angle*180/Math.PI;
          const pulse=.94+.12*phase;
          glow.node.setScale(pulse,pulse,1);
        }
      }else if(glow){
        glow.node.destroy();
        this.evolutionGlows.delete(mount.id);
      }
      let sprite=this.weapons.get(mount.id);
      if(!sprite){sprite=this.create(this.weaponLayer,'MainMount-'+mount.id);this.weapons.set(mount.id,sprite);}
      const key=mount.id==='rifle'?'rifle':'mount-'+mount.id;
      const dims=DIMENSIONS[key];
      if(this.assign(sprite,key,dims[0]*.82,dims[1]*.82)){
        const offset=mount.id==='rifle'?20:dims[0]*.33;
        sprite.node.setPosition(mount.anchor.x+Math.cos(mount.angle)*offset,
          mount.anchor.y+Math.sin(mount.angle)*offset+8,0);
        sprite.node.angle=mount.angle*180/Math.PI;
      }
    }
    for(const [id,sprite]of this.weapons)if(!mounted.has(id)){
      sprite.node.destroy();this.weapons.delete(id);
      const glow=this.evolutionGlows.get(id);
      if(glow){glow.node.destroy();this.evolutionGlows.delete(id);}
    }
    this.syncTransient(this.supplies,s.supplies,'supply',30,30,10,this.pickupLayer);
    this.syncTransient(this.acid,s.acids,'acid',18,18,8,this.projectileLayer);
    this.syncMuzzleFlashes(s.shots);
  }
  /** Reuse pooled flash sprites; simulation controls position, aim and lifetime. */
  private syncMuzzleFlashes(shots:PocState['shots']):void{
    while(this.muzzleFlashes.length<shots.length)
      this.muzzleFlashes.push(this.create(this.projectileLayer,'MainMuzzleFlash'));
    for(let i=0;i<this.muzzleFlashes.length;i++){
      const sprite=this.muzzleFlashes[i];
      sprite.node.active=i<shots.length;
      if(i>=shots.length)continue;
      const shot=shots[i];
      const size=shot.source==='scatter'?34:shot.source==='flame'?38:28;
      if(!this.assign(sprite,'muzzle-flash',size,size*.8))continue;
      sprite.node.setPosition(shot.x,shot.y+8,0);
      sprite.node.angle=shot.angle*180/Math.PI;
      const fade=Math.max(0,Math.min(1,shot.remainingMs/95));
      const tint=shot.source==='arc'?new Color(151,208,255,Math.round(255*fade))
        :shot.source==='flame'?new Color(255,146,87,Math.round(255*fade))
        :shot.source==='scatter'?new Color(255,190,126,Math.round(255*fade))
        :new Color(255,230,178,Math.round(255*fade));
      sprite.color=tint;
    }
  }
  private syncTransient(pool:Sprite[],items:readonly {x:number;y:number}[],
    key:string,w:number,h:number,vertical:number,parent:Node):void{
    while(pool.length<items.length)pool.push(this.create(parent,'Main-'+key));
    for(let i=0;i<pool.length;i++){
      const sprite=pool[i];
      sprite.node.active=i<items.length;
      if(i<items.length&&this.assign(sprite,key,w,h))
        sprite.node.setPosition(items[i].x,items[i].y+vertical,0);
    }
  }
  dispose():void{
    for(const sprite of [...this.enemies.values(),...this.weapons.values(),
      ...this.evolutionGlows.values(),...this.supplies,...this.acid,...this.muzzleFlashes])
      sprite.node.destroy();
    this.enemies.clear();this.enemyLastHp.clear();this.enemyHitUntil.clear();
    this.vanguardReady.clear();
    this.lastFrameTimeMs=-1;
    this.weapons.clear();this.evolutionGlows.clear();this.supplies.length=0;this.acid.length=0;this.muzzleFlashes.length=0;
    for(const layer of [this.enemyLayer,this.pickupLayer,this.playerLayer,
      this.evolutionLayer,this.weaponLayer,this.projectileLayer])layer.destroy();
    this.floor.node.destroy();
  }
}
