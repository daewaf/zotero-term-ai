import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('builder', Path(__file__).resolve().parents[1] / 'build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class ReleaseBuildTests(unittest.TestCase):
    def test_release_links_integrity_and_clean_archive(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'GITHUB_REF': ''}):
            output = Path(directory)
            xpi = builder.build('example/term-ai', output)
            first = xpi.read_bytes()
            with zipfile.ZipFile(xpi) as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(set(archive.namelist()), set(builder.FILES) | {'LICENSE'})
                manifest = json.loads(archive.read('manifest.json'))
                app = manifest['applications']['zotero']
                self.assertEqual(app['update_url'], 'https://github.com/example/term-ai/releases/latest/download/updates.json')
            update = json.loads((output / 'updates.json').read_text())['addons'][app['id']]['updates'][0]
            self.assertEqual(update['version'], manifest['version'])
            self.assertEqual(update['update_link'], f"https://github.com/example/term-ai/releases/download/v{manifest['version']}/{xpi.name}")
            self.assertEqual(update['update_hash'], 'sha256:' + hashlib.sha256(first).hexdigest())
            self.assertEqual(update['applications']['zotero']['strict_max_version'], app['strict_max_version'])
            builder.build('example/term-ai', output)
            self.assertEqual(first, xpi.read_bytes())

    def test_repository_required(self):
        for repository in ('', None, 'https://github.com/a/b', 'a/b/c', 'a/b?token=secret'):
            with self.subTest(repository=repository), self.assertRaises(ValueError):
                builder.build(repository, 'unused')

    def test_tag_must_match_version(self):
        with patch.dict(os.environ, {'GITHUB_REF': 'refs/tags/v999.0.0'}), self.assertRaises(ValueError):
            builder.build('example/term-ai', 'unused')

    def test_unknown_source_file_is_rejected(self):
        import shutil
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'GITHUB_REF': ''}):
            root = Path(directory)
            shutil.copytree(builder.ROOT / 'source', root / 'source')
            (root / 'source/prefs.js').write_text('// private settings')
            with patch.object(builder, 'ROOT', root), self.assertRaises(ValueError):
                builder.build('example/term-ai', root / 'dist')
