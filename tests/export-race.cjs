const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'qa');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;const name=pathname==='/'?'index.html':pathname.slice(1);if(name.includes('..')){res.writeHead(403);return res.end();}try{const body=fs.readFileSync(path.join(root,name));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'})[path.extname(name)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end();}});
(async()=>{
 await new Promise(r=>server.listen(8095,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
 await ctx.addInitScript(()=>{window.exportJobIds=[];const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{postMessage(data,...rest){if(data.jobId){window.activeTestWorker=this;window.exportJobIds.push(data.jobId);if(window.holdJobs)return;}return super.postMessage(data,...rest);}};});
 const page=await ctx.newPage();
 try{
 await page.goto('http://127.0.0.1:8095/');await page.locator('#file').setInputFiles(path.join(qa,'landscape.mp4'));await page.waitForFunction(()=>!document.querySelector('#export').disabled);
 async function run(){await page.locator('#export').click();await page.locator('#startExport').click();await page.waitForFunction(()=>!document.querySelector('#download').hidden,{},{timeout:60000});await page.locator('#closeExport').click();}
 await run();
 await page.evaluate(()=>{
  const native=navigator.storage.getDirectory.bind(navigator.storage);window.removed=[];let held=false;
  navigator.storage.getDirectory=async()=>{
   const root=await native();const wrapped={removeEntry:async name=>{window.removed.push(name);try{await root.removeEntry(name);}finally{window.cleanupSettled=true;}}};
   if(!held){held=true;return new Promise(resolve=>window.finishOldCleanup=()=>resolve(wrapped));}
   return wrapped;
  };
 });
 await page.locator('#previewPortrait').click();await page.waitForFunction(()=>!!window.finishOldCleanup);
 await run();const jobIds=await page.evaluate(()=>exportJobIds.slice());const newest=jobIds.at(-1);
 await page.evaluate(()=>{window.cleanupSettled=false;window.finishOldCleanup();});await page.waitForFunction(()=>window.cleanupSettled);
 const deleted=await page.evaluate(()=>window.removed.slice()),staleCleanupDeletedNewJob=deleted.includes(newest);
 const rounded=await page.evaluate(async()=>{const {formatTime}=await import('./src/model.js');return formatTime(59.96);});
 const baseCount=await page.evaluate(()=>exportJobIds.length);
 await page.evaluate(()=>{
  window.holdJobs=true;let first=true;
  Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:()=>{if(first){first=false;return new Promise(resolve=>window.releaseOldWakeLock=()=>resolve({release:()=>Promise.resolve()}));}return Promise.resolve({release:()=>Promise.resolve()});}}});
 });
 await page.locator('#export').click();await page.locator('#startExport').click();await page.waitForFunction(()=>!!window.releaseOldWakeLock);
 await page.locator('#cancelExport').click();await page.waitForFunction(()=>!document.body.classList.contains('busy'));
 await page.locator('#startExport').click();await page.waitForFunction(n=>exportJobIds.length>n,baseCount);
 await page.evaluate(()=>window.releaseOldWakeLock());await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const restartJobs=await page.evaluate(n=>exportJobIds.length-n,baseCount);
 await page.locator('#cancelExport').click();await page.waitForFunction(()=>!document.body.classList.contains('busy'));
 // Rapid repeat presses of the same start button must still start one task.
 const beforeDouble=await page.evaluate(()=>exportJobIds.length);
 await page.evaluate(()=>{document.querySelector('#startExport').click();document.querySelector('#startExport').click();});
 await page.waitForFunction(n=>exportJobIds.length>n,beforeDouble);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
 const doubleClickJobs=await page.evaluate(n=>exportJobIds.length-n,beforeDouble);
 await page.locator('#cancelExport').click();await page.waitForFunction(()=>!document.body.classList.contains('busy'));
 let failureRetained=false,retryAfterFailure=false;
 if(!process.env.OBSERVE_BUG){
  const count=await page.evaluate(()=>exportJobIds.length);
  await page.locator('#startExport').click();await page.waitForFunction(n=>exportJobIds.length>n,count);
  await page.evaluate(()=>window.activeTestWorker.dispatchEvent(new MessageEvent('message',{data:{type:'error',message:'TEST_REPEAT_FAILURE'}})));
  await page.waitForFunction(()=>!document.body.classList.contains('busy'));
  const error=await page.evaluate(()=>JSON.parse(localStorage.getItem('iphone-last-export-error')));
  assert.equal(error.error,'TEST_REPEAT_FAILURE');assert.ok(error.attempt.duration>0);
  await page.evaluate(()=>window.holdJobs=false);
  await page.locator('#startExport').click();await page.waitForFunction(()=>!document.querySelector('#download').hidden,{},{timeout:60000});retryAfterFailure=true;
  await page.reload();await page.locator('#diagnostics').click();await page.waitForFunction(()=>document.querySelector('#deviceInfo').textContent.includes('TEST_REPEAT_FAILURE'));failureRetained=true;
 }
 const report={jobIds,deleted,staleCleanupDeletedNewJob,formatAt59_96:rounded,restartJobs,doubleClickJobs,failureRetained,retryAfterFailure};
 console.log(JSON.stringify(report,null,2));
 fs.writeFileSync(path.join(qa,!process.env.OBSERVE_BUG?'race-after.json':'race-before.json'),JSON.stringify(report,null,2));
 if(!process.env.OBSERVE_BUG){assert.equal(staleCleanupDeletedNewJob,false);assert.equal(rounded,'01:00.0');assert.equal(restartJobs,1);assert.equal(doubleClickJobs,1);}
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

