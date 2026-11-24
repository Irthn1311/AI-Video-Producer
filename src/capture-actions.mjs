import path from 'node:path';
import {executeCaptureAssertion,validatePressAction,validateCanvasLocator} from './capture-assertions.mjs';
import {executePointerPath} from './pointer-actions.mjs';
import {ExecutionError} from './execution-errors.mjs';

export function locator(page,action){
  if(action.canvasClass!==undefined){validateCanvasLocator(action);return page.locator('canvas.'+action.canvasClass);}
  if(action.testId)return page.getByTestId(action.testId);
  if(action.role)return page.getByRole(action.role,action.name?{name:action.name,exact:true}:{});
  if(action.label)return page.getByLabel(action.label,{exact:true});
  if(action.text)return page.getByText(action.text,{exact:true});
  throw Error('Action requires testId, role, label, or text (avoid brittle CSS selectors)');
}

/** Shared deterministic Playwright action runner used for BUILD rehearsal and real capture. */
export async function executeCaptureAction(page,action,{appUrl,dir,report,adapter=false}){
  try{if((action.canvasClass!==undefined||action.type==='assertCanvasPixels')&&!adapter)throw new ExecutionError('ADAPTER_OR_POLICY_BLOCKED','Canvas pixel evidence and class locator require a reviewed adapter');
  switch(action.type){
    case 'goto':{
      const url=new URL(action.path||'/',appUrl),allowed=new URL(appUrl);
      if(url.origin!==allowed.origin)throw new ExecutionError('ADAPTER_OR_POLICY_BLOCKED','Cross-origin navigation blocked for capture/rehearsal');
      await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});break;
    }
    case 'pointerPath':
      if(!adapter)throw new ExecutionError('ADAPTER_OR_POLICY_BLOCKED','pointerPath requires a reviewed project adapter');
      await executePointerPath(page,action,locator);break;
    case 'click':await locator(page,action).click({timeout:30000});break;
    case 'fill':await locator(page,action).fill(action.value??'');break;
    case 'press':validatePressAction(action);await locator(page,action).press(action.key,{timeout:action.timeoutMs||30000});break;
    case 'hover':await locator(page,action).hover({timeout:30000});break;
    case 'waitFor':await locator(page,action).waitFor({state:'visible',timeout:action.timeoutMs||30000});break;
    case 'pause':await page.waitForTimeout(Math.max(0,Math.min(action.ms||500,15000)));break;
    case 'scroll':await page.mouse.wheel(0,action.y||500);break;
    case 'screenshot':if(dir)await page.screenshot({path:path.join(dir,'capture-step-'+report.actions.length+'.png')});break;
    case 'assertVisible':
    case 'assertText':
    case 'assertCanvasPixels':
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
    default:throw new ExecutionError('ADAPTER_OR_POLICY_BLOCKED','Unsupported capture action: '+action.type);
  }}catch(e){
    const code=e instanceof ExecutionError?e.failureCode:action.type==='goto'?'APP_NAVIGATION_FAILED':
      ['assertVisible','assertText','assertAttribute','clickExpectResponse','assertCanvasPixels'].includes(action.type)?'ASSERTION_FAILED':'LOCATOR_OR_INTERACTION_FAILED';
    throw new ExecutionError(code,String(e.message||e),{actionType:action.type,actionIndex:Array.isArray(report?.actions)?report.actions.length:undefined});
  }
}
