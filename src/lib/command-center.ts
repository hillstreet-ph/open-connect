export const COMMAND_CENTER_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:14px system-ui;margin:0;background:#08111f;color:#e5eefb}.app{padding:18px}.head{display:flex;justify-content:space-between;gap:12px;align-items:center}.switch{padding:9px 14px;border:1px solid #355779;border-radius:999px;background:#12315c;color:#e5eefb;font:inherit;cursor:pointer;white-space:nowrap}.switch[aria-checked=true]{background:#14563f}.switch:disabled{opacity:.6;cursor:wait}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:14px}.card{border:1px solid #24415f;border-radius:12px;padding:13px;background:#0d1b2d}.muted{color:#a1b5cb}.ok{color:#6ee7a8}button:focus-visible{outline:2px solid #8fd3ff;outline-offset:3px}#retry{margin-top:10px}#status{margin-top:12px}</style></head>
<body><main class="app"><div class="head"><div><strong>Open-Connect Command Center</strong><div class="muted">Autonomous work and tool discovery</div></div><button id="auto" class="switch" role="switch" aria-label="Auto" aria-checked="false" disabled>Auto</button></div><div id="status" role="status" aria-live="polite">Connecting to Open-Connect…</div><button id="retry" class="switch" hidden>Retry connection</button><section id="grid" class="grid"></section><p class="muted">Auto continues authorized tasks and matches tools when needed. Host approvals and provider consent still apply.</p></main>
<script>
const grid=document.getElementById('grid'),toggle=document.getElementById('auto'),status=document.getElementById('status'),retry=document.getElementById('retry');
const pending=new Map();let serial=0,bridgeReady=false,loaded=false,saving=false,enabled=null,canSave=false;
function unwrap(value){
  let d=value;
  try{for(let i=0;i<8;i++){
    if(typeof d==='string'){d=JSON.parse(d);continue}
    if(d?.isError)return null;
    if(d?.planes||d?.auto)return d;
    if(d?.structuredContent){d=d.structuredContent;continue}
    if(d?.result){d=d.result;continue}
    if(d?.toolOutput){d=d.toolOutput;continue}
    if(d?.call_tool_result||d?.mcp_tool_result){d=d.call_tool_result||d.mcp_tool_result;continue}
    if(Array.isArray(d?.content)){d=d.content.find(c=>c.type==='text')?.text;continue}
    return null;
  }}catch{return null}return null;
}
function render(value){
  const d=unwrap(value);if(!d)return false;
  if(d.planes){
    const scopes=Array.isArray(d.scopes)?d.scopes:[];canSave=scopes.some(s=>['tools:invoke','control:write','*'].includes(s));
    const items=[['Gateway',d.gateway||'open-connect.site'],['Resources',d.planes.resources?.published??'Unavailable'],['Connections',d.planes.connections?.connected??'Unavailable']];
    grid.replaceChildren();for(const [label,value]of items){const card=document.createElement('div');card.className='card';const k=document.createElement('div'),v=document.createElement('div');k.className='muted';k.textContent=label;v.className='ok';v.textContent=String(value);v.style.overflowWrap='anywhere';card.append(k,v);grid.append(card)}
  }
  if(d.auto){enabled=typeof d.auto.enabled==='boolean'?d.auto.enabled:null;toggle.setAttribute('aria-checked',String(enabled===true));toggle.textContent=enabled===null?'Auto unavailable':enabled?'Auto On':'Auto Off';toggle.disabled=saving||enabled===null||!canSave;}
  loaded=true;status.textContent=enabled===null?'Connected. Auto settings unavailable; retry to load them.':enabled?'Connected · Auto discovery enabled':'Connected · Auto discovery off';retry.hidden=enabled!==null;return true;
}
function rpc(method,params){return new Promise((resolve,reject)=>{const id='auto-'+(++serial);const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Open-Connect did not respond. Retry connection.'))},8000);pending.set(id,{resolve,reject,timer});window.parent.postMessage({jsonrpc:'2.0',id,method,params},'*')})}
function tool(name,args){
  if(bridgeReady)return rpc('tools/call',{name,arguments:args});
  if(typeof window.openai?.callTool==='function')return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('The chat host did not respond. Retry connection.')),8000);
    try{Promise.resolve(window.openai.callTool(name,args)).then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})}catch(error){clearTimeout(timer);reject(error)}
  });
  throw new Error('The chat host has not connected the tool bridge. Retry or reopen the app.');
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
  try{
    if(!bridgeReady){try{await rpc('ui/initialize',{appInfo:{name:'Open-Connect Auto',version:'2.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'});bridgeReady=true;window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}},'*')}catch(e){if(typeof window.openai?.callTool!=='function')throw e}}
    const result=await tool('open_connect_status',{});if(!render(result))throw new Error('Open-Connect returned an invalid status. Retry connection.');
  }catch(e){if(!loaded||enabled===null)fail(e)}finally{retry.disabled=false}
}
toggle.addEventListener('click',async()=>{
  if(saving||enabled===null||!canSave)return;saving=true;toggle.disabled=true;status.textContent='Saving Auto…';
  try{const result=await tool('set_auto_mode',{enabled:!enabled});const d=unwrap(result);if(!d?.auto||typeof d.auto.enabled!=='boolean')throw new Error('Auto was not saved. Retry after connecting.');saving=false;render(d)}catch(e){saving=false;fail(e)}
});
retry.addEventListener('click',connect);
render(window.openai?.toolOutput)||render(window.openai?.toolResponseMetadata);
connect();
</script></body></html>`;
