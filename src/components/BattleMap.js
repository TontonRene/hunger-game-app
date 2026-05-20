/**
 * BattleMap — React Native Skia (sans reanimated)
 * Rendu GPU via Skia PictureRecorder + requestAnimationFrame sur JS thread.
 * Compatible Expo Go SDK 54.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import {
  Canvas, Picture, Skia,
  PaintStyle, FillType,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

// ── Palettes ──────────────────────────────────────────────────────────────
const CHAMP_COLORS = [
  '#e74c3c','#3498db','#2ecc71','#f39c12',
  '#9b59b6','#1abc9c','#e67e22','#ff6b9d',
  '#00b894','#fd79a8','#6c5ce7','#fdcb6e',
  '#e17055','#74b9ff','#a29bfe','#55efc4',
  '#fab1a0','#81ecec','#d63031','#0984e3',
  '#00cec9','#e84393','#b2bec3','#dfe6e9',
];
const SUPPLY_COLORS = {
  soin:'#2ecc71', force:'#e74c3c', vitesse:'#3498db', armure:'#f39c12',
};
const POI_COLORS = {
  loot:'#f39c12', shelter:'#6c6c8a', craft:'#8B6914',
  water:'#1a5276', vision:'#888888', cover:'#1a4a16',
};

const WORLD = 300;
const TC    = 128;

// ── Couleur de terrain par biome ─────────────────────────────────────────
const BIOME_COLORS = {
  'forêt':    { base:'#1a3a1a', accent:'#2d5a27' },
  'désert':   { base:'#5a4a1a', accent:'#8a7a2a' },
  'toundra':  { base:'#2a3a4a', accent:'#4a6a7a' },
  'marais':   { base:'#1a2a1a', accent:'#2a4a2a' },
  'montagne': { base:'#2a2a3a', accent:'#4a4a5a' },
};

// ── Étoiles ───────────────────────────────────────────────────────────────
const STARS = Array.from({length:120},()=>({
  fx:Math.random(), fy:Math.random(),
  r:Math.random()*1.2+0.3, tw:Math.random()*Math.PI*2,
}));

// ── Paint helpers (JS thread, pas worklet) ────────────────────────────────
function mkFill(col){
  const p=Skia.Paint(); p.setColor(Skia.Color(col)); return p;
}
function mkAlpha(col,a){
  const p=Skia.Paint(); p.setColor(Skia.Color(col)); p.setAlphaf(a); return p;
}
function mkStroke(col,w){
  const p=Skia.Paint();
  p.setColor(Skia.Color(col));
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(w);
  return p;
}
function mkStrokeA(col,w,a){
  const p=mkStroke(col,w); p.setAlphaf(a); return p;
}
function baseZoom(W,H){ return Math.min(W,H)/WORLD; }
function clampCam(x,y,W,H,z){
  const hw=W/z/2, hh=H/z/2;
  return {
    x:Math.max(hw,Math.min(WORLD-hw,x)),
    y:Math.max(hh,Math.min(WORLD-hh,y)),
  };
}

// ── Fonction de dessin principal ──────────────────────────────────────────
function drawScene(canvas, t, v, cx, cy, z, fm, fs, W, H){
  const phase   = v.dayPhase||0;
  const isNight = phase>=18;
  const isDusk  = phase>=15&&phase<18;
  const dayFrac = isNight?1:isDusk?(phase-15)/3:0;
  const ox=W/2-cx*z, oy=H/2-cy*z, wPx=WORLD*z;

  // Fond
  canvas.drawColor(Skia.Color(isNight?'#04050e':'#0a0a18'));

  // Terrain (couleur solide par biome)
  const bc = BIOME_COLORS[v.biome] || BIOME_COLORS['forêt'];
  canvas.drawRect(Skia.XYWHRect(ox,oy,wPx,wPx), mkFill(bc.base));
  canvas.drawRect(Skia.XYWHRect(ox+wPx*0.1,oy+wPx*0.1,wPx*0.8,wPx*0.8), mkAlpha(bc.accent,0.4));

  // Overlay nuit
  if(dayFrac>0){
    canvas.drawRect(Skia.XYWHRect(ox,oy,wPx,wPx), mkAlpha('#050a28',dayFrac*0.62));
  }

  // Étoiles
  if(isNight){
    for(let i=0;i<STARS.length;i++){
      const st=STARS[i];
      const a=(0.4+Math.sin(t*1.5+st.tw)*0.35)*dayFrac;
      if(a<=0) continue;
      canvas.drawCircle(st.fx*W, st.fy*H, st.r, mkAlpha('#ffffff',a));
    }
  }

  // Événements actifs
  const ae=v.activeEvent;
  if(ae){
    if(ae.type==='sandstorm')
      canvas.drawRect(Skia.XYWHRect(ox,oy,wPx,wPx),mkAlpha('#c3af5f',0.11+Math.sin(t*2)*0.04));
    if(ae.type==='fog')
      canvas.drawRect(Skia.XYWHRect(0,0,W,H),mkAlpha('#aab9c3',0.18+Math.sin(t*1.5)*0.05));
    if(ae.type==='cold_snap')
      canvas.drawRect(Skia.XYWHRect(0,0,W,H),mkAlpha('#8cb4dc',0.09+Math.sin(t*3)*0.03));
    if(ae.type==='fire'){
      const elapsed=(v.tick||0)-ae.startTick;
      const fr=(ae.radius+elapsed*1.5)*z;
      const fsx=W/2+(ae.x-cx)*z, fsy=H/2+(ae.y-cy)*z;
      canvas.drawCircle(fsx,fsy,fr,   mkAlpha('#ff6400',0.38));
      canvas.drawCircle(fsx,fsy,fr*.6,mkAlpha('#dc2800',0.28));
      canvas.drawCircle(fsx,fsy,fr*.3,mkAlpha('#c80000',0.18));
    }
  }

  // Bordure monde
  canvas.drawRect(Skia.XYWHRect(ox,oy,wPx,wPx), mkStrokeA('#ffffff',2,0.10));

  // POIs
  v.pois.forEach(p=>{
    const sx=W/2+(p.x-cx)*z, sy=H/2+(p.y-cy)*z;
    const rpx=p.radius*z;
    const col=POI_COLORS[p.effect]||'#888888';
    if(p._disabled){ canvas.drawCircle(sx,sy,rpx*0.4,mkAlpha('#888888',0.3)); return; }
    canvas.drawCircle(sx,sy,rpx,mkAlpha(col,0.12));
    const rp=mkStrokeA(col,1.5,0.6);
    rp.setPathEffect(Skia.PathEffect.MakeDash([5,4]));
    canvas.drawCircle(sx,sy,rpx,rp);
  });

  // Zone (donut EvenOdd)
  const zone=v.zone;
  if(zone){
    const zcx=W/2+(zone.cx-cx)*z, zcy=H/2+(zone.cy-cy)*z;
    const rpx=zone.radius*z;
    const zonePath=Skia.Path.Make();
    zonePath.addRect(Skia.XYWHRect(0,0,W,H));
    zonePath.addCircle(zcx,zcy,rpx);
    zonePath.setFillType(FillType.EvenOdd);
    canvas.drawPath(zonePath,mkAlpha(isNight?'#b40000':'#c80000',isNight?0.22:0.14));
    const pulse=0.5+Math.sin(t*3.5)*0.3;
    const rp=mkStroke('#ff3c3c',2.5);
    rp.setAlphaf(pulse);
    rp.setPathEffect(Skia.PathEffect.MakeDash([7,4]));
    canvas.drawCircle(zcx,zcy,rpx,rp);
  }

  // Lignes d'alliance
  v.alliances.forEach(al=>{
    const c1=v.champions.find(c=>c.id===al.ids[0]);
    const c2=v.champions.find(c=>c.id===al.ids[1]);
    if(!c1||!c2||c1.isDead||c2.isDead) return;
    const alPath=Skia.Path.Make();
    alPath.moveTo(W/2+(c1.x-cx)*z, H/2+(c1.y-cy)*z);
    alPath.lineTo(W/2+(c2.x-cx)*z, H/2+(c2.y-cy)*z);
    const alP=mkStrokeA('#e2b96f',1.5,0.35);
    alP.setPathEffect(Skia.PathEffect.MakeDash([4,4]));
    canvas.drawPath(alPath,alP);
  });

  // Pièges
  if(z>0.8){
    v.traps.forEach(trap=>{
      const sx=W/2+(trap.x-cx)*z, sy=H/2+(trap.y-cy)*z;
      const sz=Math.max(4,z*2);
      const tp=mkStrokeA('#ffcc00',1.5,0.7);
      const xp=Skia.Path.Make();
      xp.moveTo(sx-sz,sy-sz);xp.lineTo(sx+sz,sy+sz);
      xp.moveTo(sx+sz,sy-sz);xp.lineTo(sx-sz,sy+sz);
      canvas.drawPath(xp,tp);
    });
  }

  // Colis
  v.supplies.forEach(s=>{
    const sx=W/2+(s.x-cx)*z, sy=H/2+(s.y-cy)*z;
    const r=Math.max(4,z*1.8);
    const col=SUPPLY_COLORS[s.type]||'#ffffff';
    canvas.drawCircle(sx,sy,r*3,mkAlpha(col,0.22));
    canvas.save();
    canvas.translate(sx,sy);
    canvas.rotate(t*28);
    const dp=Skia.Path.Make();
    dp.moveTo(0,-r);dp.lineTo(r,0);dp.lineTo(0,r);dp.lineTo(-r,0);dp.close();
    canvas.drawPath(dp,mkFill(col));
    canvas.restore();
  });

  // Feux de camp
  v.champions.filter(cv=>!cv.isDead&&cv.mentalState==='campfire').forEach(cv=>{
    const sx=W/2+(cv.x-cx)*z, sy=H/2+(cv.y-cy)*z;
    const fr=Math.max(4,z*2.5);
    canvas.drawCircle(sx,sy,fr*6,mkAlpha('#ff8800',0.18+Math.sin(t*2)*0.05));
    const flick=0.8+Math.sin(t*7+cv.idx)*0.22;
    canvas.save();
    canvas.translate(sx,sy);
    const fPath=Skia.Path.Make();
    const fw=fr*0.7*flick, fh=fr*1.3*flick;
    fPath.addOval(Skia.XYWHRect(-fw,-fh,fw*2,fh*2));
    canvas.drawPath(fPath,mkAlpha('#ff8800',0.8));
    canvas.restore();
  });

  // Champions
  v.champions.forEach(cv=>{
    const sx=W/2+(cv.x-cx)*z, sy=H/2+(cv.y-cy)*z;
    const r=Math.max(4,z*2.5);

    if(cv.isDead){
      canvas.drawCircle(sx,sy,r,mkAlpha('#555555',0.28));
      const xPath=Skia.Path.Make();
      xPath.moveTo(sx-r*.6,sy-r*.6);xPath.lineTo(sx+r*.6,sy+r*.6);
      xPath.moveTo(sx+r*.6,sy-r*.6);xPath.lineTo(sx-r*.6,sy+r*.6);
      canvas.drawPath(xPath,mkStrokeA('#333333',r*0.4,0.28));
      return;
    }

    const baseA=cv.hasCamo?0.35:1.0;

    // Ombre
    canvas.drawCircle(sx,sy+r*.55,r*.65,mkAlpha('#000000',0.28*baseA));

    // Flash combat
    if(cv.combatFlash>0)
      canvas.drawCircle(sx,sy,r*2.5,mkAlpha('#ff4444',cv.combatFlash*0.38));

    // Ring
    const isFollowed=v.followId===cv.id;
    const ringCol=isFollowed?'#e2b96f':cv.combatFlash>0?'#ff2222':cv.color;
    const ringW  =isFollowed?2.8:cv.combatFlash>0?3:1.5;
    const ringA  =(isFollowed||cv.combatFlash>0?1.0:0.55)*baseA;
    canvas.drawCircle(sx,sy,r+2.5,mkStrokeA(ringCol,ringW,ringA));

    // Corps
    canvas.drawCircle(sx,sy,r,mkAlpha(cv.color,baseA));

    // Tête (bob)
    const bob=Math.sin(t*3+cv.idx)*.5;
    canvas.drawCircle(sx,sy-r*.22+bob,r*.34,mkAlpha(cv.color,0.75*baseA));

    // Statuts
    let seX=sx-r*1.5;
    cv.se.forEach(seType=>{
      const seCol=seType==='poison'?'#00ff88':seType==='bleed'?'#ff2244':'#f39c12';
      canvas.drawCircle(seX,sy-r-5,3,mkAlpha(seCol,0.8*baseA));
      seX+=8;
    });

    // Barre HP
    const bw=r*3.2, bh=Math.max(3,r*.44);
    const bx=sx-bw/2, by=sy-r-bh-3;
    canvas.drawRect(Skia.XYWHRect(bx-1,by-1,bw+2,bh+2),mkAlpha('#000000',0.72));
    const hp=Math.max(0,cv.hp/cv.maxHp);
    const barC=hp>.6?'#2ecc71':hp>.3?'#f39c12':'#e74c3c';
    canvas.drawRect(Skia.XYWHRect(bx,by,bw*hp,bh),mkFill(barC));

    // Nom
    if(z>1.05&&fm){
      const approxW=cv.name.length*5.5;
      canvas.drawText(cv.name, sx-approxW/2, by-3, mkAlpha('#ffffff',0.88*baseA), fm);
    }

    // Badge état mental
    const msIcon=cv.mentalState==='berserk'?'!':cv.mentalState==='exhausted'?'~':
                  cv.mentalState==='traumatized'?'?':'';
    if(msIcon&&z>0.85&&fs){
      canvas.drawText(msIcon,sx+r+1,sy-r,
        mkAlpha(cv.mentalState==='berserk'?'#ff4444':'#f39c12',0.9),fs);
    }

    // Alliance badge
    if(cv.inAlliance&&z>0.75&&fs){
      canvas.drawCircle(sx-r-2,sy+r,3,mkAlpha('#e2b96f',0.8));
    }
  });

  // HUD
  if(fm){
    const dayLbl=`J${Math.floor((v.tick||0)/24)+1}  ${v.biome?.toUpperCase()||''}`;
    canvas.drawText(dayLbl,8,16,mkAlpha('#ffffff',0.38),fm);
  }

  // Minimap
  const MM=78, MMP=8;
  const mmx=MMP, mmy=H-MM-MMP;
  const sc=MM/WORLD;
  canvas.drawRect(Skia.XYWHRect(mmx-1,mmy-1,MM+2,MM+2),mkAlpha('#000000',0.75));
  const mmbc = BIOME_COLORS[v.biome] || BIOME_COLORS['forêt'];
  canvas.drawRect(Skia.XYWHRect(mmx,mmy,MM,MM),mkFill(mmbc.base));
  if(dayFrac>0)
    canvas.drawRect(Skia.XYWHRect(mmx,mmy,MM,MM),mkAlpha('#050a28',dayFrac*0.52));
  if(zone){
    canvas.drawCircle(mmx+zone.cx*sc,mmy+zone.cy*sc,zone.radius*sc,mkStrokeA('#ff3c3c',1,0.55));
  }
  v.alliances.forEach(al=>{
    const c1=v.champions.find(c=>c.id===al.ids[0]);
    const c2=v.champions.find(c=>c.id===al.ids[1]);
    if(!c1||!c2||c1.isDead||c2.isDead) return;
    const alPath=Skia.Path.Make();
    alPath.moveTo(mmx+c1.x*sc,mmy+c1.y*sc);
    alPath.lineTo(mmx+c2.x*sc,mmy+c2.y*sc);
    canvas.drawPath(alPath,mkStrokeA('#e2b96f',0.7,0.3));
  });
  v.champions.forEach(cv=>{
    const mmr=cv.isDead?1.0:2.2;
    canvas.drawCircle(mmx+cv.x*sc,mmy+cv.y*sc,mmr,mkFill(cv.isDead?'#333333':cv.color));
    if(v.followId===cv.id&&!cv.isDead)
      canvas.drawCircle(mmx+cv.x*sc,mmy+cv.y*sc,mmr+1.5,mkStrokeA('#ffffff',1,0.9));
  });
  const vw=(W/z)*sc, vh=(H/z)*sc;
  const vx=mmx+(cx-W/(2*z))*sc, vy=mmy+(cy-H/(2*z))*sc;
  canvas.drawRect(Skia.XYWHRect(vx,vy,vw,vh),mkStrokeA('#ffffff',1,0.45));
  canvas.drawRect(Skia.XYWHRect(mmx-1,mmy-1,MM+2,MM+2),mkStrokeA('#ffffff',1,0.22));
}

// ═════════════════════════════════════════════════════════════════════════
export default function BattleMap({ battleState, onChampionTap }) {
  const { width:W, height:H } = useWindowDimensions();

  // ── État caméra (refs — pas de re-render sur chaque gesture) ─────────────
  const camX     = useRef(WORLD/2);
  const camY     = useRef(WORLD/2);
  const zoom      = useRef(Math.min(W,H)/WORLD);
  const timeRef   = useRef(0);
  const lastTs    = useRef(null);
  const savedCam  = useRef({x:WORLD/2,y:WORLD/2});
  const savedZoom = useRef(1);

  // ── État visuel (ref mutable — sync depuis battleState) ──────────────────
  const gvisRef = useRef({
    champions:[], zone:{cx:150,cy:150,radius:185},
    alliances:[], activeEvent:null, dayPhase:0, tick:0,
    traps:[], supplies:[], pois:[], biome:'forêt', followId:null,
  });

  // ── Polices (lazy — Skia.Font(null) crash iOS en v2.x) ───────────────────
  const fontSmRef  = useRef(null);
  const fontMidRef = useRef(null);
  useEffect(()=>{
    try { fontSmRef.current  = Skia.Font(undefined,9);  } catch(e){}
    try { fontMidRef.current = Skia.Font(undefined,11); } catch(e){}
  },[]);

  // ── Skia Picture (mis à jour chaque frame via RAF) ────────────────────────
  const [picture, setPicture] = useState(null);
  const rafRef = useRef(null);

  useEffect(()=>{
    const animate=(ts)=>{
      const delta = lastTs.current!==null ? ts-lastTs.current : 16;
      lastTs.current=ts;
      timeRef.current=ts/1000;
      const lf=1-Math.pow(0.88,delta/16.67);
      const z=zoom.current;

      // Follow mode
      const fId=gvisRef.current.followId;
      if(fId){
        const fc=gvisRef.current.champions.find(cv=>cv.id===fId&&!cv.isDead);
        if(fc){
          const nx=camX.current+(fc.x-camX.current)*0.09;
          const ny=camY.current+(fc.y-camY.current)*0.09;
          const c=clampCam(nx,ny,W,H,z);
          camX.current=c.x; camY.current=c.y;
        }
      }

      // Lerp positions
      gvisRef.current.champions.forEach(cv=>{
        cv.x+=(cv.tx-cv.x)*lf;
        cv.y+=(cv.ty-cv.y)*lf;
        if(cv.combatFlash>0) cv.combatFlash=Math.max(0,cv.combatFlash-delta/1000);
      });

      // Enregistrement Skia
      const recorder=Skia.PictureRecorder();
      const canvas=recorder.beginRecording(Skia.XYWHRect(0,0,W,H));
      drawScene(
        canvas, timeRef.current, gvisRef.current,
        camX.current, camY.current, z,
        fontMidRef.current, fontSmRef.current, W, H
      );
      setPicture(recorder.finishRecordingAsPicture());

      rafRef.current=requestAnimationFrame(animate);
    };
    rafRef.current=requestAnimationFrame(animate);
    return ()=>{ if(rafRef.current) cancelAnimationFrame(rafRef.current); };
  },[W,H]);

  // ── Sync depuis battleState ───────────────────────────────────────────────
  useEffect(()=>{
    if(!battleState) return;
    const prevMap=new Map((gvisRef.current.champions||[]).map(cv=>[cv.id,cv]));
    const champs=(battleState.champions||[]).map((c,i)=>{
      const ex=prevMap.get(c.id);
      return {
        id:c.id,
        x:ex?ex.x:c.x, y:ex?ex.y:c.y,
        tx:c.x, ty:c.y,
        hp:c.hp, maxHp:c.maxHp,
        color:c.color||CHAMP_COLORS[i%CHAMP_COLORS.length],
        isDead:c.hp<=0,
        combatFlash:ex?ex.combatFlash:0,
        name:c.name, idx:i,
        mentalState:c._mentalState||'normal',
        hasCamo:(c.buffs||[]).some(b=>b.special==='camo'),
        se:(c.statusEffects||[]).map(s=>s.type),
        inAlliance:(battleState.alliances||[]).some(al=>al.ids.includes(c.id)),
      };
    });
    (battleState.events||[]).slice(-20).forEach(ev=>{
      if(ev.type==='combat')[ev.a,ev.b].forEach(id=>{
        const cv=champs.find(c=>c.id===id); if(cv) cv.combatFlash=0.75;
      });
    });
    gvisRef.current={
      champions:champs,
      zone:     battleState.map?.zone||{cx:150,cy:150,radius:185},
      alliances:battleState.alliances||[],
      activeEvent:battleState.activeEvent||null,
      dayPhase: battleState.dayPhase||0,
      tick:     battleState.tick||0,
      traps:    battleState.map?.traps||[],
      supplies: battleState.map?.supplies||[],
      pois:     battleState.map?.pois||[],
      biome:    battleState.map?.biome||'forêt',
      followId: gvisRef.current.followId,
    };
  },[battleState]);

  // ── Tap handler (JS thread) ───────────────────────────────────────────────
  const handleTap=useCallback((ex,ey)=>{
    const v=gvisRef.current;
    const cx2=camX.current, cy2=camY.current, z2=zoom.current;
    for(const cv of v.champions){
      if(cv.isDead) continue;
      const sx=W/2+(cv.x-cx2)*z2, sy=H/2+(cv.y-cy2)*z2;
      if(Math.hypot(ex-sx,ey-sy)<Math.max(12,z2*3.5)){
        gvisRef.current.followId=gvisRef.current.followId===cv.id?null:cv.id;
        if(onChampionTap) onChampionTap(cv.id);
        return;
      }
    }
    const MM=78,MMP=8,mmy=H-MM-MMP;
    if(ex>=MMP&&ex<=MMP+MM&&ey>=mmy&&ey<=mmy+MM){
      const sc=MM/WORLD;
      camX.current=(ex-MMP)/sc; camY.current=(ey-mmy)/sc;
      return;
    }
    gvisRef.current.followId=null;
  },[W,H,onChampionTap]);

  // ── Gestes (JS thread — runOnJS(true)) ───────────────────────────────────
  const panGesture=Gesture.Pan()
    .onStart(()=>{ savedCam.current={x:camX.current,y:camY.current}; })
    .onUpdate(e=>{
      const c=clampCam(
        savedCam.current.x-e.translationX/zoom.current,
        savedCam.current.y-e.translationY/zoom.current,
        W,H,zoom.current
      );
      camX.current=c.x; camY.current=c.y;
      gvisRef.current.followId=null;
    })
    .runOnJS(true);

  const pinchGesture=Gesture.Pinch()
    .onStart(()=>{ savedZoom.current=zoom.current; })
    .onUpdate(e=>{
      const bz=baseZoom(W,H);
      const wx=camX.current+(e.focalX-W/2)/zoom.current;
      const wy=camY.current+(e.focalY-H/2)/zoom.current;
      const nz=Math.max(bz*0.98,Math.min(9,savedZoom.current*e.scale));
      zoom.current=nz;
      const c=clampCam(wx-(e.focalX-W/2)/nz,wy-(e.focalY-H/2)/nz,W,H,nz);
      camX.current=c.x; camY.current=c.y;
    })
    .runOnJS(true);

  const doubleTap=Gesture.Tap().numberOfTaps(2)
    .onEnd(()=>{
      zoom.current=baseZoom(W,H);
      camX.current=WORLD/2; camY.current=WORLD/2;
      gvisRef.current.followId=null;
    })
    .runOnJS(true);

  const singleTap=Gesture.Tap()
    .onEnd(e=>{ handleTap(e.x,e.y); })
    .runOnJS(true);

  const gesture=Gesture.Simultaneous(
    panGesture, pinchGesture,
    Gesture.Exclusive(doubleTap,singleTap)
  );

  return (
    <GestureDetector gesture={gesture}>
      <Canvas style={StyleSheet.absoluteFill}>
        {picture && <Picture picture={picture}/>}
      </Canvas>
    </GestureDetector>
  );
}
