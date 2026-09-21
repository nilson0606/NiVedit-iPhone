const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'qa'),prefix='/NiVedit-iPhone/';
const currentVersion=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
let latest=false,corrupt=false;const oldFiles=new Map(),requests=[];
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),name=decodeURIComponent(url.pathname).slice(prefix.length)||'index.html';
 if(!url.pathname.startsWith(prefix)||name.includes('..')){res.writeHead(404);return res.end();}
 requests.push({name,query:url.search,latest});
 try{
  let bytes;
  if(latest){bytes=fs.readFileSync(path.join(root,name));if(corrupt&&name==='src/model.js')bytes=Buffer.from("export const VERSION='stale';");}
  else{if(!oldFiles.has(name))oldFiles.set(name,execFileSync('git',['show','7972ea3:'+name],{cwd:root,maxBuffer:20*1024*1024,stdio:['ignore','pipe','pipe']}));bytes=oldFiles.get(name);}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(name)]||'application/octet-stream');
  // Simulate an aggressively cached previous deployment.
  res.setHeader('Cache-Control','public, max-age=31536000');res.end(bytes);
 }catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(8094,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage(),url='http://127.0.0.1:8094'+prefix,report=[];
 const pass=name=>{report.push(name);console.log('PASS',name);};
 try{
  await page.goto(url);await page.waitForFunction(()=>!!document.querySelector('#importHero').onclick);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();assert.match(await page.locator('.badge').textContent(),/0.1.2/);
  await page.locator('#file').setInputFiles(path.join(qa,'landscape.mp4'));
  await page.waitForFunction(()=>!document.querySelector('#export').disabled);
  await page.locator('#in').fill('1');await page.locator('#in').dispatchEvent('change');
  await page.locator('#saveDraft').click();await page.waitForFunction(()=>document.querySelector('#draftState').textContent.includes('已儲存'));
  const saved=await page.evaluate(async()=>{const {draft}=await import('./src/storage.js');const d=await draft('get');return {size:d.file.size,project:d.project,bytes:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await d.file.arrayBuffer())))};});
  pass('0.1.2 installed and real media draft saved');
  // Opening the recovery page is non-destructive. Do not activate without a click.
  latest=true;
  const updater=await context.newPage();await updater.goto(url+'update.html');
  assert.match(await page.locator('.badge').textContent(),/0.1.2/);
  await updater.locator('#update').click();
  await updater.waitForURL(url=>url.searchParams.get('updated')===currentVersion,{timeout:90000});
  await updater.waitForFunction(()=>!!document.querySelector('#importHero').onclick);
  assert.ok((await updater.locator('.badge').textContent()).includes(currentVersion));pass('explicit recovery upgrades while old app tab remains open');
  const savedAfter=await updater.evaluate(async()=>{const {draft}=await import('./src/storage.js');const d=await draft('get');return {size:d.file.size,project:d.project,bytes:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await d.file.arrayBuffer())))};});
  assert.deepEqual(savedAfter,saved);pass('draft values and original media bytes unchanged');
  await updater.locator('#projectMenu').click();await updater.locator('.project-row').first().getByRole('button',{name:'開啟',exact:true}).click();await updater.waitForFunction(()=>!document.querySelector('#export').disabled);
  assert.equal(await updater.locator('#in').inputValue(),'1.00');
  assert.equal(await updater.locator('#saveDraft').count(),0);assert.equal(await updater.locator('#restore').count(),0);pass('draft UI removed; old draft copied safely to project list');
  await updater.locator('#previewPortrait').click();assert.equal(await updater.locator('#previewPortrait').getAttribute('aria-pressed'),'true');pass('legacy draft recovered as named project and editable');
  assert.ok(requests.some(r=>r.latest&&r.name==='src/app.js'&&r.query.includes('__nivedit_release='+currentVersion)));pass('new assets bypass previous HTTP cache');
  // Latest shell and restored draft must continue to work offline.
  await updater.locator('#saveProjectQuick').click();await updater.waitForFunction(()=>document.querySelector('#saveState').textContent.includes('已儲存'));
  await context.setOffline(true);await updater.reload();await updater.waitForFunction(()=>!!document.querySelector('#importHero').onclick);
  assert.ok((await updater.locator('.badge').textContent()).includes(currentVersion));await updater.locator('#projectMenu').click();await updater.locator('.project-row').first().getByRole('button',{name:'開啟',exact:true}).click();await updater.waitForFunction(()=>!document.querySelector('#export').disabled);pass('updated app and recovered project reopen offline');
  await context.setOffline(false);await page.close();await updater.close();
  // A mixed release must never activate.
  const isolated=await browser.newContext(),bad=await isolated.newPage();corrupt=true;
  await bad.goto(url+'update.html');
  const state=await bad.evaluate(async()=>{
   const registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
   const worker=registration.installing;
   if(!worker)return registration.active?'active':'no-install';
   if(worker.state==='redundant')return 'redundant';
   return new Promise(resolve=>{const timer=setTimeout(()=>resolve('timeout'),20000);worker.addEventListener('statechange',()=>{if(['redundant','activated'].includes(worker.state)){clearTimeout(timer);resolve(worker.state);}});});
  });
  assert.equal(state,'redundant');pass('mixed-version asset hashes reject installation');
  await isolated.close();
  fs.writeFileSync(path.join(qa,'update-report.json'),JSON.stringify({browser:'Windows Edge; iPhone confirmation pending',report},null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

