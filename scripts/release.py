"""Generate release hashes after editing app files, before committing/deploying."""
from pathlib import Path
import hashlib,json,re
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
sw=(root/'sw.js').read_text(encoding='utf-8')
if "VERSION='"+version+"'" not in sw: raise SystemExit('Service worker version differs from package.json')
names=['index.html','src/style.css','src/app.js','src/model.js','src/storage.js','src/i18n.js','src/export-worker.js','src/multitrack-worker.js','src/media.js','src/project-file.js','src/composition.js','example/example.nvproj','vendor/mediabunny.mjs','manual.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/icon.svg']
manifest={'version':version,'assets':{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in names}}
(root/'release.json').write_bytes((json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
print('Release',version,':',len(names),'verified assets')
