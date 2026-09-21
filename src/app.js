import {Input,BlobSource,ALL_FORMATS,canEncodeVideo,canEncodeAudio} from '../vendor/mediabunny.mjs';
import {makeProject,setResolution,setAspect,formatTime,VERSION,BASELINE,addClip,layout,totalDuration,clipTrack,clipDuration,moveClip,trimClip,splitClip,projectLimitations,timelineRows,addMusic,findMusic} from './model.js';
import {projects,recoverLegacyDraft} from './storage.js';
import {readProject,writeProject} from './project-file.js';
import {inspectMedia,Preview} from './media.js';
import {strings} from './i18n.js';
import {setupMediaLibrary} from './media-library.js';
const $=id=>document.getElementById(id);
let lang=localStorage.getItem('iphone-language')||'zh';
let project=null,media=new Map(),metas=new Map(),selected=null,name='',savedId=null,originalHeader={},example=false,dirty=false;
let file=null,meta=null,worker=null,jobId=null,result=null,resultUrl=null,busy=false,importing=false,history=[],future=[],pendingTrim=null,wakeLock=null,exportWatchdog=null,exportSequence=0,projectDownloadUrl=null,projectDownloadFile=null,repairKey=null;
let diagnostic={version:VERSION,baseline:BASELINE,userAgent:navigator.userAgent,realIPhoneTest:'pending',knownIssue:'Intermittent iPhone export failure remains open; deferred by user.'};
try{diagnostic.previousExportFailure=JSON.parse(localStorage.getItem('iphone-last-export-error')||'null');}catch{}
function recordExportFailure(error){const failure={version:VERSION,time:new Date().toISOString(),error:error?.message||String(error),attempt:diagnostic.lastAttempt,validation:diagnostic.outputValidation};diagnostic.previousExportFailure=failure;try{localStorage.setItem('iphone-last-export-error',JSON.stringify(failure));}catch{}}
const t=k=>strings[lang]?.[k]||strings.zh[k]||k;
const say=(key,detail='')=>$('status').textContent=t(key)+(detail?' '+detail:'');
function errorText(e){const text=e?.message||String(e);diagnostic.lastError=text;const key={WRONG_MEDIA_KIND:'wrongMediaKind',AUDIO_OUTSIDE_VIDEO:'audioOutsideVideo',TRACK_OVERLAP:'overlapError',SPLIT_POSITION:'splitError',SPLIT_ADVANCED:'splitAdvanced',INVALID_TRIM:'invalidTrim',GIF_LATER:'gifLater',UNSUPPORTED_PROJECT_FEATURES:'limitedExport'}[text];if(key)return t(key);if(/UNSUPPORTED|not supported|not defined/i.test(text))return t('noCodec');if(text.includes('MEMORY_LIMIT'))return t('memoryLimit');if(text.includes('TIMEOUT'))return t('timeout');return t('genericError')+' '+text;}
const timeout=(promise,ms=30000)=>{let id;return Promise.race([promise,new Promise((_,r)=>id=setTimeout(()=>r(Error('TIMEOUT')),ms))]).finally(()=>clearTimeout(id));};
function waitVideo(el,src){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(Error('TIMEOUT')),30000);const finish=e=>{clearTimeout(timer);el.removeEventListener('loadeddata',loaded);el.removeEventListener('error',failed);e?reject(e):resolve();};const loaded=()=>finish();const failed=()=>finish(Error('VIDEO_DECODE_UNSUPPORTED'));el.addEventListener('loadeddata',loaded);el.addEventListener('error',failed);el.src=src;el.load();});}
function reportPreviewError(e){diagnostic.previewError={time:new Date().toISOString(),message:e.message,preview:preview.diagnostics};if(e.message==='PREVIEW_DECODE_TIMEOUT')say('previewTimeout');else say('previewFailed',e.message);}
const preview=new Preview($('canvas'),updateTime,reportPreviewError);
function c(){return project?timelineRows(project).find(q=>q.clip.id===selected)?.clip||null:null;}
function objects(p=project){return p?[...p.clips,...(p.musics||[])]:[];}
function editTarget(p){return p.clips.find(c=>c.id===selected)||findMusic(p,selected);}
function pause(){preview.pause();$('play').textContent='▶';}
function translate(){document.documentElement.lang=lang==='zh'?'zh-Hant':'en';document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));$('language').textContent=lang==='zh'?'EN':'繁';render();}
function setTheme(mode){document.documentElement.dataset.theme=mode;localStorage.setItem('iphone-theme',mode);$('theme').textContent=mode==='dark'?'☀':'☾';}
$('theme').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
$('language').onclick=()=>{lang=lang==='zh'?'en':'zh';localStorage.setItem('iphone-language',lang);translate();renderProjects();};
function renderPreviewSize(){const s=$('screen');if(!project){s.style.width='';s.style.height='';return;}const ratio=project.proj.w/project.proj.h,maxHeight=Math.min(420,Math.max(200,innerHeight*.38)),width=Math.max(1,Math.min(document.querySelector('.viewer').clientWidth-2,maxHeight*ratio));s.style.width=(width+2)+'px';s.style.height=(width/ratio+2)+'px';}
new ResizeObserver(renderPreviewSize).observe(document.querySelector('.viewer'));window.addEventListener('resize',renderPreviewSize);
function missing(){return objects().filter(c=>!media.has(c.mediaKey)||!metas.has(c.mediaKey));}
function render(){
 const loaded=!!project,clip=c(),locked=busy||importing;file=clip?media.get(clip.mediaKey):null;meta=clip?metas.get(clip.mediaKey):null;
 for(const id of ['play','rewind','seek','saveProjectQuick','export','previewLandscape','previewPortrait','saveProject','saveAs','prepareProjectFile'])$(id).disabled=!loaded||locked;
 for(const id of ['in','out','inRange','outRange','reset','clipAt','clipTrack','moveNow','attachPrevious','split','deleteClip','muted','volume','repairMedia'])$(id).disabled=!clip||locked;
 $('undo').disabled=!history.length||locked;$('redo').disabled=!future.length||locked;
 for(const id of ['importHero','importBottom','projectMenu','newProject','openProjectFile','openExample','newProjectHome','openProjectsHome','openProjectFileHome'])$(id).disabled=locked;
 $('projectHome').hidden=loaded;
 $('play').disabled=$('rewind').disabled=$('seek').disabled=$('export').disabled=!loaded||locked||totalDuration(project)===0;
 $('export').disabled||=!!loaded&&!project.clips.length;
 $('empty').hidden=loaded&&objects().length>0;$('screen').classList.toggle('has-media',loaded);
 $('outputChip').textContent=(loaded?Math.min(project.proj.w,project.proj.h):720)+'p · 30';
 $('previewLandscape').setAttribute('aria-pressed',String(loaded&&project.proj.w>project.proj.h));$('previewPortrait').setAttribute('aria-pressed',String(loaded&&project.proj.w<project.proj.h));
 $('projectName').textContent=(name||t('untitled'))+(dirty?' •':'');
 $('selectionPanel').hidden=!clip;$('filename').textContent=clip?.name||t('noClip');
 $('limitNotice').hidden=!loaded||(!projectLimitations(project).length&&!missing().length);
 if(!$('limitNotice').hidden)$('limitNotice').textContent=t('limitedPreview')+(missing().length?' '+t('missingMedia')+missing().map(c=>c.name).join('、'):'');
 if(loaded){
  $('seek').min=0;$('seek').max=totalDuration(project);$('imageOrder').value=(project.proj.tracks||[]).indexOf('img')<(project.proj.tracks||[]).indexOf('video')?'below':'above';
  if(clip){
   const q=timelineRows(project).find(q=>q.clip.id===clip.id),max=clip.kind==='image'?Math.max(60,clip.outP):meta?.duration||clip.dur||clip.outP;
   $('duration').textContent=clipDuration(clip).toFixed(2)+' s';$('audioInfo').textContent=t(meta?.hasAudio?'audio':'silent');
   for(const id of ['inRange','outRange']){$(id).max=max;$(id).value=id==='inRange'?clip.inP:clip.outP;}
   $('in').value=Number(clip.inP).toFixed(2);$('out').value=Number(clip.outP).toFixed(2);$('in').max=max;$('out').max=clip.kind==='image'?'':max;
   $('clipAt').value=q.at.toFixed(2);$('clipTrack').value=String(clipTrack(clip));$('clipTrack').disabled=clip.kind!=='video'||locked;
   $('muted').checked=!!(clip.muted||clip.mute);$('volume').value=clip.vol??1;$('volumeValue').textContent=(clip.vol??1).toFixed(2);
   $('split').textContent=t(clip.kind==='audio'?'splitAudio':clip.kind==='image'?'splitImage':'splitVideo');$('repairMedia').hidden=!!meta;
  }
  renderExportSettings();
 }
 renderPreviewSize();renderTimeline();updateTime(preview.time,preview.playing);updateSaveState();
}
function updateTime(time=0,playing=false){const total=project?totalDuration(project):0;$('seek').value=time;$('time').textContent=formatTime(time)+' / '+formatTime(total);$('play').textContent=playing?'❚❚':'▶';const head=$('playhead');if(head)head.style.left=time*+$('zoom').value+'px';}
$('play').onclick=()=>preview.playing||preview.starting?pause():preview.play().catch(reportPreviewError);
$('rewind').onclick=()=>preview.seek(0);$('seek').oninput=()=>preview.seek(+$('seek').value);
function snapshot(){return {project:structuredClone(project),media:[...media],metas:[...metas],selected,name,savedId,originalHeader:structuredClone(originalHeader),example,dirty,playhead:preview.time,savedAt:Date.now()};}
function updateSaveState(){$('saveState').textContent=t(project?(dirty?'unsavedChanges':'projectSaved'):'projectStorageHint');}
function invalidateProjectFile(){if(projectDownloadUrl)URL.revokeObjectURL(projectDownloadUrl);projectDownloadUrl=null;projectDownloadFile=null;$('downloadProject').hidden=$('shareProject').hidden=true;}
function changed(){dirty=true;invalidateProjectFile();releaseResult();preview.setProject(project,media);render();updateSaveState();}
function recordBefore(){history.push(JSON.stringify(project));if(history.length>60)history.shift();future=[];}
function edit(fn,record=true){
 if(busy||importing||!project)return;const next=structuredClone(project);
 try{fn(next);if(JSON.stringify(next)===JSON.stringify(project))return;if(record)recordBefore();project=next;if(!c())selected=objects()[0]?.id||null;changed();}
 catch(e){say('genericError',errorText(e));render();}
}
function applyTrim(start,end,{record=true}={}){if(!c())return;edit(p=>trimClip(p,selected,start,end,meta?.duration||c().dur||c().outP),record);}
for(const id of ['in','out'])$(id).onchange=()=>applyTrim(+$('in').value,+$('out').value);
for(const id of ['inRange','outRange']){
 $(id).oninput=()=>{if(!c()||busy||importing)return;if(!pendingTrim)pendingTrim=JSON.stringify(project);const isIn=id==='inRange',v=isIn?Math.min(+$(id).value,c().outP-.1):Math.max(+$(id).value,c().inP+.1);applyTrim(isIn?v:c().inP,isIn?c().outP:v,{record:false});};
 $(id).onchange=()=>{if(pendingTrim&&pendingTrim!==JSON.stringify(project)){history.push(pendingTrim);future=[];}pendingTrim=null;render();};
}
$('reset').onclick=()=>applyTrim(0,c().kind==='image'?5:meta?.duration||c().dur);
$('undo').onclick=()=>{if(!history.length||busy||importing)return;future.push(JSON.stringify(project));project=JSON.parse(history.pop());selected=objects().find(c=>c.id===selected)?.id||objects()[0]?.id;changed();};
$('redo').onclick=()=>{if(!future.length||busy||importing)return;history.push(JSON.stringify(project));project=JSON.parse(future.pop());selected=objects().find(c=>c.id===selected)?.id||objects()[0]?.id;changed();};
const move=(at,track)=>edit(p=>moveClip(p,selected,at,track));
$('clipAt').onchange=()=>move(+$('clipAt').value,clipTrack(c()));$('clipTrack').onchange=()=>move(+$('clipAt').value,+$('clipTrack').value);
$('moveNow').onclick=()=>move(preview.time,clipTrack(c()));
$('attachPrevious').onclick=()=>{const q=timelineRows(project).find(q=>q.clip.id===selected),prev=timelineRows(project).filter(v=>v.track===q.track&&v.clip.id!==selected&&v.at<q.at);move(Math.max(0,...prev.map(v=>v.end)),q.track);};
$('split').onclick=()=>edit(p=>{const right=splitClip(p,selected,preview.time);selected=right.id;});
$('deleteClip').onclick=()=>edit(p=>{const q=layout(p);for(const r of q)r.clip.at=r.at;p.clips=p.clips.filter(c=>c.id!==selected);p.musics=(p.musics||[]).filter(m=>m.id!==selected);});
$('muted').onchange=()=>edit(p=>{const c=editTarget(p);c.muted=$('muted').checked;if('mute'in c)c.mute=c.muted;if(findMusic(p,selected)){if(c.muted){c.unmutedVol=c.vol;c.vol=0;}else c.vol=c.unmutedVol||.5;}});
$('volume').onchange=()=>edit(p=>{const item=editTarget(p);item.vol=+$('volume').value;if(findMusic(p,selected))item.muted=false;});
$('imageOrder').onchange=()=>edit(p=>{const order=(p.proj.tracks||['video','img','over','title','music']).filter(x=>x!=='img'),i=order.indexOf('video');order.splice(i+($('imageOrder').value==='above'?1:0),0,'img');p.proj.tracks=order;});
$('repairMedia').onclick=()=>{repairKey=c()?.mediaKey;$('repairFile').click();};
$('repairFile').onchange=async()=>{const f=$('repairFile').files[0];$('repairFile').value='';if(!f||!repairKey||busy||importing)return;importing=true;render();try{const m=await timeout(inspectMedia(f,c()?.kind));if(timelineRows(project).some(q=>q.clip.mediaKey===repairKey&&q.clip.kind!=='image'&&q.clip.outP>m.duration+.01))throw Error('SOURCE_TOO_SHORT');media.set(repairKey,f);metas.set(repairKey,m);changed();}catch(e){say('importFailed',errorText(e));}finally{importing=false;render();}};
function renderTimeline(){
 const host=$('timeline'),pps=+$('zoom').value,duration=project?Math.max(totalDuration(project),...timelineRows(project).map(q=>q.end)):0,width=Math.max(host.clientWidth-2,duration*pps+48);host.replaceChildren();if(!project)return;
 const body=document.createElement('div');body.className='timeline-body';body.style.width=width+'px';host.append(body);
 const ruler=document.createElement('div');ruler.className='time-ruler';body.append(ruler);const tick=pps<20?10:pps<50?5:1;
 for(let s=0;s<=duration+1;s+=tick){const b=document.createElement('button');b.textContent=formatTime(s);b.style.left=s*pps+'px';b.onclick=()=>preview.seek(Math.min(s,duration));ruler.append(b);}
 const rows=timelineRows(project),order=$('imageOrder').value==='below'?[1,0,2,3]:[2,1,0,3];
 for(const track of order){
  const label=document.createElement('div');label.className='lane-label';label.textContent=t(['lowerTrack','upperTrack','imageTrack','musicTrack'][track]);body.append(label);
  const lane=document.createElement('div');lane.className='lane';lane.dataset.track=track;body.append(lane);
  const ends=[];for(const q of rows.filter(q=>q.track===track).sort((a,b)=>a.at-b.at||a.index-b.index)){
   let row=ends.findIndex(end=>end<=q.at);if(row<0)row=ends.length;ends[row]=q.end;
   const button=document.createElement('button');button.className='timeline-clip'+(q.clip.id===selected?' selected':'')+(track===2?' image-clip':track===3?' audio-clip':'');button.dataset.id=q.clip.id;button.title=q.clip.name;
   button.style.cssText='left:'+q.at*pps+'px;width:'+Math.max(3,q.duration*pps)+'px;top:'+row*49+'px';
   const text=document.createElement('span');text.textContent=q.clip.name;button.append(text);
   button.onclick=()=>{if(busy||importing)return;selected=q.clip.id;preview.seek(q.at);render();};
   if(q.clip.id===selected){const grip=document.createElement('span');grip.className='move-grip';grip.textContent='⠿';grip.setAttribute('aria-label',t('dragClip'));button.append(grip);
    grip.onpointerdown=e=>{
     if(busy||importing)return;e.preventDefault();e.stopPropagation();grip.setPointerCapture(e.pointerId);pause();const start=e.clientX;let delta=0;
     grip.onpointermove=e=>{delta=(e.clientX-start)/pps;button.style.transform='translateX('+delta*pps+'px)';};
     grip.onpointerup=e=>{e.stopPropagation();grip.onpointermove=null;grip.onpointerup=null;button.style.transform='';if(Math.abs(delta*pps)>4)move(Math.max(0,Math.round((q.at+delta)*100)/100),q.track);};
     grip.onpointercancel=()=>{grip.onpointermove=null;button.style.transform='';};
    };grip.onclick=e=>{e.preventDefault();e.stopPropagation();};
   }
   lane.append(button);
  }
  lane.style.height=Math.max(1,ends.length)*49+'px';
 }
 const head=document.createElement('div');head.id='playhead';head.style.left=preview.time*pps+'px';body.append(head);
}
$('zoom').oninput=renderTimeline;$('fitTimeline').onclick=()=>{if(!project)return;$('zoom').value=Math.max(3,Math.min(120,($('timeline').clientWidth-48)/Math.max(1,totalDuration(project))));renderTimeline();};
$('trackHeight').oninput=()=>$('timeline').style.maxHeight=$('trackHeight').value+'px';
async function importFiles(files,expectedKind){
 if(importing||busy||!files.length)return;importing=true;pause();render();say('loading');
 try{
  const prepared=[];for(const f of files){const meta=await timeout(inspectMedia(f,expectedKind),45000);if(expectedKind&&meta.kind!==expectedKind)throw Error('WRONG_MEDIA_KIND');prepared.push({file:f,meta});}
  if(project)recordBefore();else{project=makeProject(prepared[0].file,prepared[0].meta);project.clips=[];name=t('untitled');savedId=null;originalHeader={};example=false;history=[];future=[];}
  for(const r of prepared){const clip=r.meta.kind==='audio'?addMusic(project,r.file,r.meta,preview.time):addClip(project,r.file,r.meta,+$('addTrack').value);media.set(clip.mediaKey,r.file);metas.set(clip.mediaKey,r.meta);selected=clip.id;}
  pendingTrim=null;changed();preview.seek(timelineRows(project).find(q=>q.clip.id===selected).at);say('ready');
 }catch(e){say('importFailed',errorText(e));}finally{importing=false;render();}
}
setupMediaLibrary({t,language:()=>lang,canImport:()=>!busy&&!importing,onFiles:importFiles,onError:e=>say('importFailed',e.message),onOpen:pause});
function allowReplace(){return !dirty||confirm(t('unsavedConfirm'));}
async function loadSnapshot(value){
 if(importing||busy)return;importing=true;pause();render();say('restoring');
 try{
  const next=structuredClone(value.project);if(!Array.isArray(next?.clips)||!next.proj||![next.proj.w,next.proj.h].every(n=>Number.isFinite(n)&&n>0))throw Error('INVALID_PROJECT');
  const ids=new Set();for(const c of next.clips){if(ids.has(c.id)||c.id==null||![c.inP,c.outP].every(Number.isFinite)||c.inP<0||c.outP-c.inP<.001)throw Error('INVALID_CLIP');ids.add(c.id);}
  const files=new Map(value.media||[]),info=new Map(value.metas||[]);
  if(value.file){const c=next.clips[0];c.mediaKey??=crypto.randomUUID();files.set(c.mediaKey,value.file);if(value.meta)info.set(c.mediaKey,value.meta);}
  for(const c of [...next.clips,...(next.musics||[]).map(m=>({...m,kind:'audio'}))])if(files.has(c.mediaKey)&&!info.has(c.mediaKey))try{info.set(c.mediaKey,await timeout(inspectMedia(files.get(c.mediaKey),c.kind),45000));}catch(e){diagnostic.mediaError=c.name+': '+e.message;}
  project=next;media=files;metas=info;selected=objects(next).some(c=>c.id===value.selected)?value.selected:objects(next)[0]?.id||null;name=value.name||t('untitled');savedId=value.savedId||null;originalHeader=value.originalHeader||{};example=!!value.example;dirty=!!value.dirty;history=[];future=[];pendingTrim=null;
  invalidateProjectFile();await releaseResult();preview.clear();preview.setProject(project,media);preview.seek(value.playhead||0);updateSaveState();say('projectReady');
 }catch(e){say('importFailed',errorText(e));}finally{importing=false;render();}
}
$('saveProjectQuick').onclick=()=>saveNamed(false);
const legacyRecovery=recoverLegacyDraft(t('recoveredCopy')).then(recovered=>{if(recovered)say('legacyRecovered');}).catch(e=>say('saveFailed',e.message));
function openNewProject(){
 if(busy||importing)return;$('projectDialog').close();$('newProjectName').value='';$('newProjectAspect').value='16:9';$('newProjectDialog').showModal();$('newProjectName').focus();
}
$('newProject').onclick=$('newProjectHome').onclick=openNewProject;
$('closeNewProject').onclick=()=>$('newProjectDialog').close();
$('createProject').onclick=async()=>{
 if(busy||importing)return;const title=$('newProjectName').value.trim();if(!title){$('newProjectName').value='';$('newProjectName').reportValidity();return;}if(!allowReplace())return;
 importing=true;render();pause();await releaseResult();preview.clear();
 const portrait=$('newProjectAspect').value==='9:16';project=makeProject({name:''},{duration:0,width:portrait?720:1280,height:portrait?1280:720});project.clips=[];
 media=new Map();metas=new Map();selected=null;name=title;savedId=null;dirty=true;example=false;history=[];future=[];originalHeader={};invalidateProjectFile();
 preview.setProject(project,media);$('newProjectDialog').close();importing=false;render();say('newProjectCreated',name);
};
async function openStoredProject(id){
 if(busy||importing||!allowReplace())return;
 try{const rec=await projects('get',id);if(!rec){say('projectMissing');await renderProjects();return;}
 $('projectDialog').close();await loadSnapshot({...rec,savedId:id,dirty:false});}catch(e){say('importFailed',e.message);}
}
let projectListGeneration=0;
async function renderProjects(){
 const generation=++projectListGeneration,host=$('projectList'),recent=$('recentProjects');host.textContent=t('loading');
 try{
  await legacyRecovery;const list=(await projects('list')).sort((a,b)=>b.savedAt-a.savedAt);if(generation!==projectListGeneration)return;
  host.replaceChildren();recent.replaceChildren();
  for(const [index,rec] of list.entries()){
   const id=rec.id;
   for(const target of index<3?[host,recent]:[host]){
    const row=document.createElement('div');row.className='project-row';
    const title=document.createElement('strong');title.textContent=rec.name;
    const detail=document.createElement('span');detail.textContent=t('lastSaved')+' '+new Date(rec.savedAt).toLocaleString(lang==='zh'?'zh-TW':'en');
    const open=document.createElement('button');open.textContent=t('open');open.onclick=()=>openStoredProject(id);
    row.append(title,detail,open);
    if(target===host){
     const del=document.createElement('button');del.textContent=t('delete');const projectTitle=rec.name;
     del.onclick=async()=>{if(busy||importing)return;if(confirm(t('deleteProjectConfirm')+' '+projectTitle)){
      try{await projects('delete',id);if(savedId===id){savedId=null;dirty=true;updateSaveState();render();}await renderProjects();}catch(e){say('saveFailed',e.message);}
     }};row.append(del);
    }
    target.append(row);
   }
  }
  if(!list.length){host.textContent=t('noProjects');recent.textContent=t('noProjects');}
 }catch(e){host.textContent=recent.textContent=errorText(e);}
}
function openProjectLibrary(){if(busy||importing)return;pause();$('projectDialog').showModal();renderProjects();}
$('projectMenu').onclick=$('openProjectsHome').onclick=openProjectLibrary;
$('closeProjects').onclick=()=>$('projectDialog').close();
legacyRecovery.then(()=>renderProjects());
async function saveNamed(asNew){
 if(!project||busy||importing)return false;const fresh=asNew||!savedId||example,proposed=asNew||example||!name||name===t('untitled')?prompt(t('projectName'),(name||t('untitled'))+(asNew||example?' '+t('copyName'):'')):name;if(!proposed?.trim())return false;
 importing=true;render();const id=fresh?crypto.randomUUID():savedId,rec={...snapshot(),id,savedId:id,name:proposed.trim(),example:false,dirty:false};
 try{await projects('put',id,rec);navigator.storage?.persist?.().then(value=>diagnostic.persistentStorage=value).catch(()=>{});name=rec.name;savedId=id;example=false;dirty=false;render();await renderProjects();say('namedSaved');return true;}catch(e){say('saveFailed',e.message);return false;}finally{importing=false;render();}
}
$('saveProject').onclick=()=>saveNamed(false);$('saveAs').onclick=()=>saveNamed(true);
$('openProjectFile').onclick=$('openProjectFileHome').onclick=()=>{if(!busy&&!importing)$('projectFile').click();};
$('projectFile').onchange=async()=>{const f=$('projectFile').files[0];$('projectFile').value='';if(!f||busy||importing||!allowReplace())return;importing=true;pause();render();try{const v=await readProject(f);importing=false;$('projectDialog').close();await loadSnapshot({...v,media:[...v.media],originalHeader:v.header,dirty:true});}catch(e){say('importFailed',e.message);}finally{importing=false;render();}};
$('prepareProjectFile').onclick=()=>{
 if(!project||busy||importing)return;try{
  invalidateProjectFile();const blob=writeProject(project,media,name||t('untitled'),originalHeader);
  projectDownloadFile=new File([blob],(name||'NiVedit').replace(/[\\/:*?"<>|]/g,'_')+'.nvproj',{type:'application/octet-stream'});
  projectDownloadUrl=URL.createObjectURL(projectDownloadFile);$('downloadProject').href=projectDownloadUrl;$('downloadProject').download=projectDownloadFile.name;$('downloadProject').hidden=false;$('shareProject').hidden=false;$('projectFileStatus').textContent=t('projectFileReady')+' '+(blob.size/1048576).toFixed(1)+' MB';
 }catch(e){$('projectFileStatus').textContent=errorText(e);}
};
$('shareProject').onclick=async()=>{if(!projectDownloadFile)return;try{if(!navigator.canShare?.({files:[projectDownloadFile]}))throw Error(t('useDownload'));await navigator.share({files:[projectDownloadFile]});}catch(e){if(e.name!=='AbortError')$('projectFileStatus').textContent=e.message;}};
$('openExample').onclick=async()=>{if(busy||importing||!allowReplace())return;if(!confirm(t('exampleNote')))return;importing=true;pause();render();try{const response=await fetch('./example/example.nvproj');if(!response.ok)throw Error('EXAMPLE_DOWNLOAD_FAILED');const v=await readProject(new File([await response.blob()],'example.nvproj'));$('projectDialog').close();importing=false;await loadSnapshot({...v,media:[...v.media],originalHeader:v.header,example:true,playhead:0});}catch(e){say('importFailed',e.message);}finally{importing=false;render();}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});

function hasAudio(){return !!project&&timelineRows(project).some(q=>metas.get(q.clip.mediaKey)?.hasAudio&&!q.clip.muted&&!q.clip.mute&&q.clip.vol!==0);}
function renderExportSettings(){if(!project)return;$('aspect').value=project.proj.w<project.proj.h?'9:16':'16:9';$('resolution').value=String(Math.min(project.proj.w,project.proj.h));$('exportSpec').textContent=project.proj.w+' × '+project.proj.h+' · 30 fps · '+project.proj.bitrate+' Mbps · MP4 / H.264'+(hasAudio()?' + AAC':' · '+t('silent'));}
function changeAspect(aspect){if(busy||importing||!project)return;if(aspect===project.proj.aspect)return;recordBefore();setAspect(project,aspect);changed();$('exportStatus').textContent=t('foreground');}
$('aspect').onchange=()=>changeAspect($('aspect').value);
$('previewLandscape').onclick=()=>changeAspect('16:9');
$('previewPortrait').onclick=()=>changeAspect('9:16');
$('resolution').onchange=()=>{if(busy||importing||!project)return;const value=+$('resolution').value;if(value===Math.min(project.proj.w,project.proj.h))return;recordBefore();setResolution(project,value);changed();$('exportStatus').textContent=t('foreground');};
function setBusy(value){$('aspect').disabled=value;$('resolution').disabled=value;if(!value)clearTimeout(exportWatchdog);busy=value;document.body.classList.toggle('busy',value);$('cancelExport').hidden=!value;$('closeExport').disabled=value;$('startExport').hidden=value;$('export').disabled=value||!project;render();}
async function releaseResult(){
 // Detach the OLD file synchronously. Never consult shared jobId after awaiting.
 const oldJobId=jobId;jobId=null;
 if(resultUrl){$('resultVideo').pause();$('resultVideo').removeAttribute('src');$('resultVideo').load();URL.revokeObjectURL(resultUrl);}
 resultUrl=null;result=null;$('resultVideo').hidden=true;$('share').hidden=true;$('download').hidden=true;
 if(oldJobId)try{const root=await navigator.storage?.getDirectory();await root?.removeEntry(oldJobId);}catch{}
}
$('export').onclick=()=>{pause();renderExportSettings();$('exportStatus').textContent=result?t('done'):t('foreground');$('startExport').hidden=false;$('exportDialog').showModal();};
async function stopExport(reason='cancelled'){
 if(!busy)return;++exportSequence;worker?.terminate();worker=null;await releaseResult();wakeLock?.release().catch(()=>{});wakeLock=null;setBusy(false);$('exportStatus').textContent=t(reason);$('progress').value=0;
}
$('cancelExport').onclick=()=>stopExport();$('closeExport').onclick=()=>{$('resultVideo').pause();$('exportDialog').close();};
$('exportDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();if(busy)stopExport('background');}});
$('startExport').onclick=async()=>{
 if(busy||importing||!project)return;
 const sequence=++exportSequence;
 if(!project.clips.length||missing().length||projectLimitations(project).length){$('exportStatus').textContent=t('limitedExport');return;}
 const exportProject=structuredClone(project),exportFiles=[...media],exportFile=media.get(project.clips[0].mediaKey),exportMeta={hasAudio:hasAudio()};
 const duration=totalDuration(exportProject);
 const simple=!(project.musics||[]).length&&project.clips.length===1&&project.clips[0].kind!=='image'&&layout(project)[0].at===0&&!project.clips[0].muted&&!project.clips[0].mute&&(project.clips[0].vol??1)===1;
 const clip=exportProject.clips[0],settings=exportProject.proj;
 diagnostic.lastAttempt={stage:'prepare',width:settings.w,height:settings.h,inP:clip.inP,outP:clip.outP,duration,clipCount:exportProject.clips.length,sourceBytes:exportFiles.reduce((n,[,f])=>n+f.size,0)};
 diagnostic.outputValidation=null;
 setBusy(true);await releaseResult();
 if(sequence!==exportSequence)return;
 $('progress').value=0;$('exportStatus').textContent=t('prepare');
 try{
  const acquiredWakeLock=await navigator.wakeLock?.request('screen').catch(()=>null);
  if(sequence!==exportSequence||!busy){await acquiredWakeLock?.release().catch(()=>{});return;}
  wakeLock=acquiredWakeLock;
  jobId='nivedit-export-'+crypto.randomUUID()+'.mp4';
  worker=new Worker(new URL(simple?'./export-worker.js':'./multitrack-worker.js',import.meta.url),{type:'module'});
  const activeWorker=worker;
  const fail=async e=>{if(worker!==activeWorker||sequence!==exportSequence)return;++exportSequence;recordExportFailure(e);activeWorker.terminate();worker=null;await releaseResult();setBusy(false);$('exportStatus').textContent=errorText(e);wakeLock?.release().catch(()=>{});wakeLock=null;};
  const touchWatchdog=()=>{clearTimeout(exportWatchdog);exportWatchdog=setTimeout(()=>fail(new Error('TIMEOUT')),120000);};
  touchWatchdog();activeWorker.onerror=e=>fail(new Error(e.message));
  activeWorker.onmessage=async({data})=>{
   if(worker!==activeWorker||sequence!==exportSequence)return;touchWatchdog();
   if(data.type==='stage'){diagnostic.lastAttempt.stage=data.stage;$('exportStatus').textContent=t(data.stage);diagnostic.exportStorage=data.storage;}
   if(data.type==='progress'){$('progress').value=data.value;$('exportStatus').textContent=t('encode')+' '+Math.round(data.value*100)+'%';}
   if(data.type==='error'){await fail(new Error(data.message));return;}
   if(data.type==='done'){
    diagnostic.lastAttempt.stage='verify';$('exportStatus').textContent=t('verify');let check;
    try{
     check=new Input({source:new BlobSource(data.blob),formats:ALL_FORMATS});
     const v=await check.getPrimaryVideoTrack(),a=await check.getPrimaryAudioTrack(),d=await check.computeDuration();
     if(worker!==activeWorker||sequence!==exportSequence)return;
     diagnostic.outputValidation={width:v?.displayWidth,height:v?.displayHeight,duration:d,video:v?.codec,audio:a?.codec};
     if(!v||v.displayWidth!==settings.w||v.displayHeight!==settings.h||(exportMeta.hasAudio&&!a)||Math.abs(d-duration)>.25)throw new Error('OUTPUT_VALIDATION_FAILED');
     result=new File([data.blob],'NiVedit-iPhone-'+new Date().toISOString().replace(/[:.]/g,'-')+'.mp4',{type:'video/mp4'});
     resultUrl=URL.createObjectURL(result);await waitVideo($('resultVideo'),resultUrl);
     if(worker!==activeWorker||sequence!==exportSequence)return;
     $('resultVideo').hidden=false;$('download').href=resultUrl;$('download').download=result.name;$('download').hidden=false;$('share').hidden=false;
     diagnostic.lastAttempt.stage='done';$('progress').value=1;$('exportStatus').textContent=t('done');diagnostic.lastOutput={bytes:result.size,duration:d,video:v.codec,audio:a?.codec||null,width:v.displayWidth,height:v.displayHeight,storage:data.storage};
     activeWorker.terminate();worker=null;setBusy(false);wakeLock?.release().catch(()=>{});wakeLock=null;
    }catch(e){await fail(e);}finally{check?.dispose();}
   }
  };
  activeWorker.postMessage({file:exportFile,media:exportFiles,project:exportProject,jobId});
 }catch(e){if(sequence!==exportSequence)return;recordExportFailure(e);await stopExport();$('exportStatus').textContent=errorText(e);}
};
$('share').onclick=async()=>{if(!result)return;if(!navigator.canShare?.({files:[result]})){$('exportStatus').textContent=t('shareUnavailable');return;}try{await navigator.share({files:[result],title:'NiVedit'});$('exportStatus').textContent=t('shared');}catch(e){$('exportStatus').textContent=e.name==='AbortError'?t('shareCancelled'):errorText(e);}};
$('download').onclick=()=>$('exportStatus').textContent=t('downloaded');
async function probe(){
 const report={secureContext:isSecureContext,videoEncoder:typeof VideoEncoder!=='undefined',audioEncoder:typeof AudioEncoder!=='undefined',webGPU:!!navigator.gpu,opfs:!!navigator.storage?.getDirectory,fileShare:!!navigator.canShare,standalone:matchMedia('(display-mode: standalone)').matches};
 for(const [key,fn] of Object.entries({h264_720p:()=>canEncodeVideo('avc',{width:1280,height:720,bitrate:4e6}),h264_1080p:()=>canEncodeVideo('avc',{width:1920,height:1080,bitrate:8e6}),h264_1080p_portrait:()=>canEncodeVideo('avc',{width:1080,height:1920,bitrate:8e6}),h264_4k:()=>canEncodeVideo('avc',{width:3840,height:2160,bitrate:16e6}),aac:()=>canEncodeAudio('aac',{sampleRate:48000,numberOfChannels:2,bitrate:192000})})){try{report[key]=await timeout(fn(),5000);}catch{report[key]='unknown';}}
 try{report.storage=await navigator.storage?.estimate();}catch{}
 diagnostic={...diagnostic,...report,preview:preview.diagnostics};return diagnostic;
}
$('diagnostics').onclick=async()=>{$('deviceDialog').showModal();$('deviceInfo').textContent='…';$('deviceInfo').textContent=JSON.stringify(await probe(),null,2);};
$('closeDevice').onclick=()=>$('deviceDialog').close();$('copyDiagnostics').onclick=async()=>{try{await navigator.clipboard.writeText($('deviceInfo').textContent);say('copied');}catch{$('deviceInfo').focus();}};
document.querySelectorAll('[data-update-link]').forEach(link=>link.addEventListener('click',async event=>{
 event.preventDefault();
 if(busy||importing){say('updateBusy');return;}
 if(result&&!confirm(t('updateExportWarning')))return;
 if(project&&dirty&&!await saveNamed(false))return;
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


setTheme(localStorage.getItem('iphone-theme')||'dark');translate();
