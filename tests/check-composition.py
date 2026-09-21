"""Independent FFmpeg checks of rendered MP4s (not the JS composition code)."""
from pathlib import Path
import subprocess,json,argparse
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--ffmpeg',required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[1]/'qa';ffprobe=str(Path(a.ffmpeg).with_name('ffprobe.exe'));report={}
def frame(name,t):
 data=subprocess.check_output([a.ffmpeg,'-v','error','-ss',str(t),'-i',str(root/name),'-frames:v','1','-vf','scale=320:180','-pix_fmt','rgb24','-f','rawvideo','pipe:1'])
 return np.frombuffer(data,dtype=np.uint8).reshape(180,320,3)
def rms(name,t,d=.2):
 data=subprocess.check_output([a.ffmpeg,'-v','error','-ss',str(t),'-i',str(root/name),'-t',str(d),'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1'])
 samples=np.frombuffer(data,dtype=np.float32);return float(np.sqrt(np.mean(samples*samples)))
for name,duration in [('phase2-dual.mp4',3),('phase2-images.mp4',3),('phase2-example.mp4',6),('phase2-gap.mp4',6)]:
 meta=json.loads(subprocess.check_output([ffprobe,'-v','error','-show_streams','-show_format','-of','json',str(root/name)]));video=next(s for s in meta['streams']if s['codec_type']=='video');assert (video['width'],video['height'])==(1280,720);assert any(s['codec_name']=='aac'for s in meta['streams']);actual=float(meta['format']['duration']);assert abs(actual-duration)<.08;report[name]={'duration':actual}
colors={}
for t,label in [(.8,'red'),(1.2,'green'),(1.8,'red-again')]:
 rgb=frame('phase2-images.mp4',t)[80:100,150:170].mean(axis=(0,1));colors[label]=rgb.tolist()
 if label=='green':assert rgb[1]>180 and rgb[0]<60
 else:assert rgb[0]>200 and rgb[1]<110
report['imageOverlapAndReveal']=colors
levels=[rms('phase2-dual.mp4',t)for t in [.3,1.3,2.3]]
assert 1.8<levels[1]/levels[0]<2.2 and .8<levels[2]/levels[0]<1.2
report['bothVideoTracksMixedRMS']=levels
blank=frame('phase2-gap.mp4',.2);assert blank.mean()<2
silence=rms('phase2-gap.mp4',.1);assert silence<.0001
assert frame('phase2-gap.mp4',.8).mean()>15
report['leadingGap']={'pixelMean':float(blank.mean()),'audioRMS':silence}
(root/'composition-check.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report,indent=2))
