import test from "node:test";
import assert from "node:assert/strict";
import { assertNotionProjectAccount } from "./notion-account-routing.ts";
import { callManagedMcpTool, listManagedMcpTools } from "./managed-mcp.server.ts";

const bindings = [
  {project_id:"software-project", connection_id:"technical-connection", account_id:"ca_technical", workspace:"kobeplay"},
  {project_id:"legal-project", connection_id:"personal-connection", account_id:"ca_personal", workspace:"justin_town"},
];
const policy = (values: unknown = bindings) => JSON.stringify({version:1,cross_workspace_sync:false,bindings:values});
const technical = {projectId:"software-project",connectionId:"technical-connection"};
const personal = {projectId:"legal-project",connectionId:"personal-connection"};
const ref = (id: string) => "composio://connected-account/" + id;

test("exact technical and personal bindings are allowed independently", () => {
  assertNotionProjectAccount("notion",ref("ca_technical"),technical,policy());
  assertNotionProjectAccount("notion",ref("ca_personal"),personal,policy());
});
test("absent opt-in policy preserves legacy behavior and unrelated providers", () => {
  assertNotionProjectAccount("notion","legacy",undefined,"");
  assertNotionProjectAccount("github","legacy",undefined,"not-json");
});
for (const [name, context, account] of [
  ["unscoped",undefined,"ca_technical"],
  ["unknown project",{...technical,projectId:"unknown"},"ca_technical"],
  ["wrong selected connection",personal,"ca_technical"],
  ["wrong account",technical,"ca_personal"],
  ["wrong connection id",{...technical,connectionId:"personal-connection"},"ca_technical"],
] as const) test("configured policy denies " + name,()=>assert.throws(()=>assertNotionProjectAccount("notion",ref(account),context,policy()),/Notion routing is unavailable/));
for(const [name, raw] of [
  ["malformed","{"], ["empty list",policy([])], ["duplicate project",policy([...bindings,bindings[0]])],
  ["sync enabled",JSON.stringify({version:1,cross_workspace_sync:true,bindings})],
  ["unknown workspace",policy([{...bindings[0],workspace:"unknown"}])],
  ["same account in both workspaces",policy([bindings[0],{...bindings[1],account_id:"ca_technical"}])],
  ["one connection with two accounts",policy([bindings[0],{...bindings[1],connection_id:"technical-connection"}])],
  ["conflicting workspace account",policy([bindings[0],{...bindings[1],workspace:"kobeplay"}])],
  ["secret-looking value",policy([{...bindings[0],account_id:"private fixture secret"}])],
  ["too large","x".repeat(131073)],
] as const) test("configured policy fails closed: " + name,()=>{
  assert.throws(()=>assertNotionProjectAccount("notion",ref("ca_technical"),technical,raw),(error:unknown)=>{
    assert.equal((error as Error).message,"Notion routing is unavailable or this project/account is not approved.");
    return true;
  });
});

async function fixture(run:(calls:Array<{url:string;body:Record<string,unknown>}>, state:{foreign:boolean})=>Promise<void>){
  const prior = {fetch:globalThis.fetch,key:process.env["COMPOSIO_API_KEY"],mapping:process.env["COMPOSIO_USER_MAPPINGS"],routing:process.env["NOTION_PROJECT_ACCOUNT_BINDINGS"]};
  process.env["COMPOSIO_API_KEY"]="fixture-key";
  process.env["NOTION_PROJECT_ACCOUNT_BINDINGS"]=policy();
  delete process.env["COMPOSIO_USER_MAPPINGS"];
  const calls:Array<{url:string;body:Record<string,unknown>}>=[];
  const state={foreign:false};
  const tool={slug:"NOTION_FETCH_PAGE",toolkit:{slug:"notion"},version:"fixture-version",input_parameters:{type:"object",properties:{}}};
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    const body=init?.body?JSON.parse(String(init.body)):{};
    calls.push({url,body});
    if(url.includes("/connected_accounts/"))return Response.json({id:url.split("/").pop(),user_id:state.foreign?"other":"owner",status:"ACTIVE",toolkit:{slug:"notion"}});
    if(url.includes("/tools/execute/"))return Response.json({successful:true,data:{ok:true}});
    if(url.includes("/tools?"))return Response.json({items:[tool]});
    return Response.json(tool);
  };
  try{await run(calls,state);}finally{
    globalThis.fetch=prior.fetch;
    for(const [key,value] of Object.entries({COMPOSIO_API_KEY:prior.key,COMPOSIO_USER_MAPPINGS:prior.mapping,NOTION_PROJECT_ACCOUNT_BINDINGS:prior.routing})){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
}
test("wrong-account discovery and execution are denied before any broker call",()=>fixture(async(calls)=>{
  await assert.rejects(listManagedMcpTools("owner","notion",ref("ca_technical"),personal),/Managed tool discovery failed/);
  const result=await callManagedMcpTool("owner","notion",ref("ca_technical"),"NOTION_FETCH_PAGE",{},personal);
  assert.equal(result.isError,true);assert.equal(calls.length,0);
}));
test("direct executor callers cannot bypass configured routing by omitting context",()=>fixture(async(calls)=>{
  assert.equal((await callManagedMcpTool("owner","notion",ref("ca_technical"),"NOTION_FETCH_PAGE",{})).isError,true);
  await assert.rejects(listManagedMcpTools("owner","notion",ref("ca_technical")));
  assert.equal(calls.length,0);
}));
test("exact approved route retains broker ownership checks and account pinning",()=>fixture(async(calls,state)=>{
  const tools=await listManagedMcpTools("owner","notion",ref("ca_technical"),technical);
  assert.equal(tools.length,1);
  const result=await callManagedMcpTool("owner","notion",ref("ca_technical"),"NOTION_FETCH_PAGE",{connectionId:"personal-connection",projectId:"legal-project"},technical);
  assert.equal(result.isError,false);
  const executed=calls.find(c=>c.url.includes("/tools/execute/"));
  assert.equal(executed?.body["connected_account_id"],"ca_technical");
  assert.equal(executed?.body["user_id"],"owner");
  assert.equal(executed?.body["version"],"fixture-version");
  calls.length=0;state.foreign=true;
  assert.equal((await callManagedMcpTool("owner","notion",ref("ca_technical"),"NOTION_FETCH_PAGE",{},technical)).isError,true);
  assert.equal(calls.length,1);assert.ok(!calls.some(c=>c.url.includes("/tools/execute/")));
}));
