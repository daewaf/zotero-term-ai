"""Build release artifacts without reading a Zotero profile or any credentials."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
FILES = (
    'bootstrap.js', 'manifest.json', 'content/core.js', 'content/dialog.js',
    'content/dialog.xhtml', 'content/preferences.js', 'content/preferences.xhtml',
)

def build(repository, output):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+', repository or ''):
        raise ValueError('请提供 GitHub 仓库：--repository OWNER/REPO')
    manifest = json.loads((ROOT / 'source/manifest.json').read_text(encoding='utf-8'))
    version = manifest['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('版本必须为 X.Y.Z')
    tag = os.environ.get('GITHUB_REF', '')
    if tag.startswith('refs/tags/') and tag != 'refs/tags/v' + version:
        raise ValueError('Git 标签与 manifest 版本不一致')
    for file in ('bootstrap.js', 'content/core.js', 'content/dialog.xhtml'):
        if version not in (ROOT / 'source' / file).read_text(encoding='utf-8'):
            raise ValueError('请同步版本号：' + file)
    actual = {p.relative_to(ROOT / 'source').as_posix() for p in (ROOT / 'source').rglob('*') if p.is_file()}
    if actual != set(FILES):
        raise ValueError('source 文件与发布白名单不一致，请检查新增文件')
    for name in FILES:
        if (ROOT / 'source' / name).is_symlink():
            raise ValueError('发布源码不能是符号链接')
        if name.endswith('.xhtml'):
            ET.parse(ROOT / 'source' / name)
    base = 'https://github.com/' + repository
    app = manifest['applications']['zotero']
    app['update_url'] = base + '/releases/latest/download/updates.json'
    manifest['homepage_url'] = base
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    xpi = output / ('term-ai-' + version + '.xpi')
    with zipfile.ZipFile(xpi, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name in (*FILES, 'LICENSE'):
            if name == 'manifest.json':
                data = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
            else:
                data = (ROOT / name if name == 'LICENSE' else ROOT / 'source' / name).read_bytes()
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    digest = hashlib.sha256(xpi.read_bytes()).hexdigest()
    update = {'addons': {app['id']: {'updates': [{
        'version': version,
        'update_link': base + '/releases/download/v' + version + '/' + xpi.name,
        'update_hash': 'sha256:' + digest,
        'applications': {'zotero': {k: app[k] for k in ('strict_min_version', 'strict_max_version')}},
    }]}}}
    (output / 'updates.json').write_text(json.dumps(update, indent=2) + '\n', encoding='utf-8')
    (output / 'SHA256SUMS.txt').write_text(digest + '  ' + xpi.name + '\n', encoding='utf-8')
    return xpi

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--repository', default=os.environ.get('GITHUB_REPOSITORY'))
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    try:
        print(build(args.repository, args.output))
    except ValueError as error:
        parser.exit(2, str(error) + '\n')
