const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'qa'),baseline=process.env.PREVIEW_BASELINE,report=[],errors=[];
let stallNextWorker=false;
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://local').pathname),relative=name==='/'?'index.html':name.slice(1),file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{
  let body=baseline&&!relative.startsWith('qa/')?execFileSync('git',['show',baseline+':'+relative],{cwd:root,maxBuffer:20*1024*1024,stdio:['ignore','pipe','ignore']}):fs.readFileSync(file);
  if(relative==='src/preview-worker.js'&&stallNextWorker){const afterStart=stallNextWorker==='after-start';stallNextWorker=false;body=Buffer.concat([body,Buffer.from("\nconst originalHandler=self.onmessage;let frameRequests=0;self.onmessage=event=>{if(event.data.type==='frame'&&++frameRequests>"+(afterStart?5:0)+"){while(true){}}return originalHandler(event);};")]);}
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(body);
 }catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(8099,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--autoplay-policy=document-user-activation-required']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await context.addInitScript(()=>{
  window.workerCount=0;window.mainDecoders={video:0,audio:0};
  const OriginalWorker=Worker;window.Worker=class extends OriginalWorker{
   constructor(...args){super(...args);if(String(args[0]).includes('preview-worker')){this.counted=true;workerCount++;}}
   terminate(){if(this.counted){this.counted=false;workerCount--;}return super.terminate();}
  };
  for(const [name,key]of [['VideoDecoder','video'],['AudioDecoder','audio']]){
   const Original=window[name];if(Original)window[name]=class extends Original{constructor(...args){super(...args);mainDecoders[key]++;}};
  }
  const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(destination,...args){
   if(this instanceof GainNode&&destination===this.context.destination){const a=this.context.createAnalyser();a.fftSize=2048;connect.call(this,a);connect.call(a,destination);window.outputAnalyser=a;return destination;}
   return connect.call(this,destination,...args);
  };
  window.measure=()=>{
   const rows=[];let stopped=false,lastFrame='',frameWall=0;
   const sample=()=>{
    const now=performance.now(),c=document.querySelector('#canvas'),frame=c.dataset.frameReady;
    if(frame!==lastFrame){lastFrame=frame;frameWall=now;}
    let rms=0;const a=window.outputAnalyser;
    if(a){const data=new Float32Array(a.fftSize);a.getFloatTimeDomainData(data);rms=Math.sqrt(data.reduce((n,v)=>n+v*v,0)/data.length);}
    rows.push({wall:now,time:Number(document.querySelector('#seek').value),frame,rms,frameAge:now-frameWall});
    if(!stopped)requestAnimationFrame(sample);
   };sample();window.stopMeasure=()=>{stopped=true;return rows;};
  };
 });
 const pass=(name,detail)=>{report.push({name,detail});console.log('PASS',name,JSON.stringify(detail||''));};
 try{
  await page.goto('http://127.0.0.1:8099/');await page.waitForFunction(()=>!!document.querySelector('#importHero').onclick);
  await page.locator('#file').setInputFiles(path.join(qa,'preview-13s-1080p60.mp4'));
  await page.waitForFunction(()=>!document.querySelector('#export').disabled&&document.querySelector('#canvas').dataset.frameReady);
  // Slow the UI thread to expose competition between decoding and audio scheduling.
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  for(let iteration=0;iteration<(baseline?1:Number(process.env.PREVIEW_REPLAYS??5));iteration++){
   await page.evaluate(()=>measure());await page.locator('#play').click();
   await page.waitForFunction(()=>Number(document.querySelector('#seek').value)>12.9&&document.querySelector('#play').textContent==='▶',{},{timeout:35000});
   const samples=await page.evaluate(()=>stopMeasure()),stable=samples.filter(s=>s.time>.5&&s.time<12.7);
   const ages=stable.map(s=>s.frameAge).sort((a,b)=>a-b),p95=ages[Math.floor(ages.length*.95)],maxAge=ages.at(-1);
   const silent=stable.filter(s=>s.rms<.005),frameCount=new Set(stable.map(s=>s.frame)).size;
   const detail={iteration:iteration+1,frameCount,p95FrameAgeMs:Math.round(p95),maxFrameAgeMs:Math.round(maxAge),silentSamples:silent.length,samples:stable.length,decoders:await page.evaluate(()=>mainDecoders)};
   if(baseline){pass('baseline complete playback measurement',detail);continue;}
   assert.ok(frameCount>180,JSON.stringify(detail));assert.ok(p95<150,JSON.stringify(detail));assert.ok(maxAge<700,JSON.stringify(detail));assert.equal(silent.length,0,JSON.stringify(detail));
   assert.equal(await page.evaluate(()=>workerCount),0);await page.waitForTimeout(80);
   assert.deepEqual(detail.decoders,{video:0,audio:0});
   pass('13-second 1080p60 completes and replays, under 4x UI CPU throttle',detail);
  }
  if(!baseline){
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
   for(let i=0;i<12;i++){
    await page.locator('#rewind').click();await page.locator('#play').click();
    await page.waitForFunction(()=>Number(document.querySelector('#seek').value)>.15);
    await page.locator('#play').click();assert.equal(await page.evaluate(()=>workerCount),0);
    await page.locator('#seek').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},((i*1.13)%12).toFixed(2));
   }
   pass('12 pause/seek/restart cycles remain responsive with no surviving playback worker');
   await page.locator('#rewind').click();await page.waitForTimeout(150);
   // Hang a real worker indefinitely. UI pause must terminate it without waiting for next/return.
   stallNextWorker=true;
   await page.locator('#play').click();await page.waitForTimeout(300);
   const began=Date.now();await page.locator('#play').click();
   assert.equal(await page.evaluate(()=>workerCount),0);assert.ok(Date.now()-began<1000);
   await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#seek').value)>.5);
   await page.locator('#play').click();pass('hung decoder is immediately cancellable; subsequent play works');
   stallNextWorker='after-start';await page.locator('#rewind').click();await page.waitForTimeout(150);
   // Seek created a worker first; apply the stall to the fresh worker created by Play.
   stallNextWorker='after-start';await page.locator('#play').click();
   await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('已停止播放'),{},{timeout:9000});
   assert.equal(await page.evaluate(()=>workerCount),0);assert.equal(await page.locator('#play').textContent(),'▶');
   await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#seek').value)>4);
   await page.locator('#play').click();pass('decoder stalled during playback times out, releases worker and allows retry');
   // Editing after EOF/pause is also responsive.
   await page.locator('#out').fill('4');await page.locator('#out').dispatchEvent('change');await page.locator('#undo').click();
   assert.equal(await page.locator('#out').inputValue(),'13.00');pass('trim/undo works after repeat playback and decoder cancellation');
   assert.deepEqual(errors,[]);pass('no unhandled errors');
  }
 }finally{
  fs.writeFileSync(path.join(qa,baseline?'preview-stress-before.json':process.env.PREVIEW_REPLAYS==='0'?'preview-lifecycle.json':'preview-stress-after.json'),JSON.stringify({report,errors,environment:'Windows Edge, 4x UI CPU throttling, synthetic 1080p60; NOT an iPhone measurement'},null,2));
  await browser.close();server.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
