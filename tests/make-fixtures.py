"""Generate only synthetic audiovisual fixtures; no personal files.
Usage: python tests/make-fixtures.py --ffmpeg /path/to/ffmpeg
"""
import argparse, subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--ffmpeg',default='ffmpeg');a=p.parse_args()
root=Path(__file__).resolve().parents[1]/'qa';root.mkdir(exist_ok=True)
def run(args): subprocess.run([a.ffmpeg,'-v','error','-y',*args],check=True)
for name,size in [('landscape','1280x720'),('portrait','360x640')]:
 run(['-f','lavfi','-i',f'testsrc2=size={size}:rate=30:duration=6','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=6','-c:v','libx264','-preset','ultrafast','-crf','24','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-shortest',str(root/f'{name}.mp4')])
run(['-display_rotation:v:0','90','-i',str(root/'landscape.mp4'),'-c','copy',str(root/'rotated.mp4')])
print(root)

