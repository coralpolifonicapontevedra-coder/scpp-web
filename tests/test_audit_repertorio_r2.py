import importlib.util
import pathlib
import sys
import unittest

SCRIPT = pathlib.Path(__file__).parents[1] / "scripts" / "audit-repertorio-r2.py"
spec = importlib.util.spec_from_file_location("audit_repertorio_r2", SCRIPT)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


class AuditRepertorioR2KeysTest(unittest.TestCase):
    def test_explicit_key_has_priority(self):
        row = {
            "R2Key": "/repertorio/audios/1/manual.mp3",
            "NomeObra": "1",
            "AudioFile": "voz.mp3",
        }
        self.assertEqual(module.derive_audio_key(row), "repertorio/audios/1/manual.mp3")

    def test_derives_same_key_as_r2_index(self):
        row = {
            "R2Key": "",
            "NomeObra": "12.0",
            "AudioFile": "Cartafol/A Fe do Cego - Soprano.MP3",
        }
        self.assertEqual(
            module.derive_audio_key(row),
            "repertorio/audios/12.0/a-fe-do-cego-soprano.mp3",
        )

    def test_missing_source_cannot_be_derived(self):
        row = {"R2Key": "", "NomeObra": "12", "AudioFile": ""}
        self.assertEqual(module.derive_audio_key(row), "")


if __name__ == "__main__":
    unittest.main()
