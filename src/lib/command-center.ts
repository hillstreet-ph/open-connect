export const COMMAND_CENTER_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:14px system-ui;margin:0;background:#08111f;color:#e5eefb}.app{padding:18px}.head{display:flex;justify-content:space-between;gap:12px;align-items:center}.badge{padding:5px 9px;border-radius:999px;background:#12315c;color:#8fd3ff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:14px}.card{border:1px solid #24415f;border-radius:12px;padding:13px;background:#0d1b2d}.muted{color:#91a6bd}.ok{color:#6ee7a8}</style></head>
<body><main class="app"><div class="head"><div><strong>Open-Connect Command Center</strong><div class="muted">Autonomous control with governed writes</div></div><span id="access" class="badge">Checking access</span></div><section id="grid" class="grid"><div class="card">Waiting for Open-Connect status…</div></section></main>
<script>
const grid=document.getElementById('grid');
function render(data){
  let d=data;
  try {
    for(let i=0;i<4;i++){
      if(typeof d==='string'){d=JSON.parse(d);continue}
      if(d?.structuredContent){d=d.structuredContent;continue}
      if(Array.isArray(d?.content)){d=d.content.find(c=>c.type==='text')?.text;continue}
      break;
    }
  } catch { return; }
  if(!d||typeof d!=='object'||!d.planes)return;
  const scopes=Array.isArray(d.scopes)?d.scopes:[];
  document.getElementById('access').textContent=scopes.includes('control:write')?'Control write granted':'Limited access';
  const items=[['Gateway',d.gateway||'open-connect.site'],['Resources',d.planes?.resources?.published??'Unavailable'],['Connections',d.planes?.connections?.connected??'Unavailable'],['Access',scopes.length?scopes.join(', '):'No scopes reported']];
  grid.replaceChildren();
  for(const [k,v] of items){
    const card=document.createElement('div');card.className='card';
    const label=document.createElement('div');label.className='muted';label.textContent=k;
    const value=document.createElement('div');value.className='ok';value.textContent=String(v);value.style.overflowWrap='anywhere';
    card.append(label,value);grid.append(card);
  }
}
window.addEventListener('message',e=>{const m=e.data;if(m?.method==='ui/notifications/tool-result')render(m.params)});

if(window.openai?.toolOutput)render(window.openai.toolOutput);
</script></body></html>`;
