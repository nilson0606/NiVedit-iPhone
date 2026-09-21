import {MUSIC_CATALOG,MUSIC_CATEGORIES} from './music-catalog.js';
export function setupMediaLibrary({t,language,canImport,onFiles,onError,onOpen}){
 const $=id=>document.getElementById(id);let token=0,controller,chosen,url;
 const stop=()=>{++token;controller?.abort();controller=null;chosen=null;$('musicAudition').pause();$('musicAudition').removeAttribute('src');$('musicAudition').load();if(url)URL.revokeObjectURL(url);url=null;$('addLibraryMusic').disabled=true;};
 const close=()=>{$('mediaDialog').close();$('musicDialog').close();};
 for(const id of ['importHero','importBottom'])$(id).onclick=()=>{if(canImport()){onOpen();$('mediaDialog').showModal();}};
 $('closeMedia').onclick=()=>$('mediaDialog').close();
 for(const [button,input] of [['pickVideo','file'],['pickVideoFiles','videoFiles'],['pickImage','imageFile'],['pickImageFiles','imageFiles'],['pickAudio','audioFile'],['pickOwnMusic','audioFile']]){
  $(button).onclick=()=>{if(canImport()){close();$(input).click();}};
 }
 for(const [id,kind]of [['file','video'],['videoFiles','video'],['imageFile','image'],['imageFiles','image'],['audioFile','audio']]){
  $(id).onchange=()=>{const files=[...$(id).files];$(id).value='';onFiles(files,kind);};
 }
 async function choose(entry){
  stop();const turn=token;controller=new AbortController();$('musicStatus').textContent=t('loading');
  try{
   const response=await fetch(new URL('../music/'+entry.stem+'.mp3',import.meta.url),{signal:controller.signal});
   if(!response.ok)throw Error('MUSIC_DOWNLOAD_FAILED');
   const bytes=await response.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
   if(bytes.byteLength!==entry.bytes||hash!==entry.sha256)throw Error('MUSIC_ASSET_MISMATCH');
   if(turn!==token||!$('musicDialog').open)return;
   chosen=new File([bytes],entry.filename,{type:'audio/mpeg'});url=URL.createObjectURL(chosen);$('musicAudition').src=url;$('musicAudition').volume=.7;
   $('musicStatus').textContent=(language()==='en'?entry.en:entry.name)+' · '+t('musicReady');$('addLibraryMusic').disabled=false;
  }catch(e){if(turn===token&&e.name!=='AbortError')$('musicStatus').textContent=t('musicLoadFailed');}
 }
 function render(){
  const select=$('musicCategory'),old=select.value;select.replaceChildren(new Option(t('allCategories'),''));
  for(const c of MUSIC_CATEGORIES)select.add(new Option(language()==='en'?c.en:c.name,c.id));select.value=old;
  const query=$('musicSearch').value.trim().toLowerCase(),host=$('musicList');host.replaceChildren();
  for(const entry of MUSIC_CATALOG.filter(e=>(!old||e.category===old)&&(!query||[e.name,e.en,e.instruments,e.instrumentsEn].join(' ').toLowerCase().includes(query)))){
   const button=document.createElement('button');button.className='music-choice';button.textContent=(language()==='en'?entry.en:entry.name)+' · '+entry.duration+' s';button.onclick=()=>choose(entry);host.append(button);
  }
  if(!host.children.length)host.textContent=t('nothingFound');
 }
 $('pickBuiltInMusic').onclick=()=>{if(canImport()){onOpen();$('mediaDialog').close();stop();$('musicStatus').textContent=t('musicSelect');render();$('musicDialog').showModal();}};
 $('musicSearch').oninput=$('musicCategory').onchange=render;
 $('closeMusic').onclick=()=>$('musicDialog').close();$('musicDialog').addEventListener('close',stop);
 $('addLibraryMusic').onclick=async()=>{if(!chosen||!canImport())return;const file=chosen;close();try{await onFiles([file],'audio');}catch(e){onError(e);}};
}
