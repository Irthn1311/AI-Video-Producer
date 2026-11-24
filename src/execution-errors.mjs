// Typed, bounded failure metadata. Never serialize arbitrary error messages,
// stack traces, locators, response bodies, app URLs or credentials into journals.
const policies={
  APP_RUNTIME_REVIEW_REQUIRED:['RETURN_TO_BUILD','Review the managed runtime and complete a current launch trial.'],
  APP_LAUNCH_AUTHORIZATION_REQUIRED:['CHECK_AUTHORIZATION','Explicitly authorize reviewed disposable app launch and interaction.'],
  APP_PORT_OCCUPIED:['CHECK_ENVIRONMENT','Inspect occupied port; never kill an unrelated process.'],
  APP_RUNTIME_BUSY:['CHECK_ENVIRONMENT','Inspect existing managed session and confirm cleanup before further launch.'],
  APP_START_FAILED:['CHECK_ENVIRONMENT','Inspect reviewed entrypoint and local dependencies; verify safe fixture state.'],
  APP_READINESS_TIMEOUT:['CHECK_ENVIRONMENT','Verify local startup and readiness contract before retry.'],
  APP_CLEANUP_FAILED:['CHECK_ENVIRONMENT','Inspect direct child and retained session lock; do not relaunch until cleanup confirmed.'],
  ASSERTION_FAILED:['RETURN_TO_BUILD','Re-observe the exact UI/API result; repair recipe or claim, rehearse and freeze again. Do not weaken assertions to pass.'],
  LOCATOR_OR_INTERACTION_FAILED:['RETURN_TO_BUILD','Inspect authorized app DOM and state; repair action/adapter and rehearse before new freeze.'],
  APP_NAVIGATION_FAILED:['CHECK_ENVIRONMENT','Check app availability, origin and isolated test state; authorize retry only after reset.'],
  APP_PAGE_ERROR:['RETURN_TO_BUILD','Investigate the app error and reproduce with rehearsal before a new freeze.'],
  CAPTURE_EVIDENCE_INVALID:['RETURN_TO_BUILD','Inspect current footage and capture report; do not proceed without matching runtime evidence.'],
  ADAPTER_OR_POLICY_BLOCKED:['RETURN_TO_BUILD','Resolve adapter approval, trial, origin or permission policy in Build.'],
  PROVIDER_AUTH:['CHECK_AUTHORIZATION','Verify provider access and credentials locally; never include keys in reports.'],
  PROVIDER_RATE_LIMIT:['RETRY_AFTER_REVIEW','Check provider rate limit and budget before an explicitly authorized retry.'],
  PROVIDER_TRANSIENT:['RETRY_AFTER_REVIEW','Check provider availability and reserved cost before an explicitly authorized retry.'],
  PROVIDER_REQUEST_REJECTED:['RETURN_TO_BUILD','Review model, voice, request and script; reprepare Build if settings change.'],
  PROVIDER_RESPONSE_INVALID:['RETURN_TO_BUILD','Review provider audio response and selected voice; do not substitute unverified audio.'],
  PAID_BUDGET_BLOCKED:['CHECK_AUTHORIZATION','Review budget and limits; do not retry until the authorized constraint is resolved.'],
  PAID_CONSENT_REQUIRED:['CHECK_AUTHORIZATION','Obtain explicit paid consent; check estimated cost and provider settings.'],
  TOOL_UNAVAILABLE:['CHECK_ENVIRONMENT','Install/verify the required local tool using the documented workflow; do not install arbitrary code.'],
  MEDIA_TOOL_FAILED:['REPAIR_LOCAL','Inspect local media/tool diagnostics; repair only affected inputs.'],
  AUDIO_SELECTION_INVALID:['RETURN_TO_BUILD','Re-select valid full-scene audio, check timing, and freeze Build again.'],
  CAPTION_TIMING_FAILED:['REPAIR_LOCAL','Inspect current narration, selected audio and caption timing; preserve valid media.'],
  VISUAL_RENDER_FAILED:['REPAIR_LOCAL','Inspect composition and source assets; preserve valid capture/voice/captions.'],
  SCENE_QA_FAILED:['INSPECT_QA','Inspect failed checks and evidence; repair the relevant input rather than bypassing QA.'],
  FINAL_QA_FAILED:['INSPECT_QA','Inspect scene previews and concat/codec/timing checks; preserve valid scenes.'],
  BUILD_DRIFT:['RETURN_TO_BUILD','Stop; inspect changed configuration and freeze a newly reviewed Build.'],
  INTERRUPTED_STEP:['RECONCILE_FIRST','Inspect actual artifacts and app state; explicitly reconcile or retry after safe reset.'],
  STEP_EXECUTION_FAILED:['INSPECT_MANUALLY','Inspect local tool reports; cause is not established. Explicitly decide whether to repair or retry.']
};
const safeAction=new Set(['goto','pointerPath','click','fill','press','hover','waitFor','pause','scroll','screenshot','assertVisible','assertText','assertAttribute','clickExpectResponse']);
export class ExecutionError extends Error {
  constructor(code,message,details={}){
    super(message);this.name='ExecutionError';this.failureCode=Object.hasOwn(policies,code)?code:'STEP_EXECUTION_FAILED';
    this.details=details;
  }
}
export function failureDetails(error,kind){
  const fallback={captions:'CAPTION_TIMING_FAILED',preview:'VISUAL_RENDER_FAILED',qa:'SCENE_QA_FAILED',render:'FINAL_QA_FAILED'};
  const code=error instanceof ExecutionError?error.failureCode:(fallback[kind]||'STEP_EXECUTION_FAILED');
  const [disposition,action]=policies[code];
  const d=error instanceof ExecutionError?error.details||{}:{};
  const metadata={};
  if(safeAction.has(d.actionType))metadata.actionType=d.actionType;
  if(Number.isInteger(d.actionIndex)&&d.actionIndex>=0&&d.actionIndex<10000)metadata.actionIndex=d.actionIndex;
  if(Number.isInteger(d.httpStatus)&&d.httpStatus>=100&&d.httpStatus<=599)metadata.httpStatus=d.httpStatus;
  if(['ffmpeg','ffprobe'].includes(d.tool))metadata.tool=d.tool;
  if(Array.isArray(d.failedChecks))metadata.failedChecks=d.failedChecks.filter(x=>['captionTimeline','videoH264','width','height','audioAAC','duration','captionsExist','fullDecode','captureAssertions','claimEvidence','actionMarkers','evidenceTimeline','captionReadability','audioQuality','reviewFrames'].includes(x));
  return {code,disposition,action,metadata,
    retrySameRevision:disposition!=='RETURN_TO_BUILD'&&disposition!=='INSPECT_QA',
    automaticRetry:false};
}
export function interruptedFailure(){return failureDetails(new ExecutionError('INTERRUPTED_STEP','Interrupted step'));}
export function providerHttpError(status){
  const code=[401,403].includes(status)?'PROVIDER_AUTH':status===429?'PROVIDER_RATE_LIMIT':status===408||status>=500?'PROVIDER_TRANSIENT':'PROVIDER_REQUEST_REJECTED';
  return new ExecutionError(code,'Gemini TTS returned HTTP '+status+' (response contents withheld)',{httpStatus:status});
}
