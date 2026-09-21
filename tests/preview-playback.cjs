const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'qa'),report=[];
const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://local').pathname);const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
(async()=>{
 await new Promise(r=>server.listen(8098,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--autoplay-policy=document-user-activation-required']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 await context.addInitScript(()=>{
  window.audioAnalysers=[];window.resumeGestures=[];
  const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(destination,...args){
   if(this instanceof GainNode&&destination===this.context.destination){const analyser=this.context.createAnalyser();analyser.fftSize=2048;connect.call(this,analyser);connect.call(analyser,destination);window.audioAnalysers.push(analyser);return destination;}
   return connect.call(this,destination,...args);
  };
  const resume=AudioContext.prototype.resume;AudioContext.prototype.resume=function(){window.resumeGestures.push(navigator.userActivation.isActive);return resume.call(this);};
  // Reproduce the mobile restriction: preview must not rely on playing audible hidden media.
  HTMLMediaElement.prototype.play=function(){throw Error('TEST_HIDDEN_MEDIA_PLAY_DISALLOWED');};
  window.rms=()=>{const a=window.audioAnalysers.at(-1);if(!a)return 0;const data=new Float32Array(a.fftSize);a.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((n,v)=>n+v*v,0)/data.length);};
 });
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const pass=(name,detail)=>{report.push({name,detail});console.log('PASS',name,JSON.stringify(detail||''));};
 try{
  await page.goto('http://127.0.0.1:8098/');await page.waitForFunction(()=>!!document.querySelector('#importHero').onclick);
  await page.locator('#file').setInputFiles(path.join(qa,'landscape.mp4'));await page.waitForFunction(()=>!document.querySelector('#export').disabled&&document.querySelector('#canvas').dataset.frameReady);
  await page.locator('#out').fill('3');await page.locator('#out').dispatchEvent('change');
  await page.locator('#addTrack').selectOption('1');await page.locator('#file').setInputFiles(path.join(qa,'portrait.mp4'));await page.waitForFunction(()=>document.querySelectorAll('.timeline-clip').length===2&&!document.querySelector('#export').disabled);
  await page.locator('#out').fill('1');await page.locator('#out').dispatchEvent('change');await page.locator('#clipAt').fill('1');await page.locator('#clipAt').dispatchEvent('change');await page.locator('#rewind').click();
  // Sample the final canvas and the actual graph routed to the audio destination.
  await page.evaluate(()=>{window.samples=[];window.sampleRAF=()=>{
   const canvas=document.querySelector('#canvas'),ctx=canvas.getContext('2d');const pixel=ctx.getImageData(canvas.width/2,canvas.height/2,1,1).data;
   samples.push({time:Number(document.querySelector('#seek').value),rms:window.rms(),pixel:[...pixel],ready:canvas.dataset.frameReady});window.monitor=requestAnimationFrame(sampleRAF);
  };sampleRAF();});
  await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#seek').value)>2.7,{},{timeout:20000});await page.locator('#play').click();
  const samples=await page.evaluate(()=>{cancelAnimationFrame(window.monitor);return samples;});
  const average=(start,end)=>{const rows=samples.filter(s=>s.time>start&&s.time<end);assert.ok(rows.length>3);return rows.reduce((n,s)=>n+s.rms,0)/rows.length;};
  const levels=[average(.3,.8),average(1.3,1.8),average(2.3,2.6)];
  assert.ok(levels[0]>.04&&levels[2]>.04);assert.ok(levels[1]/levels[0]>1.7&&levels[1]/levels[0]<2.3);
  pass('actual output graph audible; both tracks mixed; lower continues after upper ends',levels);
  const black=samples.filter(s=>s.time>.1&&s.time<2.7&&s.pixel.slice(0,3).every(v=>v<3));
  assert.equal(black.length,0);assert.ok(new Set(samples.map(s=>s.ready)).size>35);pass('continuous decoded frames with no inserted black flash',{samples:samples.length,frames:new Set(samples.map(s=>s.ready)).size});
  assert.ok((await page.evaluate(()=>resumeGestures)).every(Boolean));assert.equal(await page.locator('#mediaPool video').count(),0);pass('audio unlocked inside Play gesture; no hidden media playback dependency');
  await page.waitForTimeout(120);assert.ok(await page.evaluate(()=>rms())<.0001);pass('pause stops scheduled audio');
  await page.locator('#rewind').click();await page.locator('#muted').check();await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#seek').value)>1.3);const mutedLevel=await page.evaluate(()=>rms());assert.ok(mutedLevel>.04&&mutedLevel<levels[0]*1.25);await page.locator('#play').click();pass('muting upper clip keeps lower original audio',mutedLevel);
  // Pause during async preparation; a late decoder must not restart playback.
  await page.locator('#rewind').click();await page.evaluate(()=>{document.querySelector('#play').click();document.querySelector('#play').click();});await page.waitForTimeout(150);
  assert.equal(await page.locator('#play').textContent(),'▶');assert.equal(await page.locator('#seek').inputValue(),'0');assert.ok(await page.evaluate(()=>rms())<.0001);pass('cancel pending play without late audio');

  // Slow seeks must retain a complete old frame until the requested one is ready.
  const delayed=await page.evaluate(async()=>{
   const {PreviewDecoder}=await import('./src/preview-decoder.js'),get=PreviewDecoder.prototype.request;
   PreviewDecoder.prototype.request=async function(...args){const result=await get.apply(this,args);if(args[0]==='frame')await new Promise(r=>setTimeout(r,110));return result;};
   const means=[];let observing=true;
   const sample=()=>{const c=document.querySelector('#canvas'),d=c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data;means.push(d[0]+d[1]+d[2]);if(observing)requestAnimationFrame(sample);};sample();
   const seek=t=>{const e=document.querySelector('#seek');e.value=t;e.dispatchEvent(new Event('input'));};
   seek(.5);await new Promise(r=>setTimeout(r,15));seek(2.4);
   await new Promise(r=>setTimeout(r,400));observing=false;PreviewDecoder.prototype.request=get;
   return {minimum:Math.min(...means),position:Number(document.querySelector('#seek').value),rms:window.rms()};
  });
  assert.ok(delayed.minimum>20);assert.equal(delayed.position,2.4);assert.ok(delayed.rms<.0001);pass('slow decode and rapid seeking retain complete frame; stale seeks stay silent',delayed);

  assert.deepEqual(errors,[]);pass('no unhandled browser errors');
 }finally{fs.writeFileSync(path.join(qa,'preview-playback.json'),JSON.stringify({report,errors,realIPhone:'pending'},null,2));await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
