// Uses desktop V13 as a read-only compatibility oracle. Synthetic assets only.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'qa');
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local'),name=decodeURIComponent(url.pathname);const target=name==='/desktop.html'?path.join(root,'..','NiVedit.html'):path.resolve(root,'.'+name);if(name!=='/desktop.html'&&!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'})[path.extname(target)]||'application/octet-stream');res.end(fs.readFileSync(target));}catch{res.writeHead(404);res.end();}});
(async()=>{
 await new Promise(r=>server.listen(8097,'127.0.0.1',r));const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const context=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage();page.on('dialog',d=>d.accept());
 try{
  await page.goto('http://127.0.0.1:8097/desktop.html');await page.waitForFunction(()=>typeof projImportFile==='function'&&typeof VER==='string');
  assert.equal(await page.evaluate(()=>VER),'V13');
  await page.locator('#fileProj').setInputFiles(path.join(qa,'phase2.nvproj'));
  await page.waitForFunction(()=>A.clips.length===5&&A.clips.every(c=>c.file),{},{timeout:60000});
  const before=await page.evaluate(()=>serialize().st);assert.equal(before.clips.length,5);
  // Serialize using the actual V13 project writer, then edit exactly one timing field with mobile modules.
  const transfer=await page.evaluate(async()=>{
   const blob=await buildProjBlob(),{readProject,writeProject}=await import('./src/project-file.js'),{trimClip}=await import('./src/model.js');
   const value=await readProject(blob),expected=structuredClone(value.project),clip=value.project.clips[0];
   trimClip(value.project,clip.id,clip.inP+.1,clip.outP,clip.dur);expected.clips[0].inP+=.1;
   const mobile=writeProject(value.project,value.media,'Desktop bridge',value.header),back=await readProject(mobile);
   const equal=JSON.stringify(back.project)===JSON.stringify(expected);
   const hashes=[];for(const[key,file]of value.media){const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer()))).join(',');hashes.push(await digest(file)===await digest(back.media.get(key)));}
   await projImportFile(new File([mobile],'bridge.nvproj'));
   return {equal,hashes,expected,version:VER,state:serialize().st};
  });
  assert.equal(transfer.equal,true);assert.ok(transfer.hashes.every(Boolean));// V13 serialize() intentionally regenerates mediaKey from File.lastModified on every reopen.
  const withoutKey=clips=>clips.map(({mediaKey,...c})=>c);assert.deepEqual(withoutKey(transfer.state.clips),withoutKey(transfer.expected.clips));assert.deepEqual(transfer.state.proj,transfer.expected.proj);
  fs.writeFileSync(path.join(qa,'desktop-bridge.json'),JSON.stringify({desktopVersion:transfer.version,clips:transfer.state.clips.length,assets:transfer.hashes.length,oneTimeEditPreserved:true,mediaHashesPreserved:true,actualDesktopReopened:true},null,2));
  console.log('PASS actual V13 -> mobile one time edit -> V13; state and media hashes preserved');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
