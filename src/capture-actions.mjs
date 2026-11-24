import path from 'node:path';
import {validatePointerPath} from './adapters.mjs';
import {executeCaptureAssertion} from './capture-assertions.mjs';

export function locator(page,action){
  if(action.testId)return page.getByTestId(action.testId);
  if(action.role)return page.getByRole(action.role,action.name?{name:action.name,exact:true}:{});
  if(action.label)return page.getByLabel(action.label,{exact:true});
  if(action.text)return page.getByText(action.text,{exact:true});
  throw Error('Action requires testId, role, label, or text (avoid brittle CSS selectors)');
}

/** Shared deterministic Playwright action runner used for BUILD rehearsal and real capture. */
export async function executeCaptureAction(page,action,{appUrl,dir,report}){
  switch(action.type){
    case 'goto':{
      const url=new URL(action.path||'/',appUrl),allowed=new URL(appUrl);
      if(url.origin!==allowed.origin)throw Error('Cross-origin navigation blocked for capture/rehearsal');
      await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});break;
    }
    case 'pointerPath':{
      validatePointerPath(action);
      const el=locator(page,action);
      await el.waitFor({state:'visible',timeout:action.timeoutMs||10000});
      await el.scrollIntoViewIfNeeded({timeout:action.timeoutMs||10000});
      const box=await el.boundingBox({timeout:action.timeoutMs||10000});
      if(!box||box.width<2||box.height<2)throw Error('Pointer target has no visible area');
      const viewport=page.viewportSize();
      const coords=action.points.map(p=>({x:box.x+p.x*(box.width-1),y:box.y+p.y*(box.height-1)}));
      if(viewport&&coords.some(p=>p.x<0||p.y<0||p.x>=viewport.width||p.y>=viewport.height))
        throw Error('Pointer path leaves viewport');
      await page.mouse.move(coords[0].x,coords[0].y);
      await page.mouse.down();
      try{for(const p of coords.slice(1))await page.mouse.move(p.x,p.y,{steps:2});}
      finally{await page.mouse.up();}
      break;
    }
    case 'click':await locator(page,action).click({timeout:30000});break;
    case 'fill':await locator(page,action).fill(action.value??'');break;
    case 'hover':await locator(page,action).hover({timeout:30000});break;
    case 'waitFor':await locator(page,action).waitFor({state:'visible',timeout:action.timeoutMs||30000});break;
    case 'pause':await page.waitForTimeout(Math.max(0,Math.min(action.ms||500,15000)));break;
    case 'scroll':await page.mouse.wheel(0,action.y||500);break;
    case 'screenshot':if(dir)await page.screenshot({path:path.join(dir,'capture-step-'+report.actions.length+'.png')});break;
    case 'assertVisible':
    case 'assertText':
    case 'assertAttribute':
    case 'clickExpectResponse':{
      const evidence=await executeCaptureAssertion(page,action,locator,appUrl);
      report.assertions.push(evidence);
      if(action.evidenceScreenshot===true&&dir){
        const name='evidence-'+report.assertions.length+'.png';
        await page.screenshot({path:path.join(dir,name)});
        evidence.screenshot=name;
      }
      break;
    }
    default:throw Error('Unsupported capture action: '+action.type);
  }
}
