const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../source/content/core.js'), 'utf8');

function setup() {
  const prefs = new Map(), logins = [], xhrs = [], saved = [], alerts = [];
  let transactionActive = false;
  let response = {status:200, text:'{"choices":[{"message":{"content":"术语解释"}}]}'};
  class XHR {
    constructor(options) { this.options = options; this.headers = {}; this.channel = {QueryInterface(){return this;}}; xhrs.push(this); }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(k,v) { this.headers[k] = v; }
    send(body) { this.body = body; this.status = response.status; this.responseText = response.text;
      if (!response.hold) queueMicrotask(() => this[response.event || 'onload']?.()); }
    abort() { this.onabort?.(); }
  }
  const attachment = {id:1,libraryID:1,parentID:2,attachmentContentType:'application/pdf',isEditable:()=>true};
  const item = {key:'OLD', parentID:1,annotationComment:'原评论',isEditable:()=>true,save:async()=>saved.push('existing')};
  const Zotero = {
    Prefs:{get:k=>prefs.get(k),set:(k,v)=>prefs.set(k,v)},
    Reader:{registerEventListener(){},unregisterEventListener(){}},
    Items:{get:id=>id===1?attachment:{getField:()=> '论文标题'},getByLibraryAndKey:()=>item},
    DB:{executeTransaction:async fn=>{transactionActive=true;try{return await fn();}finally{transactionActive=false;}}},
    Annotations:{toJSON:async()=>({readOnly:false}),saveFromJSON:async(a,b)=>{assert.equal(transactionActive,false,'saveFromJSON 自行管理事务，不得嵌套');saved.push(b);}},
    DataObjectUtilities:{generateKey:()=> 'NEW'},
    ProgressWindow:class {changeHeadline(){} show(){} startCloseTimer(){}},
  };
  const Services = {
    io:{newURI(s){const u=new URL(s); return {scheme:u.protocol.slice(0,-1),host:u.hostname,userPass:u.username+u.password,query:u.search,ref:u.hash,pathQueryRef:u.pathname+u.search+u.hash,spec:u.href};}},
    logins:{searchLoginsAsync:async()=>logins,removeLogin:l=>logins.splice(logins.indexOf(l),1),modifyLogin:(a,b)=>logins.splice(logins.indexOf(a),1,b),addLoginAsync:async l=>logins.push(l)},
    prompt:{alert:(_w,_t,message)=>alerts.push(message)}
  };
  const Components = {interfaces:{},classes:{'@mozilla.org/login-manager/loginInfo;1':{createInstance:()=>({init(origin,unused,realm,username,password){Object.assign(this,{origin,username,password});}})}}};
  const context = vm.createContext({Zotero,Services,Components,XMLHttpRequest:XHR});
  vm.runInContext(source,context);
  const api=context.TermAI; api.start('test');
  return {api,prefs,logins,xhrs,saved,alerts,item,attachment,setResponse:r=>response=r};
}
const annotation={text:'Gaussian splatting',position:{pageIndex:0,rects:[[1,2,3,4]]},sortIndex:'00000|000001|00000'};
function configure(api,more={}) { api.pref('config',JSON.stringify({baseURL:'https://example.com/v1',model:'test',consent:true,extra:'{}',...more})); }
test('评论默认放大为 16 px，允许保存独立字号',()=>{
  const {api}=setup();assert.equal(api.commentFontSize(),16);
  api.setCommentFontSize('22');assert.equal(api.commentFontSize(),22);
  assert.equal(api.pref('config'),'');
});
test('拒绝超范围、空值和非整数字号',()=>{
  const {api}=setup();for(const v of ['',9,33,16.5,'bad'])assert.throws(()=>api.setCommentFontSize(v));
  assert.equal(api.commentFontSize(),16);
});

function selectionButton(api) {
  const nodes=[];
  const doc={getElementById(){return null;},head:{append(node){node.parentNode=this;}},createElement(tag){
    return {tag,ownerDocument:doc,style:{},attributes:{},handlers:{},children:[],disabled:false,
      setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},
      remove(){this.parentNode=null;},
      addEventListener(k,fn){this.handlers[k]=fn;},replaceChildren(...children){this.children=children;},
      animate(frames,options){this.animation={frames,options,cancelled:false,cancel(){this.cancelled=true;}};return this.animation;}
    };
  }};
  const handler=api.listeners.find(([type])=>type==='renderTextSelectionPopup')[1];
  handler({doc,params:{annotation},reader:{itemID:1},append:n=>nodes.push(n)});
  return nodes;
}
test('选区弹窗仅显示 AI 解释，不显示 API 配置',()=>{
  const {api}=setup();const nodes=selectionButton(api);
  assert.equal(nodes.length,1);assert.equal(nodes[0].textContent,'AI 解释');
});
test('点击立即转圈、禁用重复点击，完成后恢复',async()=>{
  const {api}=setup();const [button]=selectionButton(api);
  let finish,calls=0;api.open=()=>{calls++;return new Promise(resolve=>finish=resolve);};
  const event={preventDefault(){},stopPropagation(){}};
  const work=button.handlers.click(event);
  assert.equal(button.disabled,true);assert.equal(button.attributes['aria-busy'],'true');
  const spinner=button.children[0];assert.match(spinner.style.animation,/infinite/);
  assert.equal(button.children[1].textContent,'解释中…');
  await button.handlers.click(event);assert.equal(calls,1);
  finish();await work;
  assert.equal(button.disabled,false);assert.equal(button.textContent,'AI 解释');
  assert.equal(spinner.style.animation,'none');assert.equal(api.loadingButtons.size,0);
});
test('请求抛错或提前返回时停止转圈',async()=>{
  const {api}=setup();const [button]=selectionButton(api);
  api.open=async()=>{throw new Error('test failure');};
  await assert.rejects(api.explainFromButton(button,{itemID:1},annotation),/test failure/);
  assert.equal(button.disabled,false);assert.equal(api.loadingButtons.size,0);
  api.open=async()=>{};
  await api.explainFromButton(button,{itemID:1},annotation);
  assert.equal(button.attributes['aria-busy'],undefined);
});
test('插件停用立即清理转圈状态',async()=>{
  const {api}=setup();const [button]=selectionButton(api);
  let finish;api.open=()=>new Promise(resolve=>finish=resolve);
  const work=api.explainFromButton(button,{itemID:1},annotation);
  const spinner=button.children[0];api.stop();
  assert.equal(spinner.style.animation,'none');assert.equal(button.disabled,false);
  assert.equal(api.loadingButtons.size,0);finish();await work;
});

test('规范化基础地址和完整接口地址',()=>{const {api}=setup(); for(const s of [' https://example.com/v1/ ','https://example.com/v1/chat/completions/']) assert.equal(api.baseURL(s),'https://example.com/v1');});
test('允许 HTTPS 与本地 HTTP IPv4/IPv6',()=>{const {api}=setup();for(const s of ['https://example.com/v1','http://localhost:1234/v1','http://127.0.0.1:8080/v1','http://[::1]:8080/v1']) assert.equal(api.baseURL(s),s);});
test('拒绝不安全地址、内嵌凭据、查询参数与片段',()=>{const {api}=setup();for(const s of ['', 'http://example.com/v1','file:///tmp','https://user:pass@example.com/v1','https://example.com/v1?q=a','https://example.com/v1#x']) assert.throws(()=>api.baseURL(s));});
test('额外参数白名单与对象验证',()=>{const {api}=setup();assert.equal(api.extra('{"temperature":0.2}').temperature,0.2);for(const s of ['[]','null','broken','{"messages":[]}','{"stream":true}']) assert.throws(()=>api.extra(s));});
test('密钥保存、覆盖、地址隔离与删除',async()=>{const {api,prefs}=setup();await api.storeKey('a','secret');await api.storeKey('b','second');await api.storeKey('a','changed');assert.equal(await api.getKey('a'),'changed');await api.storeKey('a','');assert.equal(await api.getKey('a'),'');assert.equal(await api.getKey('b'),'second');assert.equal(prefs.size,0);});
test('POST 请求携带 Bearer、禁止重定向并正确解析响应',async()=>{const {api,xhrs}=setup();const data=await api.request('https://example.com/v1/chat/completions','secret',{model:'x'});assert.equal(data.choices[0].message.content,'术语解释');assert.equal(xhrs[0].headers.Authorization,'Bearer secret');assert.equal(xhrs[0].channel.redirectionLimit,0);assert.equal(xhrs[0].options.mozAnon,true);assert.equal(api.requests.size,0);});
test('GET 模型列表及免密服务',async()=>{const {api,xhrs}=setup();await api.request('http://localhost:1234/v1/models','');assert.equal(xhrs[0].method,'GET');assert.equal(xhrs[0].headers.Authorization,undefined);});
for(const status of [301,401,403,404,429,500]) test('处理 HTTP '+status,async()=>{const {api,setResponse}=setup();setResponse({status,text:'{}'});await assert.rejects(api.request('https://example.com/chat/completions',''),new RegExp('HTTP '+status));assert.equal(api.requests.size,0);});
for(const event of ['onerror','ontimeout','onabort']) test('处理 '+event,async()=>{const {api,setResponse}=setup();setResponse({event});await assert.rejects(api.request('https://example.com/chat/completions',''));assert.equal(api.requests.size,0);});
test('拒绝非 JSON 和超大响应',async()=>{const {api,setResponse}=setup();for(const text of ['not-json','x'.repeat(2000001)]){setResponse({status:200,text});await assert.rejects(api.request('https://example.com/chat/completions',''));}});
test('发送前拒绝危险 URL',async()=>{const {api,xhrs}=setup();await assert.rejects(api.request('http://example.com/chat/completions','secret'));assert.equal(xhrs.length,0);});
test('新建高亮并写入解释，默认不发送标题',async()=>{const {api,saved,xhrs}=setup();configure(api);await api.open({itemID:1},annotation);assert.equal(saved.length,1);assert.match(saved[0].comment,/术语解释/);assert.equal(JSON.parse(JSON.parse(xhrs[0].body).messages[1].content).paper_title,'');});
test('已有评论保留，授权后发送标题',async()=>{const {api,item,xhrs}=setup();configure(api,{sendTitle:true});await api.open({itemID:1},annotation,'OLD');assert.match(item.annotationComment,/^原评论\n\n/);assert.equal(JSON.parse(JSON.parse(xhrs[0].body).messages[1].content).paper_title,'论文标题');});
test('并发和重复点击不重复写入',async()=>{const {api,saved,xhrs}=setup();configure(api);await Promise.all([api.open({itemID:1},annotation),api.open({itemID:1},annotation)]);await api.open({itemID:1},annotation);assert.equal(saved.length,1);assert.equal(xhrs.length,1);});
test('未配置或未授权时打开设置、不发送请求',async()=>{const {api,xhrs}=setup();let count=0;api.settings=()=>count++;await api.open({itemID:1},annotation);configure(api,{consent:false});await api.open({itemID:1},annotation);assert.equal(count,2);assert.equal(xhrs.length,0);});
test('错误响应不写入注释且允许重试',async()=>{const {api,setResponse,saved}=setup();configure(api);setResponse({status:200,text:'{"choices":[]}'});await api.open({itemID:1},annotation);assert.equal(saved.length,0);assert.equal(api.pending.size,0);assert.equal(api.done.size,0);});
test('只读、超长或缺少定位的选区不发送请求',async()=>{const {api,xhrs}=setup();configure(api);for(const a of [{...annotation,readOnly:true},{...annotation,text:'x'.repeat(4001)},{...annotation,position:null}])await api.open({itemID:1},a);assert.equal(xhrs.length,0);});
test('停用取消未完成请求且拒绝后续调用',async()=>{const {api,setResponse}=setup();setResponse({hold:true});const p=api.request('https://example.com/chat/completions','');api.stop();await assert.rejects(p,/取消/);assert.equal(api.requests.size,0);await assert.rejects(api.request('https://example.com/chat/completions',''),/停用/);});
test('请求期间附件被删除或权限改变则不保存',async()=>{const {api,attachment,saved}=setup();configure(api);const old=api.request.bind(api);api.request=async(...args)=>{const data=await old(...args);attachment.isEditable=()=>false;return data;};await api.open({itemID:1},annotation);assert.equal(saved.length,0);});
