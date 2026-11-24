// Declarative pointer primitive: no arbitrary script, CSS selector, file or network access.
import {validateCanvasLocator,validateCanvasPixels} from './capture-assertions.mjs';
const locatorFields=['testId','role','name','label','text','canvasClass'];
const keys=new Set(['type',...locatorFields,'points','timeoutMs']);
export function validatePointerPath(a){
  if(!a||typeof a!=='object'||Array.isArray(a)||a.type!=='pointerPath'||Object.keys(a).some(k=>!keys.has(k)))
    throw Error('Invalid pointerPath fields');
  if(a.canvasClass!==undefined)validateCanvasLocator(a);
  else if(!['testId','role','label','text'].some(k=>typeof a[k]==='string'&&a[k].trim()))throw Error('pointerPath needs a deterministic locator');
  for(const key of locatorFields)if(a[key]!==undefined&&(typeof a[key]!=='string'||a[key].length>250))throw Error('Invalid pointer locator');
  if(!Array.isArray(a.points)||a.points.length<2||a.points.length>80)throw Error('pointerPath requires 2–80 points');
  for(const p of a.points){
    if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['x','y'].includes(k))||
       !Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)
      throw Error('Pointer coordinates must be normalized to [0,1]');
  }
  if(a.points.every(p=>p.x===a.points[0].x&&p.y===a.points[0].y))throw Error('Pointer path must move');
  if(a.timeoutMs!==undefined&&(!Number.isInteger(a.timeoutMs)||a.timeoutMs<100||a.timeoutMs>15000))
    throw Error('pointerPath timeout must be 100–15000 ms');
}
function locatorKey(a){return JSON.stringify(locatorFields.map(k=>a[k]??null));}
/** Require explicit before/after attribute assertions on the same pointer target.
 * This establishes a declared observable state transition, not arbitrary semantics. */
export function hasPointerTransition(actions){
  return actions.some((a,i)=>{
    if(a.type!=='pointerPath')return false;
    const key=locatorKey(a);
    if(a.canvasClass){
      const before=actions.slice(0,i).filter(x=>x.type==='assertCanvasPixels'&&x.evidenceId&&locatorKey(x)===key);
      return actions.slice(i+1).some(after=>after.type==='assertCanvasPixels'&&after.evidenceId&&locatorKey(after)===key&&before.some(prev=>{
        try{validateCanvasPixels(prev);validateCanvasPixels(after);}catch{return false;}
        return prev.pixelColor.toLowerCase()===after.pixelColor.toLowerCase()&&prev.evidenceId!==after.evidenceId&&(prev.maxPixels<after.minPixels||after.maxPixels<prev.minPixels);
      }));
    }
    const before=actions.slice(0,i).filter(x=>x.type==='assertAttribute'&&x.evidenceId&&locatorKey(x)===key);
    return actions.slice(i+1).some(after=>after.type==='assertAttribute'&&after.evidenceId&&locatorKey(after)===key&&
      before.some(prev=>prev.attribute===after.attribute&&prev.expectedValue!==after.expectedValue&&prev.evidenceId!==after.evidenceId));
  });
}
export async function executePointerPath(page,action,locate){
  validatePointerPath(action);
  const el=locate(page,action),timeout=action.timeoutMs||10000;
  await el.waitFor({state:'visible',timeout});
  await el.scrollIntoViewIfNeeded({timeout});
  const box=await el.boundingBox({timeout}),viewport=page.viewportSize();
  if(!box||box.width<2||box.height<2||!viewport)throw Error('Pointer target lacks measurable viewport area');
  const points=action.points.map(p=>({x:box.x+p.x*(box.width-1),y:box.y+p.y*(box.height-1)}));
  if(points.some(p=>p.x<0||p.y<0||p.x>=viewport.width||p.y>=viewport.height))throw Error('Pointer path leaves viewport');
  await page.mouse.move(points[0].x,points[0].y);
  await page.mouse.down();
  try{for(const p of points.slice(1))await page.mouse.move(p.x,p.y,{steps:2});}
  finally{await page.mouse.up();}
}
