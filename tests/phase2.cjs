const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'qa');
const server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://local').pathname);const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}try{res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
(async()=>{
 await new Promise(r=>server.listen(8096,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[],report=[];
 page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message);});page.on('dialog',d=>d.accept(d.type()==='prompt'?'Phase2 test':undefined));
 const pass=name=>{report.push(name);console.log('PASS',name);};
 const change=async(id,value)=>{await page.locator('#'+id).fill(String(value));await page.locator('#'+id).dispatchEvent('change');};
 const add=async(file,count)=>{await page.locator('#file').setInputFiles(path.join(qa,file));await page.waitForFunction(n=>document.querySelectorAll('.timeline-clip').length===n&&!document.querySelector('#export').disabled,count,{timeout:60000});};
 const seek=async t=>page.locator('#seek').evaluate((e,t)=>{e.value=t;e.dispatchEvent(new Event('input'));},t);
 async function download(name){
  await page.locator('#export').click();await page.locator('#startExport').click();
  await page.waitForFunction(()=>!document.querySelector('#download').hidden||(!document.querySelector('#startExport').hidden&&document.querySelector('#exportStatus').textContent.includes('失敗')),{},{timeout:180000});
  assert.equal(await page.locator('#download').isVisible(),true,await page.locator('#exportStatus').textContent());
  const event=page.waitForEvent('download');await page.locator('#download').click();await(await event).saveAs(path.join(qa,name));await page.locator('#closeExport').click();
 }
 try{
  await page.goto('http://127.0.0.1:8096/');await page.waitForFunction(()=>!!document.querySelector('#importHero').onclick);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);pass('empty mobile fits viewport');
  await add('landscape.mp4',1);await change('out',2);await add('portrait.mp4',2);await change('out',2);
  assert.equal(await page.locator('#clipAt').inputValue(),'2.00');pass('multiple import appends to same video track');
  await change('clipAt',3);assert.equal(await page.locator('#clipAt').inputValue(),'3.00');pass('explicit gap remains');
  await change('clipAt',1);assert.equal(await page.locator('#clipAt').inputValue(),'3.00');pass('same-track collision rejected');
  await page.locator('#clipTrack').selectOption('1');await change('clipAt',1);pass('move to upper track and overlap lower');
  await seek(1.5);await page.waitForTimeout(500);
  const pixel=await page.evaluate(()=>{const c=document.querySelector('#canvas'),x=c.getContext('2d');return Array.from(x.getImageData(c.width/2,c.height/2,1,1).data);});assert.ok(pixel.slice(0,3).some(v=>v>20));pass('two-track canvas renders');
  await download('phase2-dual.mp4');pass('two-track composition exports actual MP4');
  await seek(2);await page.locator('#split').click();assert.equal(await page.locator('.timeline-clip').count(),3);pass('split selected upper clip');
  await page.locator('#undo').click();assert.equal(await page.locator('.timeline-clip').count(),2);await page.locator('#redo').click();assert.equal(await page.locator('.timeline-clip').count(),3);pass('undo redo split');
  await add('overlay.png',4);await change('out',2);await change('clipAt',.5);
  await add('overlay2.png',5);await change('out',.5);await change('clipAt',1);
  await seek(1.2);await page.waitForTimeout(200);await download('phase2-images.mp4');pass('overlapping transparent images export');
  await page.locator('#projectMenu').click();await page.locator('#saveProject').click();await page.waitForFunction(()=>document.querySelectorAll('.project-row').length===1);pass('named project saved');
  await page.locator('#prepareProjectFile').click();const dl=page.waitForEvent('download');await page.locator('#downloadProject').click();await(await dl).saveAs(path.join(qa,'phase2.nvproj'));pass('portable project with embedded media');
  await page.locator('#closeProjects').click();await page.reload();await page.locator('#restore').click();await page.waitForFunction(()=>document.querySelectorAll('.timeline-clip').length===5&&!document.querySelector('#export').disabled);pass('multi-media draft survives reload');
  await page.locator('#newProject').click();await page.locator('#projectMenu').click();await page.locator('#projectFile').setInputFiles(path.join(qa,'phase2.nvproj'));await page.waitForFunction(()=>document.querySelectorAll('.timeline-clip').length===5&&!document.querySelector('#export').disabled);pass('nvproj reopens all media');
  await page.locator('#projectMenu').click();await page.locator('#saveAs').click();await page.waitForFunction(()=>document.querySelectorAll('.project-row').length===2);pass('save as preserves independent copy');await page.locator('#closeProjects').click();

  // Unsupported desktop features remain editable as project data, never silently exported away.
  await page.evaluate(async()=>{
   const {readProject,writeProject}=await import('./src/project-file.js');const v=await readProject(await(await fetch('/qa/phase2.nvproj')).blob());v.project.titles=[{id:'future-title',text:'Retain me',extra:{x:7}}];v.project.future={value:42};
   const file=new File([writeProject(v.project,v.media,'Advanced',v.header)],'advanced.nvproj'),dt=new DataTransfer();dt.items.add(file);const input=document.querySelector('#projectFile');input.files=dt.files;input.dispatchEvent(new Event('change'));
  });
  await page.waitForFunction(()=>document.querySelector('#projectName').textContent==='Advanced'&&!document.querySelector('#export').disabled);
  assert.equal(await page.locator('#limitNotice').isVisible(),true);await change('in',.1);
  await page.locator('#export').click();await page.locator('#startExport').click();assert.equal(await page.locator('#download').isVisible(),false);assert.match(await page.locator('#exportStatus').textContent(),/尚不能/);await page.locator('#closeExport').click();
  await page.locator('#projectMenu').click();await page.locator('#prepareProjectFile').click();
  const retained=await page.evaluate(async()=>{const {readProject}=await import('./src/project-file.js');return(await readProject(await(await fetch(document.querySelector('#downloadProject').href)).blob())).project;});
  assert.deepEqual(retained.future,{value:42});assert.equal(retained.titles[0].text,'Retain me');assert.equal(retained.clips[0].inP,.1);pass('advanced desktop data retained after edit; incomplete video export blocked');await page.locator('#closeProjects').click();
  // Missing assets are retained in the timeline and can be relinked, not discarded.
  await page.evaluate(async()=>{
   const {readProject}=await import('./src/project-file.js');const v=await readProject(await(await fetch('/qa/phase2.nvproj')).blob());const bytes=new TextEncoder().encode(JSON.stringify({...v.header,name:'Missing',index:[]})),len=new Uint8Array(4);new DataView(len.buffer).setUint32(0,bytes.length,true);
   const dt=new DataTransfer();dt.items.add(new File(['NVPROJ1',len,bytes],'missing.nvproj'));const input=document.querySelector('#projectFile');input.files=dt.files;input.dispatchEvent(new Event('change'));
  });
  await page.waitForFunction(()=>document.querySelector('#projectName').textContent==='Missing'&&!document.querySelector('#export').disabled);assert.equal(await page.locator('.timeline-clip').count(),5);assert.equal(await page.locator('#repairMedia').isVisible(),true);
  await page.locator('#repairMedia').click();await page.locator('#repairFile').setInputFiles(path.join(qa,'landscape.mp4'));await page.waitForFunction(()=>document.querySelector('#repairMedia').hidden);pass('missing media clips retained and relinkable');
  await page.locator('#projectMenu').click();await page.locator('#openExample').click();await page.waitForFunction(()=>document.querySelectorAll('.timeline-clip').length===3&&!document.querySelector('#export').disabled);
  assert.match(await page.locator('#time').textContent(),/^00:00.0/);await download('phase2-example.mp4');
  await page.locator('#projectMenu').click();await page.locator('#saveProject').click();await page.waitForFunction(()=>document.querySelectorAll('.project-row').length===3);await page.locator('#closeProjects').click();pass('720p example opens at start, exports, saves own copy');
  // Move lower video to create a real leading blank and verify the compositor duration.
  await page.locator('.timeline-clip').filter({hasText:'lower.mp4'}).click();
  const grip=page.locator('.timeline-clip.selected .move-grip');await grip.scrollIntoViewIfNeeded();const box=await grip.boundingBox(),pps=await page.locator('#zoom').inputValue();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+Number(pps)*.5,box.y+box.height/2,{steps:5});await page.mouse.up();assert.equal(await page.locator('#clipAt').inputValue(),'0.50');await page.locator('#undo').click();assert.equal(await page.locator('#clipAt').inputValue(),'0.00');pass('visible drag handle forms one undoable move');
  await change('clipAt',.5);await download('phase2-gap.mp4');pass('leading blank included in actual output');
  await page.locator('#projectMenu').click();await page.locator('#openExample').click();await page.waitForFunction(()=>document.querySelector('#projectName').textContent.includes('720p')&&!document.querySelector('#export').disabled);

  await page.screenshot({path:path.join(qa,'phase2-mobile.png'),fullPage:true});
  await page.locator('#theme').click();await page.screenshot({path:path.join(qa,'phase2-light.png'),fullPage:true});
  await page.locator('#language').click();assert.equal(await page.locator('#export').textContent(),'Export');await page.setViewportSize({width:844,height:390});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);pass('day/night English and landscape fit');
  assert.deepEqual(errors,[]);pass('no uncaught errors');
 }catch(e){await page.screenshot({path:path.join(qa,'phase2-failure.png'),fullPage:true});console.log('STATUS',await page.locator('#status').textContent(),await page.locator('#exportStatus').textContent());throw e;}
 finally{fs.writeFileSync(path.join(qa,'phase2-report.json'),JSON.stringify({report,errors,device:'Windows Edge touch viewport; real iPhone pending'},null,2));await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
