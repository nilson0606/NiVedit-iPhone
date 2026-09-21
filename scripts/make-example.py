"""Original synthetic 720p example. No user media or external artwork/music."""
from pathlib import Path
import argparse,subprocess,math,json
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('--ffmpeg',default='ffmpeg');a=p.parse_args()
root=Path(__file__).resolve().parents[1];folder=root/'qa'/'example-build';folder.mkdir(parents=True,exist_ok=True)
for name,w,h,seconds,freq in [('lower',1280,720,4,330),('upper',360,640,2,440)]:
 out=folder/(name+'.mp4')
 cmd=[a.ffmpeg,'-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{w}x{h}','-r','30','-i','pipe:0','-f','lavfi','-i',f'sine=frequency={freq}:sample_rate=48000:duration={seconds}','-af','volume=0.12,afade=t=in:d=0.2,afade=t=out:st='+str(seconds-.3)+':d=0.3','-c:v','libx264','-crf','25','-preset','fast','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-shortest',str(out)]
 process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
 for frame in range(seconds*30):
  im=Image.new('RGB',(w,h),(17,38,53));d=ImageDraw.Draw(im);t=frame/30
  for y in range(h):d.line((0,y,w,y),fill=(17+int(18*y/h),38+int(28*y/h),53+int(32*y/h)))
  cx=w/2+math.sin(t*1.7)*w*.22;cy=h/2+math.cos(t*1.1)*h*.12;r=min(w,h)*.25
  d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=(124,223,192) if name=='lower' else (246,185,97))
  for i in range(4):d.line((w*.1,h*(.78+i*.04),w*.9,h*(.78+i*.04)),fill=(64,99,109),width=2)
  process.stdin.write(im.tobytes())
 process.stdin.close()
 if process.wait():raise RuntimeError('ffmpeg failed')
im=Image.new('RGBA',(1280,720),(0,0,0,0));d=ImageDraw.Draw(im);d.rounded_rectangle((390,210,890,510),radius=70,fill=(148,224,206,255));d.polygon([(595,280),(595,440),(730,360)],fill=(20,52,62,255));im.save(folder/'play.png')
clips=[];assets=[]
for i,(name,kind,track,at,length) in enumerate([('lower.mp4','video',0,0,4),('upper.mp4','video',1,1,2),('play.png','image',2,3.5,2.5)]):
 f=folder/name;key='example-'+str(i);assets.append((key,f))
 clips.append(dict(id='example-clip-'+str(i),kind=kind,name=name,mediaKey=key,dur=length,w=360 if track==1 else 1280,h=640 if track==1 else 720,inP=0,outP=length,at=at,track=track,muted=False,vol=1,trans={'type':'none','dur':.6},transOut={'type':'none','dur':.6},transMode='overlap',x=.5,y=.5,scale=1,opacity=1,rot=0,motionRot=0,cropShape='none',kf=None))
state=dict(ver='V13',clips=clips,titles=[],subs=[],overlays=[],musics=[],proj=dict(w=1280,h=720,fps=30,bitrate=4,aspect='16:9',fit='contain',tracks=['video','img','over','title','music']),playhead=0)
index=[];offset=0
for key,f in assets:
 size=f.stat().st_size;index.append(dict(key=key,name=f.name,type='image/png' if f.suffix=='.png' else 'video/mp4',off=offset,len=size,size=size));offset+=size
head=json.dumps(dict(magic='NVPROJ1',ver='V13',name='720p 多軌練習',state=state,index=index),ensure_ascii=False).encode()
target=root/'example'/'example.nvproj';target.parent.mkdir(exist_ok=True)
with target.open('wb') as f:
 f.write(b'NVPROJ1');f.write(len(head).to_bytes(4,'little'));f.write(head)
 for _,asset in assets:f.write(asset.read_bytes())
print(target.name,target.stat().st_size,'bytes')
