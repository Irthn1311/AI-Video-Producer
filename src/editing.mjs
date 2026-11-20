/**
 * Declarative, portable editing contract inspired by the proven MathMate timeline.
 * This module is pure: no FFmpeg, cloud APIs, React, or filesystem side effects.
 */
const finite=(v,min,max,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(label+' must be a finite number between '+min+' and '+max);};
const text=(v,max,label)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(label+' must be nonempty text up to '+max+' characters');};
const assetName=(v)=>{if(typeof v!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v))throw Error('Invalid scene edit asset name');return v;};
const sourceName=(v)=>{if(v==='capture'||v===undefined)return 'capture';if(typeof v==='string'&&v.startsWith('asset:'))return 'asset:'+assetName(v.slice(6));throw Error('Shot source must be capture or asset:NAME');};
const placements=new Set(['top-left','top-right','bottom-left','bottom-right','center']);
const optional=(v,min,max,label)=>{if(v!==undefined)finite(v,min,max,label);};

export function editAssetNames(edit){
  if(!edit)return [];
  const names=new Set();
  for(const s of edit.shots||[]){const source=sourceName(s.source);if(source.startsWith('asset:'))names.add(source.slice(6));}
  for(const s of edit.insets||[])names.add(assetName(s.asset));
  return [...names].sort();
}

export function validateSceneEdit(scene){
  const edit=scene.edit;
  if(edit===undefined)return;
  if(!edit||typeof edit!=='object'||Array.isArray(edit))throw Error('scene.edit must be an object');
  const duration=scene.durationSec;
  finite(duration,1,900,'scene.durationSec');
  if(edit.chapter!==undefined)text(edit.chapter,160,'edit.chapter');
  if(edit.shots!==undefined){
    if(!Array.isArray(edit.shots)||edit.shots.length===0||edit.shots.length>40)throw Error('edit.shots must contain 1–40 shots');
    let total=0;
    for(const [i,s] of edit.shots.entries()){
      const key='edit.shots['+i+']';
      if(!s||typeof s!=='object'||Array.isArray(s))throw Error(key+' must be an object');
      sourceName(s.source);finite(s.durationSec,0.05,900,key+'.durationSec');total+=s.durationSec;
      optional(s.trimStartSec,0,3600,key+'.trimStartSec');
      optional(s.trimEndSec,0.05,3600,key+'.trimEndSec');
      if(s.trimEndSec!==undefined&&s.trimEndSec<=(s.trimStartSec||0))throw Error(key+'.trimEndSec must exceed trimStartSec');
      optional(s.playbackRate,0.25,4,key+'.playbackRate');
      optional(s.zoom,0.5,3,key+'.zoom');
      if(s.focus!==undefined){
        if(!s.focus||typeof s.focus!=='object'||Array.isArray(s.focus))throw Error(key+'.focus must be {x,y}');
        finite(s.focus.x,0,1,key+'.focus.x');finite(s.focus.y,0,1,key+'.focus.y');
      }
      if(s.label!==undefined)text(s.label,120,key+'.label');
    }
    if(total>duration+0.001)throw Error('Sum of edit.shots durations exceeds scene.durationSec');
  }
  if(edit.callouts!==undefined){
    if(!Array.isArray(edit.callouts)||edit.callouts.length>30)throw Error('edit.callouts must be an array of at most 30');
    for(const [i,c] of edit.callouts.entries()){
      const k='edit.callouts['+i+']';
      if(!c||typeof c!=='object'||Array.isArray(c))throw Error(k+' must be an object');
      text(c.text,240,k+'.text');finite(c.startSec,0,duration,k+'.startSec');
      finite(c.durationSec,0.05,900,k+'.durationSec');
      if(c.startSec+c.durationSec>duration+0.001)throw Error(k+' exceeds scene duration');
      if(c.position!==undefined&&!placements.has(c.position))throw Error(k+'.position is unsupported');
    }
  }
  if(edit.insets!==undefined){
    if(!Array.isArray(edit.insets)||edit.insets.length>4)throw Error('edit.insets must be an array of at most 4');
    for(const [i,v] of edit.insets.entries()){
      const k='edit.insets['+i+']';
      if(!v||typeof v!=='object'||Array.isArray(v))throw Error(k+' must be an object');
      assetName(v.asset);
      finite(v.startSec,0,duration,k+'.startSec');finite(v.durationSec,0.05,900,k+'.durationSec');
      if(v.startSec+v.durationSec>duration+0.001)throw Error(k+' exceeds scene duration');
      finite(v.x,0,1,k+'.x');finite(v.y,0,1,k+'.y');
      finite(v.width,0.05,1,k+'.width');finite(v.height,0.05,1,k+'.height');
      if(v.x+v.width>1.00001||v.y+v.height>1.00001)throw Error(k+' extends outside the video frame');
      optional(v.trimStartSec,0,3600,k+'.trimStartSec');
      optional(v.playbackRate,0.25,4,k+'.playbackRate');
      if(v.label!==undefined)text(v.label,100,k+'.label');
    }
  }
}

const frames=(sec,fps)=>Math.max(1,Math.round(sec*fps));
function compileMedia(spec,source,slotFrames,fps,tail=0){
  const start=spec.trimStartSec||0;
  const end=Math.min(source.durationSec,spec.trimEndSec??source.durationSec);
  if(end<=start)throw Error('Requested source trim is outside '+source.file);
  const rate=spec.playbackRate||1;
  // The additional tail is always a held frame, never previously unseen footage.
  const playFrames=Math.max(1,Math.min(slotFrames,Math.floor((end-start)*fps/rate+1e-6)));
  const holdFrames=slotFrames-playFrames+tail;
  const freezeSourceTime=Math.min(end-1/fps,Math.max(start,start+(playFrames-1)*rate/fps));
  return {
    file:source.file,playbackRate:rate,trimBefore:Math.round(start*fps),
    playFrames,holdFrames,freezeFrame:Math.max(0,Math.floor(freezeSourceTime*fps)),
    durationFrames:slotFrames+tail
  };
}

/**
 * sources = {'capture':{file:'footage/capture.mp4',durationSec:12.3},
 *            'asset:mobile':{file:'footage/mobile.mp4',durationSec:15}}
 * All URLs/paths are prepared by the trusted media adapter, never passed by agents.
 */
export function compileSceneEdit(scene,{sources,fps,voiceDurationSec=0,captions=[],captionsBurned=true,hasVoice=false}){
  validateSceneEdit(scene);
  finite(fps,1,120,'fps');finite(voiceDurationSec,0,900,'voiceDurationSec');
  if(!sources||!sources.capture)throw Error('Missing scene capture source');
  const targetSec=Math.max(scene.durationSec,hasVoice?voiceDurationSec+0.5:0);
  const targetFrames=frames(targetSec,fps);
  const edit=scene.edit||{};
  const defs=edit.shots||[{source:'capture',durationSec:scene.durationSec}];
  const slotFrames=defs.map(s=>frames(s.durationSec,fps));
  const used=slotFrames.reduce((a,b)=>a+b,0);
  if(used>targetFrames+1)throw Error('Scene shots exceed output frame count');
  const shots=[];let cursor=0;
  for(let i=0;i<defs.length;i++){
    const s=defs[i],key=sourceName(s.source),source=sources[key];
    if(!source)throw Error('Missing source for scene edit: '+key);
    const tail=i===defs.length-1?Math.max(0,targetFrames-used):0;
    const media=compileMedia(s,source,slotFrames[i],fps,tail);
    shots.push({...media,fromFrame:cursor,zoom:s.zoom??1,focus:s.focus??{x:0.5,y:0.5},label:s.label||null});
    cursor+=media.durationFrames;
  }
  const insets=(edit.insets||[]).map(v=>{
    const source=sources['asset:'+v.asset];
    if(!source)throw Error('Missing inset asset: '+v.asset);
    const startFrame=Math.round(v.startSec*fps),durationFrames=frames(v.durationSec,fps);
    const media=compileMedia(v,source,durationFrames,fps);
    return {...media,fromFrame:startFrame,x:v.x,y:v.y,width:v.width,height:v.height,label:v.label||null};
  });
  const callouts=(edit.callouts||[]).map(c=>({text:c.text,
    fromFrame:Math.round(c.startSec*fps),durationFrames:frames(c.durationSec,fps),position:c.position||'top-right'}));
  return {
    fps,durationInFrames:targetFrames,hasVoice,chapter:edit.chapter||null,
    captionsBurned,shots,insets,callouts,captions
  };
}
