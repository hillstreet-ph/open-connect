export const COMMAND_CENTER_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box}body{font:13px system-ui;margin:0;background:#08111f;color:#e5eefb}.app{padding:10px;max-width:680px;margin:0 auto}.head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;align-items:center}.switch{min-height:44px;padding:8px 12px;border:1px solid #355779;border-radius:999px;background:#12315c;color:#e5eefb;font:inherit;cursor:pointer;white-space:nowrap}.switch[aria-checked=true]{background:#14563f}.switch:disabled{opacity:.6;cursor:wait}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:8px}.card{display:block;min-width:0;text-decoration:none;color:inherit;border:1px solid #24415f;border-radius:10px;padding:8px 10px;min-height:52px;background:#0d1b2d}.muted{color:#a1b5cb}.ok{color:#6ee7a8}a:focus-visible,textarea:focus-visible,button:focus-visible{outline:2px solid #8fd3ff;outline-offset:3px}#retry{margin-top:10px}#status{margin-top:6px;font-size:12px;line-height:1.5}select{width:100%;min-height:44px;margin-top:8px;padding:8px;border:1px solid #355779;border-radius:10px;background:#0d1b2d;color:inherit;font:inherit}select:focus-visible{outline:2px solid #8fd3ff;outline-offset:3px}textarea{box-sizing:border-box;width:100%;min-height:72px;margin:12px 0 8px;padding:10px;border:1px solid #355779;border-radius:10px;background:#0d1b2d;color:inherit;font:inherit;resize:vertical}.actions{display:flex;flex-wrap:wrap;gap:8px}details{margin-top:12px}summary{cursor:pointer}.access-link{display:inline-flex;margin-top:12px;line-height:1.5;overflow-wrap:anywhere}.goal-input{display:block;margin-top:10px;padding-top:10px;border-top:1px solid #24415f}.goal-input label{display:block;font-weight:600}.technical-scopes{margin:10px 0 0}#scopes{overflow-wrap:anywhere;font-size:12px}#results{white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto;margin-top:12px}.muted{font-size:12px;line-height:1.5} .card{display:flex;align-items:center;justify-content:space-between;gap:6px}.card .muted{font-size:11px}.head strong{font-size:14px}.advanced{font-size:12px}.advanced>summary{min-height:44px;display:flex;align-items:center}.actions .switch{white-space:normal;text-align:center}@media(min-width:520px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:359px){.app{padding:8px}.head strong{font-size:13px}.card{padding:8px 6px}.card .muted{font-size:10px}}</style></head>
<body><main class="app"><div class="head"><div><strong>Open-Connect Autonomous</strong><div id="worker-status" class="muted">Scoped tools · model worker · Checking…</div></div><button id="auto" class="switch" role="switch" aria-label="Auto" aria-checked="false" disabled>Auto</button></div><div id="status" role="status" aria-live="polite">Connecting to Open-Connect…</div><button id="retry" class="switch" hidden>Retry connection</button><section id="grid" class="grid" aria-label="Open-Connect capabilities"></section><details class="advanced"><summary>Task tools and access</summary><details><summary>Access permissions</summary><p id="access" class="muted">Loading access permissions…</p><details class="technical-scopes"><summary>Technical scope names</summary><p id="scopes" class="muted"></p></details><a class="ok access-link" href="https://open-connect.site/integrations?section=api-key" target="_blank" rel="noreferrer">Manage keys and access</a></details><section class="goal-input" aria-labelledby="goal-label"><label id="goal-label" for="goal">Goal</label><label class="muted" for="preset">Starter prompt</label><select id="preset"><option value="">Choose a prompt…</option value="discover">Discover my tools and access</option><option value="task">Complete a task</option><option value="maintain">Check setup and duplicates</option></select><textarea id="goal" maxlength="2000" placeholder="Describe the task to match tools or delegate planning…"></textarea></section><div class="actions"><button id="discover" class="switch" disabled>Match tools and connectors</button><button id="team" class="switch" disabled>Run free-model team</button></div><p id="session-status" class="muted" role="status">No task run yet.</p><section id="results" aria-live="polite"></section><section id="suggestions" class="actions" aria-label="Recommended next prompts"></section><p class="muted">Auto matches tools for authorized tasks. Workers produce proposals; the client executes with its granted scopes. Auto uses granted permissions. Required ChatGPT, Codex, and provider approvals still need your action. Context checkpoints and verified outcomes can be saved to Memory; repeated procedures need review before publication.</p></details></main>
<script>
const grid=document.getElementById('grid'),toggle=document.getElementById('auto'),status=document.getElementById('status'),retry=document.getElementById('retry'),goal=document.getElementById('goal'),discover=document.getElementById('discover'),team=document.getElementById('team'),results=document.getElementById('results'),scopeText=document.getElementById('scopes'),accessText=document.getElementById('access');
const pending=new Map();let serial=0,bridgeReady=false,bridgePromise=null,loaded=false,saving=false,enabled=null,canSave=false,canDiscover=false,canTeam=false,working=false;
function decode(value){
  let d=value;
  try{for(let i=0;i<8;i++){
    if(typeof d==='string'){d=JSON.parse(d);continue}
    if(d?.error)throw new Error(/unknown tool|tool.*not found/i.test(typeof d.error==='string'?d.error:d.error.message||'')?'Unknown tool':'Open-Connect could not complete the request. Check account access and retry connection.');
    if(d?.isError)throw new Error('The request was not completed. Check account scopes and AI Gateway.');
    if(d?.planes||d?.auto||d?.matches||d?.workers||d?.status)return d;
    if(d?.structuredContent){d=d.structuredContent;continue}
    if(d?.result){d=d.result;continue}
    if(d?.toolOutput){d=d.toolOutput;continue}
    if(d?.toolResponseMetadata){d=d.toolResponseMetadata;continue}
    if(d?.call_tool_result||d?.mcp_tool_result){d=d.call_tool_result||d.mcp_tool_result;continue}
    if(Array.isArray(d?.content)){d=d.content.find(c=>c.type==='text')?.text;continue}
    return d;
  }}catch(e){if(e instanceof SyntaxError)return null;throw e}return null;
}
function unwrap(value){try{const d=decode(value);return d?.planes||d?.auto?d:null}catch{return null}}
function render(value){
  const d=unwrap(value);if(!d)return false;
  if(d.planes){
    const scopes=Array.isArray(d.scopes)?d.scopes:[];canSave=scopes.some(s=>['tools:invoke','control:write','*'].includes(s));
    const grant=s=>scopes.includes(s)||scopes.includes('*');
    canDiscover=grant('resources:read');canTeam=grant('models:invoke')&&grant('agents:invoke')&&d.auto?.scope==='personal';
    const context=d.auto?.scope==='personal'?'Personal account':d.auto?.scope||'Unknown context';
    accessText.textContent=context+' · AI worker permission: '+(grant('agents:invoke')?'granted':'not granted')+' · Workspace control permission: '+(grant('control:write')?'granted':'not granted');
    scopeText.textContent=scopes.join(', ')||'No scopes granted.';
    const items=[['Resources','Open','/library'],['Connections',d.planes.connections?.available===false?'Not available':d.planes.connections?.connected??'Unavailable','/connections'],['Credentials',d.planes.credentials?.available?(d.planes.credentials?.count??'Unavailable'):'Not granted','/secrets'],['AI Gateway',d.planes.models?.available?(d.planes.models?.count??'Unavailable'):'Not granted','/models'],['Marketplace',d.planes.resources?.published??'Unavailable','/resources'],['AI Agency','Open','/ai-agency']];
    grid.replaceChildren();for(const [label,value,path]of items){const card=document.createElement('a');card.className='card';card.setAttribute('href','https://open-connect.site'+path);card.setAttribute('target','_blank');card.setAttribute('rel','noreferrer');const k=document.createElement('div'),v=document.createElement('div');k.className='muted';k.textContent=label;v.className='ok';v.textContent=String(value);v.style.overflowWrap='anywhere';card.append(k,v);grid.append(card)}
  }
  if(d.auto){enabled=typeof d.auto.enabled==='boolean'?d.auto.enabled:null;toggle.setAttribute('aria-checked',String(enabled===true));toggle.textContent=enabled===null?'Auto unavailable':enabled?'Auto On':'Auto Off';toggle.disabled=saving||enabled===null||!canSave;}
  discover.textContent='Match tools and connectors · '+(enabled===null?'Unavailable':enabled&&canDiscover?'Auto On':enabled?'Not granted':'Auto Off');
  discover.disabled=working||enabled!==true||!canDiscover;team.disabled=working||enabled!==true||!canTeam;
  const workerStatus=document.getElementById('worker-status');if(workerStatus)workerStatus.textContent='Scoped tools · model worker · '+(enabled===null?'Unavailable':enabled&&canTeam?'Auto On':enabled?'Not granted':'Auto Off');
  loaded=true;status.textContent=enabled===null?'Connected. Auto settings unavailable; retry to load them.':enabled?'Connected · Auto discovery · Auto On':'Connected · Auto discovery · Auto Off';retry.hidden=enabled!==null;return true;
}
function rpc(method,params){return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Open-Connect did not respond. Retry connection.'))},method==='tools/call'?(params.name==='run_agent_team'?90000:params.name==='open_connect_status'?30000:8000):8000);pending.set(id,{resolve,reject,timer});window.parent.postMessage({jsonrpc:'2.0',id,method,params},'*')})}
async function tool(name,args){
  await ensureBridge();
  if(bridgeReady)return rpc('tools/call',{name,arguments:args});
  if(typeof window.openai?.callTool==='function')return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('The chat host did not respond. Retry connection.')),name==='run_agent_team'?90000:name==='open_connect_status'?30000:8000);
    try{Promise.resolve(window.openai.callTool(name,args)).then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})}catch(error){clearTimeout(timer);reject(error)}
  });
  throw new Error('The chat host has not connected the tool bridge. Retry or reopen the app.');
}
function ensureBridge(){
  if(bridgeReady)return Promise.resolve();
  if(!bridgePromise)bridgePromise=(async()=>{
    try{
      await rpc('ui/initialize',{appInfo:{name:'Open-Connect Autonomous',version:'7.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'});
      bridgeReady=true;
      window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}},'*');
    }catch(e){if(typeof window.openai?.callTool!=='function'){bridgePromise=null;throw e}}
  })();
  return bridgePromise;
}
function actionError(error){
  const message=error?.message||'Request failed.';
  if(/unknown tool|tool.*not found|no tool named/i.test(message))return 'This chat has an outdated Open-Connect tool list. Refresh the Open-Connect connection in your host settings, then open a new status card. Your request was not completed; do not change account permissions.';
  return message;
}
function fail(error){status.textContent=error?.message||'Connection failed. Retry connection.';retry.hidden=false;toggle.disabled=enabled===null||!canSave;}
window.addEventListener('message',e=>{
  if(e.source!==window.parent)return;const m=e.data;if(!m||m.jsonrpc!=='2.0')return;
  if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);if(m.error)p.reject(new Error(m.error.message||'Tool request failed'));else p.resolve(m.result);return}
  if(m.method==='ui/notifications/tool-result'&&!saving)render(m.params);
});
window.addEventListener('openai:set_globals',e=>{if(!saving){const g=e.detail?.globals;render(g?.toolOutput)||render(g?.toolResponseMetadata)}});
async function connect(){
  retry.hidden=true;retry.disabled=true;
  if(!bridgeReady)bridgePromise=null;
  try{
    await ensureBridge();
    const result=await tool('open_connect_status',{});if(!render(result))throw new Error('Open-Connect returned an invalid status. Retry connection.');
  }catch(e){if(!loaded||enabled===null)fail(e)}finally{retry.disabled=false}
}
toggle.addEventListener('click',async()=>{
  if(saving||enabled===null||!canSave)return;saving=true;toggle.disabled=true;status.textContent='Saving Auto…';
  try{const result=await tool('set_auto_mode',{enabled:!enabled});const d=unwrap(result);if(!d?.auto||typeof d.auto.enabled!=='boolean')throw new Error('Auto was not saved. Retry after connecting.');saving=false;render(d)}catch(e){saving=false;fail(e)}
});
function recommendNext(prompt,kind){
  const box=document.getElementById('suggestions');if(!box)return;box.replaceChildren();
  const brief=prompt.slice(0,1200);
  const choices=kind==='discovery'?[
    ['Verify access','For this goal: '+brief+' Verify the matching tools, current account and project permissions with a bounded read. Report missing capabilities before any writes.'],
    ['Plan next steps','For this goal: '+brief+' Prepare concrete steps using the discovered schemas. Separate executable actions from catalog-only matches and identify acceptance checks.'],
    ['Review blockers','For this goal: '+brief+' Summarize what discovery established, unresolved blockers, and the next supported action. Do not mark the goal complete without execution evidence.']
  ]:[
    ['Review proposal','For this goal: '+brief+' Review the worker proposals against the real available tools and permissions. Identify unsupported assumptions and produce an executable plan.'],
    ['Check the result','For this goal: '+brief+' Verify actual changes and remaining work using supported reads. Distinguish worker proposals from executed actions.'],
    ['Prepare handoff','For this goal: '+brief+' Prepare a concise session handoff with verified findings, pending actions and blockers. Save only through supported tools when Data Controls allow it.']
  ];
  for(const [label,text]of choices){const button=document.createElement('button');button.className='switch';button.textContent=label;button.setAttribute('type','button');button.addEventListener('click',()=>{goal.value=text;if(typeof goal.focus==='function')goal.focus()});box.append(button)}
}
async function act(name){
  const prompt=goal.value.trim();if(working||enabled!==true)return;
  if(!prompt){results.textContent='Enter a goal before matching capabilities or running the team.';return;}
  if((name==='auto_discover'&&!canDiscover)||(name==='run_agent_team'&&!canTeam))return;
  const sessionStatus=document.getElementById('session-status'),suggestions=document.getElementById('suggestions');if(suggestions)suggestions.replaceChildren();if(sessionStatus)sessionStatus.textContent='Task running…';
  working=true;discover.disabled=true;team.disabled=true;results.textContent=name==='auto_discover'?'Matching approved capabilities…':'Running free-model workers…';
  try{
    const d=decode(await tool(name,{goal:prompt}));
    if(!d)throw new Error('Open-Connect returned an unreadable result. Retry connection.');
    if(d.status==='disabled'||d.status==='unavailable')throw new Error(d.status==='disabled'?'Auto is off. Turn it on before matching.':'Open-Connect discovery is unavailable. Retry connection.');
    if(name==='auto_discover')results.textContent=d.matches?.length?d.matches.map(m=>m.name+': '+(m.description||m.resourceType)).join('\\n\\n'):'No approved match. Use Studio to prepare a private capability draft.';
    else if(Array.isArray(d.workers))results.textContent=d.workers.map(w=>w.role+' · '+w.status+' · '+(w.model||'no route')+'\\n'+w.content).join('\\n\\n');
    else throw new Error('The host returned an unsupported result.');
    if(sessionStatus)sessionStatus.textContent=name==='auto_discover'?'Discovery complete · Goal not executed.':'Worker response received · Proposal only; goal completion is unverified.';
    recommendNext(prompt,name==='auto_discover'?'discovery':'proposal');
  }catch(e){results.textContent=actionError(e);if(sessionStatus)sessionStatus.textContent='Task blocked · Goal completion is unverified.'}finally{working=false;discover.disabled=enabled!==true||!canDiscover;team.disabled=enabled!==true||!canTeam;}
}
discover.addEventListener('click',()=>act('auto_discover'));team.addEventListener('click',()=>act('run_agent_team'));
retry.addEventListener('click',connect);
const preset=document.getElementById('preset');if(preset)preset.addEventListener('change',()=>{const prompts={discover:'Inspect my current Open Connect project and connected tools. Verify a bounded read and show which operations support read, write or administration.',task:'Complete this task using my authorized Open Connect tools: [describe goal]. Discover matching tools, execute the authorized steps, and verify the result.',maintain:'Audit my Open Connect setup for failed connections and duplicate resources. Prepare a merge that preserves IDs, OAuth, permissions and data; report exact removal targets before deleting.'};if(prompts[preset.value])goal.value=prompts[preset.value]});
render(window.openai?.toolOutput)||render(window.openai?.toolResponseMetadata);
connect();
</script></body></html>`;
