/**
 * Evidence-aware Playwright assertions. All checks are opt-in and fail closed;
 * screenshots and response bodies stay local to the project, never sent to an LLM.
 */
const locatorFields=['testId','role','label','text'];
const evidenceTypes=new Set(['assertVisible','assertText','assertAttribute','clickExpectResponse']);
function finitePositiveTimeout(a){
  if(a.timeoutMs!==undefined&&(!Number.isInteger(a.timeoutMs)||a.timeoutMs<100||a.timeoutMs>120000))
    throw Error(a.type+'.timeoutMs must be 100–120000');
}
function locatorPresent(a){return locatorFields.some(k=>typeof a[k]==='string'&&a[k].trim());}
function nonempty(s,max,label){
  if(typeof s!=='string'||!s.trim()||s.length>max)throw Error(label+' must be nonempty text up to '+max+' chars');
}
export function validateCaptureEvidenceConfig(capture){
  if(!capture||!Array.isArray(capture.actions))return;
  const p=capture.evidencePolicy||{};
  if(capture.evidencePolicy!==undefined){
    if(!capture.evidencePolicy||typeof capture.evidencePolicy!=='object'||Array.isArray(capture.evidencePolicy))throw Error('capture.evidencePolicy must be an object');
    if(p.requireAssertions!==undefined&&typeof p.requireAssertions!=='boolean')throw Error('capture.evidencePolicy.requireAssertions must be boolean');
    if(p.failOnPageError!==undefined&&typeof p.failOnPageError!=='boolean')throw Error('capture.evidencePolicy.failOnPageError must be boolean');
  }
  const ids=new Set();let assertCount=0;
  for(const a of capture.actions){
    if(!a||typeof a!=='object'||Array.isArray(a))throw Error('capture action must be an object');
    if(!evidenceTypes.has(a.type))continue;
    assertCount++;
    if(!locatorPresent(a))throw Error(a.type+' requires a testId, role, label or text locator');
    finitePositiveTimeout(a);
    if(a.evidenceId!==undefined){
      if(typeof a.evidenceId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(a.evidenceId))
        throw Error('Invalid evidenceId');
      if(ids.has(a.evidenceId))throw Error('Duplicate evidenceId');
      ids.add(a.evidenceId);
    }
    if(a.type==='assertText')nonempty(a.expectedText,500,'assertText.expectedText');
    if(a.type==='assertAttribute'){
      nonempty(a.attribute,80,'assertAttribute.attribute');
      if(!/^[a-zA-Z_:][a-zA-Z0-9_:.-]*$/.test(a.attribute))throw Error('Invalid attribute name');
      if(typeof a.expectedValue!=='string'||a.expectedValue.length>500)throw Error('assertAttribute.expectedValue must be a string');
    }
    if(a.type==='clickExpectResponse'){
      const r=a.response;
      if(!r||typeof r!=='object'||Array.isArray(r))throw Error('clickExpectResponse.response is required');
      nonempty(r.pathContains,300,'response.pathContains');
      if(!r.pathContains.startsWith('/'))throw Error('response.pathContains must start with /');
      if(!['GET','POST','PUT','PATCH','DELETE'].includes(r.method))throw Error('Unsupported response.method');
      if(!Number.isInteger(r.status)||r.status<100||r.status>599)throw Error('Invalid response.status');
      if(r.bodyIncludes!==undefined)nonempty(r.bodyIncludes,500,'response.bodyIncludes');
    }
  }
  if(p.requireAssertions&&assertCount===0)throw Error('Evidence policy requires at least one explicit capture assertion');
}

export function captureEvidencePassed(report,policy){
  if(!policy?.requireAssertions)return true;
  if(!report||report.status!=='PASS'||!Array.isArray(report.assertions)||report.assertions.length===0)return false;
  if(report.assertions.some(x=>x.pass!==true))return false;
  if(policy.failOnPageError!==false&&(!Array.isArray(report.pageErrors)||report.pageErrors.length>0))return false;
  return true;
}

export async function executeCaptureAssertion(page,action,getLocator,appUrl){
  const timeout=action.timeoutMs||30000;
  const el=getLocator(page,action);
  const evidence={id:action.evidenceId||action.type,type:action.type,pass:false,checkedAt:new Date().toISOString()};
  if(action.type==='assertVisible'){
    await el.waitFor({state:'visible',timeout});
  }else if(action.type==='assertText'){
    await el.waitFor({state:'visible',timeout});
    const observed=await el.innerText({timeout});
    if(!observed.includes(action.expectedText))throw Error('Text assertion failed: '+evidence.id);
  }else if(action.type==='assertAttribute'){
    await el.waitFor({state:'attached',timeout});
    const actual=await el.getAttribute(action.attribute,{timeout});
    if(actual!==action.expectedValue)throw Error('Attribute assertion failed: '+evidence.id);
  }else if(action.type==='clickExpectResponse'){
    const expected=action.response,origin=new URL(appUrl).origin;
    const [response]=await Promise.all([
      page.waitForResponse(r=>{
        const url=new URL(r.url());
        return url.origin===origin&&url.pathname.includes(expected.pathContains)
          &&r.request().method()===expected.method;
      },{timeout}),
      el.click({timeout})
    ]);
    if(response.status()!==expected.status)throw Error('Response status assertion failed: '+evidence.id+
      ' (expected '+expected.status+', observed '+response.status()+')');
    if(expected.bodyIncludes!==undefined){
      const body=await response.text();
      if(!body.includes(expected.bodyIncludes))throw Error('Response body assertion failed: '+evidence.id);
    }
    // Store no URL query string, credentials, or response body.
    evidence.response={path:new URL(response.url()).pathname,method:expected.method,status:response.status()};
  }else throw Error('Unsupported assertion action: '+action.type);
  evidence.pass=true;
  return evidence;
}
