import {Input,BlobSource,ALL_FORMATS,canEncodeVideo,canEncodeAudio} from '../vendor/mediabunny.mjs';
import {makeProject,setTrim,setResolution,setAspect,formatTime,VERSION,BASELINE} from './model.js';
import {draft} from './storage.js';
import {strings} from './i18n.js';
const $=id=>document.getElementById(id),video=$('video');
let lang=localStorage.getItem('iphone-language')||'zh';
let project=null,file=null,meta=null,sourceUrl=null,worker=null,jobId=null,result=null,resultUrl=null,busy=false,importing=false,history=[],future=[],pendingTrim=null,saveTimer=null,saveQueue=Promise.resolve(),wakeLock=null,exportWatchdog=null;
let diagnostic={version:VERSION,baseline:BASELINE,userAgent:navigator.userAgent,realIPhoneTest:'pending'};
const t=k=>strings[lang]?.[k]||strings.zh[k]||k;
const say=(key,detail='')=>$('status').textContent=t(key)+(detail?' '+detail:'');
function errorText(e){const text=e?.message||String(e);diagnostic.lastError=text;if(/UNSUPPORTED|not supported|not defined/i.test(text))return t('noCodec');if(text.includes('MEMORY_LIMIT'))return t('memoryLimit');if(text.includes('TIMEOUT'))return t('timeout');return t('genericError')+' '+text;}
function translate(){document.documentElement.lang=lang==='zh'?'zh-Hant':'en';document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));$('language').textContent=lang==='zh'?'EN':'繁';if(project)render();}
function setTheme(mode){document.documentElement.dataset.theme=mode;localStorage.setItem('iphone-theme',mode);$('theme').textContent=mode==='dark'?'☀':'☾';}
setTheme(localStorage.getItem('iphone-theme')||'dark');translate();
$('theme').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
$('language').onclick=()=>{lang=lang==='zh'?'en':'zh';localStorage.setItem('iphone-language',lang);translate();};
const timeout=(promise,ms=30000)=>{let id;return Promise.race([promise,new Promise((_,r)=>id=setTimeout(()=>r(new Error('TIMEOUT')),ms))]).finally(()=>clearTimeout(id));};
function waitVideo(el,src){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(new Error('TIMEOUT')),30000);const finish=e=>{clearTimeout(timer);el.removeEventListener('loadeddata',loaded);el.removeEventListener('error',failed);e?reject(e):resolve();};const loaded=()=>finish();const failed=()=>finish(new Error('VIDEO_DECODE_UNSUPPORTED'));el.addEventListener('loadeddata',loaded);el.addEventListener('error',failed);el.src=src;el.load();});}
function c(){return project.clips[0];}
function render(){
 const loaded=!!project;
 for(const id of ['play','rewind','seek','in','out','inRange','outRange','reset','saveDraft','export','previewLandscape','previewPortrait'])$(id).disabled=!loaded||importing||busy;
 $('undo').disabled=!history.length||!loaded;$('redo').disabled=!future.length||!loaded;
 $('empty').hidden=loaded;
 $('outputChip').textContent=(loaded?Math.min(project.proj.w,project.proj.h):720)+'p · 30';
 $('screen').classList.toggle('has-media',loaded);
 $('previewLandscape').setAttribute('aria-pressed',String(loaded&&project.proj.w>project.proj.h));
 $('previewPortrait').setAttribute('aria-pressed',String(loaded&&project.proj.w<project.proj.h));
 if(loaded)renderExportSettings();renderPreviewSize();
 if(!loaded){$('filename').textContent=t('noClip');$('clipDuration').textContent='—';$('duration').textContent='0.00 s';$('audioInfo').textContent='';$('time').textContent='00:00.0 / 00:00.0';return;}
 const clip=c(),dur=clip.outP-clip.inP;
 $('filename').textContent=file.name;$('clipDuration').textContent=dur.toFixed(2)+' s';$('duration').textContent=dur.toFixed(2)+' s';
 $('audioInfo').textContent=t(meta.hasAudio?'audio':'silent');
 for(const id of ['inRange','outRange']){$(id).max=meta.duration;$(id).value=id==='inRange'?clip.inP:clip.outP;}
 $('in').value=clip.inP.toFixed(2);$('out').value=clip.outP.toFixed(2);$('in').max=meta.duration;$('out').max=meta.duration;
 $('seek').min=clip.inP;$('seek').max=clip.outP;
 $('middle').textContent=formatTime(dur/2);$('end').textContent=formatTime(dur);updateTime();
}
function renderPreviewSize(){
 const screen=$('screen');
 if(!project){screen.style.width='';screen.style.height='';video.style.width='';video.style.height='';return;}
 const ratio=project.proj.w/project.proj.h;
 const maxHeight=Math.min(420,Math.max(240,window.innerHeight*.42));
 const width=Math.min(document.querySelector('.viewer').clientWidth-2,maxHeight*ratio);
 screen.style.width=(width+2)+'px';screen.style.height=(width/ratio+2)+'px';
 video.style.width=width+'px';video.style.height=width/ratio+'px';
}
new ResizeObserver(renderPreviewSize).observe(document.querySelector('.viewer'));
window.addEventListener('resize',renderPreviewSize);
function updateTime(){if(!project)return;$('seek').value=Math.max(c().inP,Math.min(c().outP,video.currentTime));$('time').textContent=formatTime(video.currentTime-c().inP)+' / '+formatTime(c().outP-c().inP);}
function pause(){video.pause();$('play').textContent='▶';}
video.addEventListener('timeupdate',()=>{if(project&&video.currentTime>=c().outP&&!video.paused){pause();video.currentTime=c().outP;}updateTime();});
video.addEventListener('pause',()=>$('play').textContent='▶');video.addEventListener('play',()=>$('play').textContent='❚❚');
$('play').onclick=async()=>{if(!project)return;if(!video.paused){pause();return;}if(video.currentTime>=c().outP-.03||video.currentTime<c().inP)video.currentTime=c().inP;try{await video.play();}catch(e){say('previewFailed');diagnostic.lastError=e.message;}};
$('rewind').onclick=()=>{pause();video.currentTime=c().inP;};
$('seek').oninput=()=>{pause();video.currentTime=+$('seek').value;updateTime();};
function queueSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,500);}
async function saveDraft(){
 if(!project||!file)return true;
 const value={project:structuredClone(project),file,meta:structuredClone(meta),savedAt:Date.now()};
 saveQueue=saveQueue.catch(()=>{}).then(()=>draft('put',value));
 try{await saveQueue;$('draftState').textContent=t('saved');return true;}catch(e){$('draftState').textContent=t('saveFailed');diagnostic.storageError=e.message;return false;}
}
function recordBefore(){const before=JSON.stringify(project);if(history.at(-1)!==before)history.push(before);if(history.length>60)history.shift();future=[];}
function applyTrim(start,end,{record=true}={}){
 try{const copy=structuredClone(project);setTrim(copy,start,end,meta.duration);if(JSON.stringify(copy)===JSON.stringify(project)){render();return;}if(record)recordBefore();project=copy;releaseResult();pause();video.currentTime=Math.max(c().inP,Math.min(video.currentTime,c().outP));render();queueSave();}
 catch{say('invalidTrim');render();}
}
for(const id of ['in','out'])$(id).onchange=()=>applyTrim(+$('in').value,+$('out').value);
for(const id of ['inRange','outRange']){
 $(id).addEventListener('input',()=>{if(!pendingTrim)pendingTrim=JSON.stringify(project);const isIn=id==='inRange';let v=+$(id).value;v=isIn?Math.min(v,c().outP-.1):Math.max(v,c().inP+.1);applyTrim(isIn?v:c().inP,isIn?c().outP:v,{record:false});video.currentTime=isIn?c().inP:Math.max(c().inP,c().outP-.04);});
 $(id).addEventListener('change',()=>{if(pendingTrim){history.push(pendingTrim);future=[];pendingTrim=null;render();}});
}
$('reset').onclick=()=>applyTrim(0,meta.duration);
$('undo').onclick=()=>{if(!history.length)return;future.push(JSON.stringify(project));project=JSON.parse(history.pop());releaseResult();pause();video.currentTime=c().inP;render();queueSave();};
$('redo').onclick=()=>{if(!future.length)return;history.push(JSON.stringify(project));project=JSON.parse(future.pop());releaseResult();pause();video.currentTime=c().inP;render();queueSave();};
async function importFile(next,saved=null){
 if(importing||busy)return;if(project&&!saved&&!confirm(t('replace')))return;
 importing=true;render();say(saved?'restoring':'loading');pause();
 let input,newUrl;
 try{
  input=new Input({source:new BlobSource(next),formats:ALL_FORMATS});
  const vt=await timeout(input.getPrimaryVideoTrack());if(!vt)throw new Error('NO_VIDEO');
  const at=await timeout(input.getPrimaryAudioTrack()),duration=await timeout(input.computeDuration());
  if(!Number.isFinite(duration)||duration<.1)throw new Error('INVALID_DURATION');
  const newMeta={duration,width:vt.displayWidth,height:vt.displayHeight,hasAudio:!!at,codec:vt.codec,audioCodec:at?.codec||null};
  newUrl=URL.createObjectURL(next);
  const probe=document.createElement('video');probe.muted=true;probe.playsInline=true;
  try{await waitVideo(probe,newUrl);}finally{probe.removeAttribute('src');probe.load();}
  if(saved){if(saved.schema!=='nivedit-iphone-draft-1')throw new Error('INVALID_DRAFT');setTrim(saved,saved.clips[0].inP,saved.clips[0].outP,duration);}
  await waitVideo(video,newUrl);
  if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=newUrl;newUrl=null;
  await releaseResult();file=next;meta=newMeta;project=saved||makeProject(file,meta);history=[];future=[];
  video.currentTime=c().inP;$('restoreBox').hidden=true;render();say('ready');queueSave();
 }catch(e){if(newUrl)URL.revokeObjectURL(newUrl);if(sourceUrl&&video.src!==sourceUrl){video.src=sourceUrl;video.load();}say('importFailed',errorText(e));}
 finally{input?.dispose();importing=false;render();}
}
for(const id of ['importHero','importBottom'])$(id).onclick=()=>{if(!busy&&!importing)$('file').click();};
$('file').onchange=()=>{const f=$('file').files[0];$('file').value='';if(f)importFile(f);};
$('saveDraft').onclick=async()=>{clearTimeout(saveTimer);await saveDraft();say('draftNote');};
$('restore').onclick=async()=>{try{const value=await draft('get');if(value?.file)await importFile(value.file,value.project);}catch{say('saveFailed');}};
$('newProject').onclick=async()=>{if(importing||busy)return;if(project&&!confirm(t('newConfirm')))return;clearTimeout(saveTimer);await saveQueue.catch(()=>{});pause();await releaseResult();if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=null;video.removeAttribute('src');video.load();project=file=meta=null;history=[];future=[];try{await draft('delete');}catch{}$('restoreBox').hidden=true;render();say('phaseHint');};
draft('get').then(value=>{$('restoreBox').hidden=!value?.file;}).catch(()=>{});
function renderExportSettings(){if(!project)return;$('aspect').value=project.proj.w<project.proj.h?'9:16':'16:9';$('resolution').value=String(Math.min(project.proj.w,project.proj.h));$('exportSpec').textContent=project.proj.w+' × '+project.proj.h+' · 30 fps · '+project.proj.bitrate+' Mbps · MP4 / H.264'+(meta.hasAudio?' + AAC':' · '+t('silent'));}
function changeAspect(aspect){if(busy||importing||!project)return;if(aspect===project.proj.aspect)return;recordBefore();setAspect(project,aspect);releaseResult();render();queueSave();$('exportStatus').textContent=t('foreground');}
$('aspect').onchange=()=>changeAspect($('aspect').value);
$('previewLandscape').onclick=()=>changeAspect('16:9');
$('previewPortrait').onclick=()=>changeAspect('9:16');
$('resolution').onchange=()=>{if(busy||!project)return;const value=+$('resolution').value;if(value===Math.min(project.proj.w,project.proj.h))return;recordBefore();setResolution(project,value);releaseResult();render();queueSave();$('exportStatus').textContent=t('foreground');};
function setBusy(value){$('aspect').disabled=value;$('resolution').disabled=value;if(!value)clearTimeout(exportWatchdog);busy=value;document.body.classList.toggle('busy',value);$('cancelExport').hidden=!value;$('closeExport').disabled=value;$('startExport').hidden=value;$('export').disabled=value||!project;}
async function releaseResult(){if(resultUrl){$('resultVideo').pause();$('resultVideo').removeAttribute('src');$('resultVideo').load();URL.revokeObjectURL(resultUrl);}resultUrl=null;result=null;$('resultVideo').hidden=true;$('share').hidden=true;$('download').hidden=true;if(jobId){try{const root=await navigator.storage?.getDirectory();await root?.removeEntry(jobId);}catch{}jobId=null;}}
$('export').onclick=()=>{pause();renderExportSettings();$('exportStatus').textContent=result?t('done'):t('foreground');$('startExport').hidden=false;$('exportDialog').showModal();};
async function stopExport(reason='cancelled'){
 if(!busy)return;worker?.terminate();worker=null;await releaseResult();wakeLock?.release().catch(()=>{});wakeLock=null;setBusy(false);$('exportStatus').textContent=t(reason);$('progress').value=0;
}
$('cancelExport').onclick=()=>stopExport();$('closeExport').onclick=()=>{$('resultVideo').pause();$('exportDialog').close();};
$('exportDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();if(busy)stopExport('background');}});
$('startExport').onclick=async()=>{
 if(busy||!project)return;
 setBusy(true);await releaseResult();$('progress').value=0;$('exportStatus').textContent=t('prepare');
 try{
  wakeLock=await navigator.wakeLock?.request('screen').catch(()=>null);
  if(!busy)return;
  jobId='nivedit-export-'+crypto.randomUUID()+'.mp4';
  worker=new Worker(new URL('./export-worker.js',import.meta.url),{type:'module'});
  const activeWorker=worker;
  const fail=async e=>{if(worker!==activeWorker)return;activeWorker.terminate();worker=null;await releaseResult();setBusy(false);$('exportStatus').textContent=errorText(e);wakeLock?.release().catch(()=>{});wakeLock=null;};
  const touchWatchdog=()=>{clearTimeout(exportWatchdog);exportWatchdog=setTimeout(()=>fail(new Error('TIMEOUT')),120000);};
  touchWatchdog();activeWorker.onerror=e=>fail(new Error(e.message));
  activeWorker.onmessage=async({data})=>{
   if(worker!==activeWorker)return;touchWatchdog();
   if(data.type==='stage'){$('exportStatus').textContent=t(data.stage);diagnostic.exportStorage=data.storage;}
   if(data.type==='progress'){$('progress').value=data.value;$('exportStatus').textContent=t('encode')+' '+Math.round(data.value*100)+'%';}
   if(data.type==='error'){await fail(new Error(data.message));return;}
   if(data.type==='done'){
    $('exportStatus').textContent=t('verify');let check;
    try{
     check=new Input({source:new BlobSource(data.blob),formats:ALL_FORMATS});
     const v=await check.getPrimaryVideoTrack(),a=await check.getPrimaryAudioTrack(),d=await check.computeDuration();
     if(worker!==activeWorker)return;
     if(!v||v.displayWidth!==project.proj.w||v.displayHeight!==project.proj.h||(meta.hasAudio&&!a)||Math.abs(d-(c().outP-c().inP))>.25)throw new Error('OUTPUT_VALIDATION_FAILED');
     result=new File([data.blob],'NiVedit-iPhone-'+new Date().toISOString().replace(/[:.]/g,'-')+'.mp4',{type:'video/mp4'});
     resultUrl=URL.createObjectURL(result);await waitVideo($('resultVideo'),resultUrl);
     if(worker!==activeWorker)return;
     $('resultVideo').hidden=false;$('download').href=resultUrl;$('download').download=result.name;$('download').hidden=false;$('share').hidden=false;
     $('progress').value=1;$('exportStatus').textContent=t('done');diagnostic.lastOutput={bytes:result.size,duration:d,video:v.codec,audio:a?.codec||null,width:v.displayWidth,height:v.displayHeight,storage:data.storage};
     activeWorker.terminate();worker=null;setBusy(false);wakeLock?.release().catch(()=>{});wakeLock=null;
    }catch(e){await fail(e);}finally{check?.dispose();}
   }
  };
  activeWorker.postMessage({file,project:structuredClone(project),jobId});
 }catch(e){await stopExport();$('exportStatus').textContent=errorText(e);}
};
$('share').onclick=async()=>{if(!result)return;if(!navigator.canShare?.({files:[result]})){$('exportStatus').textContent=t('shareUnavailable');return;}try{await navigator.share({files:[result],title:'NiVedit'});$('exportStatus').textContent=t('shared');}catch(e){$('exportStatus').textContent=e.name==='AbortError'?t('shareCancelled'):errorText(e);}};
$('download').onclick=()=>$('exportStatus').textContent=t('downloaded');
async function probe(){
 const report={secureContext:isSecureContext,videoEncoder:typeof VideoEncoder!=='undefined',audioEncoder:typeof AudioEncoder!=='undefined',webGPU:!!navigator.gpu,opfs:!!navigator.storage?.getDirectory,fileShare:!!navigator.canShare,standalone:matchMedia('(display-mode: standalone)').matches};
 for(const [key,fn] of Object.entries({h264_720p:()=>canEncodeVideo('avc',{width:1280,height:720,bitrate:4e6}),h264_1080p:()=>canEncodeVideo('avc',{width:1920,height:1080,bitrate:8e6}),h264_1080p_portrait:()=>canEncodeVideo('avc',{width:1080,height:1920,bitrate:8e6}),h264_4k:()=>canEncodeVideo('avc',{width:3840,height:2160,bitrate:16e6}),aac:()=>canEncodeAudio('aac',{sampleRate:48000,numberOfChannels:2,bitrate:192000})})){try{report[key]=await timeout(fn(),5000);}catch{report[key]='unknown';}}
 try{report.storage=await navigator.storage?.estimate();}catch{}
 diagnostic={...diagnostic,...report};return diagnostic;
}
$('diagnostics').onclick=async()=>{$('deviceDialog').showModal();$('deviceInfo').textContent='…';$('deviceInfo').textContent=JSON.stringify(await probe(),null,2);};
$('closeDevice').onclick=()=>$('deviceDialog').close();$('copyDiagnostics').onclick=async()=>{try{await navigator.clipboard.writeText($('deviceInfo').textContent);say('copied');}catch{$('deviceInfo').focus();}};
document.querySelectorAll('[data-update-link]').forEach(link=>link.addEventListener('click',async event=>{
 event.preventDefault();
 if(busy||importing){say('updateBusy');return;}
 if(result&&!confirm(t('updateExportWarning')))return;
 clearTimeout(saveTimer);
 if(!await saveDraft()){say('saveFailed');return;}
 location.assign(link.href);
}));
if('serviceWorker'in navigator){
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(registration=>{
  const show=()=>{if(registration.waiting&&navigator.serviceWorker.controller)$('updateNotice').hidden=false;};
  show();
  registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',show));
  registration.update().then(show).catch(e=>diagnostic.serviceWorkerError=e.message);
 }).catch(e=>diagnostic.serviceWorkerError=e.message);
}
render();

