const { chromium } = require('playwright');
const fs = require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'qa');fs.mkdirSync(qa,{recursive:true});
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const target=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{const body=fs.readFileSync(target);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'})[path.extname(target)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(8093,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1,acceptDownloads:true});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const reports=[];const check=(name,detail)=>{reports.push({name,detail});console.log('PASS',name,JSON.stringify(detail||''));};
 try{
 await page.goto('http://127.0.0.1:8093/');await page.waitForFunction(()=>!!document.querySelector('#importHero').onclick);
 await page.screenshot({path:path.join(qa,'mobile-empty.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);check('390px no horizontal overflow');
 await page.locator('#file').setInputFiles(path.join(qa,'landscape.mp4'));
 await page.waitForFunction(()=>!document.querySelector('#export').disabled,{},{timeout:45000});
 await page.locator('#in').fill('1');await page.locator('#in').dispatchEvent('change');
 await page.locator('#out').fill('5');await page.locator('#out').dispatchEvent('change');
 assert.equal(await page.locator('#duration').textContent(),'4.00 s');check('trim 1–5 seconds');
 await page.locator('#undo').click();assert.notEqual(await page.locator('#duration').textContent(),'4.00 s');
 await page.locator('#redo').click();assert.equal(await page.locator('#duration').textContent(),'4.00 s');check('undo / redo');
 await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#video').currentTime>1.15);await page.locator('#play').click();check('preview plays original audio',await page.locator('#audioInfo').textContent());
 await page.locator('#saveDraft').click();await page.waitForFunction(()=>document.querySelector('#draftState').textContent.includes('已儲存'));
 await page.reload();await page.locator('#restore').waitFor({state:'visible'});await page.locator('#restore').click();
 await page.waitForFunction(()=>!document.querySelector('#export').disabled);
 assert.equal(await page.locator('#duration').textContent(),'4.00 s');check('draft survives reload with original media');
 await page.waitForFunction(()=>{const v=document.querySelector('#video');return !v.seeking&&v.readyState>=2;});
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await page.screenshot({path:path.join(qa,'mobile-editor.png'),fullPage:true});
 const previewMean=await page.evaluate(()=>{const v=document.querySelector('#video'),c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d');x.drawImage(v,0,0,32,32);const a=x.getImageData(0,0,32,32).data;let sum=0;for(let i=0;i<a.length;i+=4)sum+=a[i]+a[i+1]+a[i+2];return sum/(32*32*3);});assert.ok(previewMean>20);check('restored preview has decoded pixels',previewMean);
 async function exportAndSave(name){
  await page.locator('#export').click();await page.locator('#startExport').click();
  await page.waitForFunction(()=>!document.querySelector('#download').hidden||(!document.body.classList.contains('busy')&&document.querySelector('#exportStatus').textContent.includes('失敗')),{},{timeout:120000}).catch(async e=>{throw new Error(e.message+' STATUS '+await page.locator('#exportStatus').textContent());});
  if(await page.locator('#download').isHidden())throw new Error(await page.locator('#exportStatus').textContent());
  const dl=page.waitForEvent('download');await page.locator('#download').click();await(await dl).saveAs(path.join(qa,name));
  await page.locator('#closeExport').click();
 }
 await exportAndSave('output-landscape.mp4');check('landscape MP4 export/download');
 await page.locator('#diagnostics').click();await page.waitForFunction(()=>document.querySelector('#deviceInfo').textContent.includes('h264_720p'));
 const diag=JSON.parse(await page.locator('#deviceInfo').textContent());assert.equal(diag.lastOutput.audio,'aac');assert.equal(diag.lastOutput.width,1280);assert.equal(diag.lastOutput.height,720);check('output metadata',diag.lastOutput);
 await page.locator('#closeDevice').click();
 await page.locator('#export').click();await page.locator('#startExport').click();await page.locator('#cancelExport').click();await page.waitForFunction(()=>!document.body.classList.contains('busy'));assert.match(await page.locator('#exportStatus').textContent(),/取消/);await page.locator('#closeExport').click();check('cancel active export');
 await exportAndSave('output-retry.mp4');check('export retry after cancellation');
 await page.locator('#file').setInputFiles(path.join(qa,'portrait.mp4'));await page.waitForFunction(()=>document.querySelector('#filename').textContent==='portrait.mp4');
 await exportAndSave('output-portrait.mp4');check('portrait output');
 await page.locator('#file').setInputFiles(path.join(qa,'rotated.mp4'));await page.waitForFunction(()=>document.querySelector('#filename').textContent==='rotated.mp4');await exportAndSave('output-rotated.mp4');check('rotation metadata export');
 await page.locator('#theme').click();await page.screenshot({path:path.join(qa,'mobile-light.png'),fullPage:true});check('light theme');
 await page.setViewportSize({width:844,height:390});await page.screenshot({path:path.join(qa,'landscape-ui.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);check('landscape viewport');
 await page.locator('#language').click();assert.equal(await page.locator('#export').textContent(),'Export');check('English');
 assert.deepEqual(errors,[]);check('no uncaught browser errors');
 fs.writeFileSync(path.join(qa,'browser-report.json'),JSON.stringify({browser:'Windows Edge mobile viewport (NOT real iPhone)',reports,errors,diagnostic:diag},null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

