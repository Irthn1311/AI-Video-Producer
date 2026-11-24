import {sha} from './utils.mjs';
import {validateSceneEdit,shotIds,editAssetNames} from './editing.mjs';

export function visualStatus(config){
  const policy=config.creative?.visual;
  if(policy===undefined)return {status:'LEGACY_NOT_ENFORCED',problems:[],scenes:[]};
  if(!policy||typeof policy!=='object'||Array.isArray(policy)||Object.keys(policy).some(k=>k!=='consistentTheme')||
     (policy.consistentTheme!==undefined&&typeof policy.consistentTheme!=='boolean'))
    throw Error('Invalid creative.visual policy');
  const problems=[],scenes=[];let themeHash=null;
  for(const s of config.scenes){
    try{
      validateSceneEdit(s);
      if(!s.edit?.design)throw Error('Missing explicit edit.design');
      const h=sha(Object.fromEntries(Object.entries(s.edit.design.theme).sort(([a],[b])=>a.localeCompare(b))));
      if(themeHash===null)themeHash=h;
      if(policy.consistentTheme!==false&&themeHash!==h)throw Error('Theme differs from first scene');
      const ids=shotIds(s),fps=config.render?.fps||30;
      const target=Math.max(1,Math.round(s.durationSec*fps));
      if(s.edit.shots.reduce((n,x)=>n+Math.max(1,Math.round(x.durationSec*fps)),0)>target)
        throw Error('Shot slots exceed scene frame budget');
      if(s.edit.shots.some(x=>x.transitionIn&&Math.max(1,Math.round(x.transitionIn.durationSec*fps))>=Math.max(1,Math.round(x.durationSec*fps))))
        throw Error('Fade would obscure entire shot');
      scenes.push({id:s.id,themeHash:h,shotIds:ids,plannedSec:s.durationSec,
        assets:editAssetNames(s.edit),shots:s.edit.shots.map((shot,i)=>({id:ids[i],specHash:sha(shot),
          source:shot.source||'capture',purpose:shot.purpose,editReason:shot.editReason||null})),
        status:'DECLARATIVE_DESIGN_ONLY'});
    }catch(e){problems.push({code:'VISUAL_DESIGN_INVALID',message:s.id+': '+e.message,action:'Revise visual design through storyboard proposal; revalidate and reapprove'});}
  }
  return {status:problems.length?'BLOCKED':'PASS',problems,scenes,
    scope:'STRUCTURAL_VISUAL_PLAN_NOT_SEMANTIC_OR_RENDER_VERIFICATION'};
}
export function shotDiff(before,after){
  if(!before||!after)return null;
  if(!before.edit?.design||!after.edit?.design)return null;
  const map=s=>new Map(s.edit.shots.map((x,i)=>[shotIds(s)[i],sha(x)]));
  const a=map(before),b=map(after);
  const ids=[...b.keys()];
  return {added:ids.filter(id=>!a.has(id)),removed:[...a.keys()].filter(id=>!b.has(id)),
    changed:ids.filter(id=>a.has(id)&&a.get(id)!==b.get(id)),
    unchangedSpecs:ids.filter(id=>a.get(id)===b.get(id)),
    orderChanged:sha([...a.keys()])!==sha(ids),
    sharedCompositionChanged:sha({...before.edit,shots:undefined,durationSec:before.durationSec})!==sha({...after.edit,shots:undefined,durationSec:after.durationSec}),
    scope:'SPEC_DIFF_ONLY_SCENE_PREVIEW_RENDERS_AS_A_UNIT'};
}
