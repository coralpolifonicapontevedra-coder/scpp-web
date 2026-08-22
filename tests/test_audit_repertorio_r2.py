import importlib.util
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).parents[1]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


audit = load_module("audit_repertorio_r2", ROOT / "scripts" / "audit-repertorio-r2.py")
builder = load_module("build_r2_index", ROOT / "scripts" / "build-r2-index.py")


class AuditRepertorioR2KeysTest(unittest.TestCase):
    def test_explicit_key_has_priority(self):
        row = {
            "R2Key": "/repertorio/audios/1/manual.mp3",
            "NomeObra": "01",
            "AudioFile": "voz.mp3",
        }
        self.assertEqual(audit.derive_audio_key(row), "repertorio/audios/1/manual.mp3")
        self.assertEqual(builder.derive_audio_key(row), "repertorio/audios/1/manual.mp3")

    def test_numeric_work_id_is_canonicalized(self):
        row = {
            "R2Key": "",
            "NomeObra": "12.0",
            "AudioFile": "Cartafol/A Fe do Cego - Soprano.MP3",
        }
        expected = "repertorio/audios/12/a-fe-do-cego-soprano.mp3"
        self.assertEqual(audit.derive_audio_key(row), expected)
        self.assertEqual(builder.derive_audio_key(row), expected)

    def test_leading_zero_is_removed_like_historical_migration(self):
        row = {
            "R2Key": "",
            "NomeObra": "04",
            "AudioFile": "A Castelao - Soprano.mp4",
        }
        expected = "repertorio/audios/4/a-castelao-soprano.mp4"
        self.assertEqual(audit.derive_audio_key(row), expected)
        self.assertEqual(builder.derive_audio_key(row), expected)

    def test_missing_source_cannot_be_derived(self):
        row = {"R2Key": "", "NomeObra": "12", "AudioFile": ""}
        self.assertEqual(audit.derive_audio_key(row), "")
        self.assertEqual(builder.derive_audio_key(row), "")


if __name__ == "__main__":
    unittest.main()
