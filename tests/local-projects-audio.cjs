
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'qa'),report=[],errors=[],requests=[];
const server=http.createServer((req,res)=>{requests.push({url:req.url,method:req.method});const name=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.mp3':'audio/mpeg','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
(async()=>{
 await new Promise(r=>server.listen(8100,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--autoplay-policy=document-user-activation-required']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',acceptDownloads:true}),page=await context.newPage();let prompts=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{if(d.type()==='prompt')prompts++;d.accept(d.type()==='prompt'?'副本':undefined);});
 await context.addInitScript(()=>{
  const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(destination,...args){
   if(this instanceof GainNode&&destination===this.context.destination){const a=this.context.createAnalyser();a.fftSize=4096;connect.call(this,a);connect.call(a,destination);window.outputAnalyser=a;return destination;}
   return connect.call(this,destination,...args);
  };
  window.rms=()=>{const a=window.outputAnalyser;if(!a)return 0;const data=new Float32Array(a.fftSize);a.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((n,v)=>n+v*v,0)/data.length);};
 });
 const pass=(name,detail)=>{report.push({name,detail});console.log('PASS',name,JSON.stringify(detail||''));};
 const waitLoaded=()=>page.waitForFunction(()=>!document.querySelector('#saveProjectQuick').disabled);
 const change=async(id,value)=>{await page.locator('#'+id).fill(String(value));await page.locator('#'+id).dispatchEvent('change');};
 const choose=async(button,files)=>{
  const event=page.waitForEvent('filechooser');await page.locator('#'+button).click();const chooser=await event;await chooser.setFiles(files.map(f=>path.join(qa,f)));await waitLoaded();
 };
 const exportVideo=async(name)=>{
  await page.locator('#export').click();await page.locator('#startExport').click();
  await page.waitForFunction(()=>!document.querySelector('#download').hidden,{},{timeout:60000});
  const download=page.waitForEvent('download');await page.locator('#download').click();await(await download).saveAs(path.join(qa,name));await page.locator('#closeExport').click();
 };
 try{
  await page.goto('http://127.0.0.1:8100/');await page.waitForFunction(()=>!!document.querySelector('#importHero').onclick);
  assert.equal(await page.locator('#openProjectsHome').isVisible(),true);assert.equal(await page.locator('#openProjectFileHome').isVisible(),true);
  await page.locator('#newProjectHome').click();await page.locator('#newProjectName').fill('手機專案 A');await page.locator('#newProjectAspect').selectOption('16:9');await page.locator('#createProject').click();
  assert.match(await page.locator('#projectName').textContent(),/手機專案 A/);await page.locator('#saveProjectQuick').click();
  await page.waitForFunction(()=>document.querySelector('#saveState').textContent.includes('已儲存'));assert.equal(prompts,0);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#recentProjects').textContent.includes('手機專案 A'));
  await page.screenshot({path:path.join(qa,'projects-home-0.2.3.png'),fullPage:true});
  await page.locator('#recentProjects').getByRole('button',{name:'開啟',exact:true}).click();await waitLoaded();assert.match(await page.locator('#projectName').textContent(),/手機專案 A/);
  pass('name at New; explicit save; reopen from visible home list with no file picker or second name prompt');
  await page.locator('#importBottom').click();
  assert.equal(await page.locator('#pickVideo').isVisible(),true);assert.equal(await page.locator('#pickImage').isVisible(),true);assert.equal(await page.locator('#pickAudio').isVisible(),true);
  assert.match(await page.locator('#mediaDialog').textContent(),/尚未移植/);await page.screenshot({path:path.join(qa,'media-categories-0.2.3.png'),fullPage:true});
  await choose('pickVideo',['landscape.mp4']);await page.waitForFunction(()=>document.querySelectorAll('.timeline-clip').length===1);
  await page.locator('#muted').check();
  await page.locator('#importBottom').click();await choose('pickAudio',['audio-own.wav']);await page.waitForFunction(()=>document.querySelectorAll('.audio-clip').length===1);
  assert.equal(await page.locator('#split').textContent(),'分割音軌');await change('volume',1);
  await page.locator('#rewind').click();await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#seek').value)>.5);const rms=await page.evaluate(()=>rms());await page.locator('#play').click();assert.ok(rms>.05);
  pass('audio Files picker imports WAV; independent audio is audible with video muted',rms);
  await change('in',1);await change('out',3);await change('clipAt',1);
  await page.locator('#seek').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input'));});await page.locator('#split').click();
  assert.equal(await page.locator('.audio-clip').count(),2);await page.locator('#undo').click();assert.equal(await page.locator('.audio-clip').count(),1);await page.locator('#redo').click();
  await exportVideo('audio-timing-0.2.3.mp4');pass('audio offset / position / split / undo and actual MP4 export');
  await page.locator('#saveProjectQuick').click();await page.waitForFunction(()=>document.querySelector('#saveState').textContent.includes('已儲存'));
  await page.locator('#projectMenu').click();await page.locator('#prepareProjectFile').click();
  const backup=page.waitForEvent('download');await page.locator('#downloadProject').click();await(await backup).saveAs(path.join(qa,'audio-project-0.2.3.nvproj'));
  const parsed=await page.evaluate(async()=>{const {readProject}=await import('./src/project-file.js');const p=await readProject(await(await fetch(document.querySelector('#downloadProject').href)).blob());return {musics:p.project.musics,media:[...p.media].map(([key,file])=>({key,size:file.size,name:file.name}))};});
  assert.equal(parsed.musics.length,2);assert.equal(parsed.musics[1].offset,2);assert.ok(parsed.media.some(x=>x.name==='audio-own.wav'&&x.size>500000));
  await page.locator('#closeProjects').click();await page.reload();await page.locator('#openProjectsHome').click();await page.locator('#projectList').getByRole('button',{name:'開啟',exact:true}).click();await waitLoaded();assert.equal(await page.locator('.audio-clip').count(),2);
  pass('audio remains in local project after reload and is embedded in portable NVPROJ1');
  await page.locator('#importBottom').click();await choose('pickAudio',['audio-own.mp3','audio-own.m4a']);await page.waitForFunction(()=>document.querySelectorAll('.audio-clip').length===4);
  pass('MP3 and M4A import through Files into separate audio clips');
  await page.locator('#importBottom').click();await page.locator('#pickBuiltInMusic').click();assert.equal(await page.locator('.music-choice').count(),41);
  assert.equal(requests.filter(r=>r.url.startsWith('/music/')).length,0);
  await page.locator('#musicSearch').fill('範例');assert.equal(await page.locator('.music-choice').count(),1);await page.locator('.music-choice').click();
  await page.waitForFunction(()=>!document.querySelector('#addLibraryMusic').disabled);
  assert.equal(requests.filter(r=>r.url.startsWith('/music/')).length,1);
  await page.locator('#addLibraryMusic').click();await page.waitForFunction(()=>document.querySelectorAll('.audio-clip').length===5);
  assert.equal(await page.locator('#musicAudition').evaluate(el=>el.paused),true);pass('41 approved tracks searchable; only selected MP3 downloaded and added');
  await page.locator('#saveProjectQuick').click();await page.waitForFunction(()=>document.querySelector('#saveState').textContent.includes('已儲存'));
  await page.locator('#newProject').click();await page.locator('#newProjectName').fill('先加音訊');await page.locator('#createProject').click();
  await page.locator('#importBottom').click();await choose('pickAudio',['audio-own.mp3']);assert.equal(await page.locator('#play').isEnabled(),true);assert.equal(await page.locator('#export').isDisabled(),true);
  await page.locator('#importBottom').click();await choose('pickImage',['overlay.png']);await page.waitForFunction(()=>!document.querySelector('#export').disabled);await exportVideo('image-with-audio-0.2.3.mp4');
  pass('audio-first project can preview; adding a photo enables video with music export');
  await page.locator('#projectMenu').click();await page.locator('#projectFile').setInputFiles(path.join(qa,'audio-project-0.2.3.nvproj'));await waitLoaded();assert.equal(await page.locator('.audio-clip').count(),2);
  pass('external Files backup reopens its own embedded audio and edits');
  await page.locator('#theme').click();await page.locator('#language').click();await page.locator('#importBottom').click();assert.match(await page.locator('#mediaDialog').textContent(),/Choose from Photos/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(qa,'media-light-0.2.3.png'),fullPage:true});
  assert.ok(requests.every(r=>r.method==='GET'));assert.deepEqual(errors,[]);pass('day/night and English fit; no upload requests; no unhandled errors');
 }catch(e){await page.screenshot({path:path.join(qa,'local-audio-failure.png'),fullPage:true});console.log('STATUS',await page.locator('#status').textContent(),await page.locator('#exportStatus').textContent());throw e;}
 finally{fs.writeFileSync(path.join(qa,'local-projects-audio.json'),JSON.stringify({report,errors,realIPhone:'Pending; user previously confirmed preview 0.2.2 did not stutter.'},null,2));await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
