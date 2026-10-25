/** Inline chat widget (MCP Apps / ChatGPT Apps SDK) that shows a live cloud browser run. */
export const CLOUD_BROWSER_WIDGET_URI = "ui://open-connect/cloud-browser-v1.html";

export const CLOUD_BROWSER_FRAME_DOMAINS = [
  "https://*.tinyfish.io",
  "https://*.tinyfish.ai",
  "https://open-connect.site",
];

export const CLOUD_BROWSER_WIDGET_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
[hidden]{display:none!important}
body{margin:0;font:14px system-ui;background:#111;color:#eee}
.bar{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #333}
.badge{font-weight:700;font-size:11px;border-radius:4px;padding:2px 7px;background:#555}
.live{background:#dc2626}.done{background:#059669}.fail{background:#52525b}
.goal{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.frame{position:relative;width:100%;aspect-ratio:16/10;background:#000}
iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#aaa}
.foot{display:flex;gap:10px;padding:8px 10px;align-items:center;flex-wrap:wrap}
a,button{color:#8fd3ff;background:none;border:1px solid #355779;border-radius:6px;padding:5px 10px;font:inherit;cursor:pointer;text-decoration:none}
pre{white-space:pre-wrap;margin:0 10px 10px;max-height:220px;overflow:auto;background:#1b1b1b;padding:8px;border-radius:6px;font-size:12px}
.step{color:#aaa;font-size:12px;padding:0 10px 8px}
</style></head>
<body><div class="bar"><span id="badge" class="badge">…</span><span id="goal" class="goal">Cloud browser</span></div>
<div class="frame"><iframe id="view" title="Live cloud browser" hidden referrerpolicy="no-referrer" allow="fullscreen"></iframe><div id="empty" class="empty">Waiting for the live browser…</div></div>
<div id="stoperror" class="step" role="alert" hidden></div><div id="step" class="step"></div><pre id="out" hidden></pre>
<div class="foot"><a id="open" target="_blank" rel="noopener noreferrer" hidden>Open on Open-Connect</a><a id="full" target="_blank" rel="noopener noreferrer" hidden>Full screen</a><button id="stop" hidden>Stop</button></div>
<script>
let run=null,timer=null,serial=0;const pending=new Map();
const $=id=>document.getElementById(id);
function unwrap(v){let d=v;try{for(let i=0;i<8;i++){if(typeof d==='string'){d=JSON.parse(d);continue}
if(d&&d.run_id)return d;if(d?.structuredContent){d=d.structuredContent;continue}if(d?.result&&typeof d.result==='object'&&!d.run_id){d=d.result;continue}
if(d?.toolOutput){d=d.toolOutput;continue}if(Array.isArray(d?.content)){d=d.content.find(c=>c.type==='text')?.text;continue}return null}}catch{return null}return null}
function render(v){const d=unwrap(v);if(!d)return false;run=d;
const needsSignIn=d.requires_sign_in===true||d.result?.authenticated===false||d.result?.result?.authenticated===false;
const b=$('badge');b.textContent=needsSignIn?'SIGN-IN REQUIRED':d.status==='RUNNING'?'● LIVE':d.status;b.className='badge '+(d.status==='RUNNING'?'live':needsSignIn?'fail':d.status==='COMPLETED'?'done':d.terminal?'fail':'');
$('goal').textContent=d.goal||'Cloud browser';
const f=$('view');if(d.streaming_url&&!d.terminal){if(f.src!==d.streaming_url)f.src=d.streaming_url;f.hidden=false;$('empty').hidden=true;$('full').href=d.streaming_url;$('full').hidden=false}
else{f.hidden=true;f.removeAttribute('src');$('empty').hidden=false;$('empty').textContent=needsSignIn?'Saved login needs renewal. Open Open-Connect → Direct control to sign in and save.':d.terminal?'Run finished. Live view closed; results are below.':'Waiting for the live browser…';$('full').hidden=true}
if(d.view_url){$('open').href=d.view_url;$('open').hidden=false}
const acts=d.recent_actions||[];$('step').textContent=acts.length&&!d.terminal?'Step '+(d.steps||acts.length)+': '+acts[acts.length-1]:'';
const r=d.result&&typeof d.result==='object'&&'result' in d.result?d.result.result:d.result;
const out=$('out');if(d.terminal&&(r!=null||d.error)){out.textContent=d.error?.message||(typeof r==='string'?r:JSON.stringify(r,null,2));out.hidden=false}else out.hidden=true;
$('stop').hidden=!!d.terminal;schedule();return true}
function rpc(method,params){return new Promise((res,rej)=>{const id='cb-'+(++serial);const t=setTimeout(()=>{pending.delete(id);rej(new Error('timeout'))},15000);pending.set(id,{res,rej,t});window.parent.postMessage({jsonrpc:'2.0',id,method,params},'*')})}
async function call(name,args){if(typeof window.openai?.callTool==='function')return window.openai.callTool(name,args);return rpc('tools/call',{name,arguments:args})}
function schedule(){clearTimeout(timer);if(run&&!run.terminal)timer=setTimeout(async()=>{try{render(await call('cloud_browser_get_run',{run_id:run.run_id}))}catch{schedule()}},4000)}
$('stop').onclick=async()=>{if(!run)return;$('stoperror').hidden=true;$('stop').disabled=true;try{await call('cloud_browser_cancel_run',{run_id:run.run_id});render(await call('cloud_browser_get_run',{run_id:run.run_id}))}catch{$('stoperror').textContent='Stop was not confirmed. Open Open-Connect to check this run before retrying.';$('stoperror').hidden=false}$('stop').disabled=false};
window.addEventListener('message',e=>{if(e.source!==window.parent)return;const m=e.data;if(!m||m.jsonrpc!=='2.0')return;if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.t);m.error?p.rej(m.error):p.res(m.result);return}
if(m.method==='ui/notifications/tool-result')render(m.params)});
window.addEventListener('openai:set_globals',e=>{const g=e.detail?.globals;render(g?.toolOutput)});
(async()=>{if(typeof window.openai?.callTool!=='function'){try{await rpc('ui/initialize',{appInfo:{name:'Open-Connect Cloud Browser',version:'1.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'});window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}},'*')}catch{}}
render(window.openai?.toolOutput)})();
</script></body></html>`;
