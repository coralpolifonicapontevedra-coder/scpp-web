import importlib.util
import pathlib
import sys
import types
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "audit-file-systems.py"


def load_module():
    for name in ["boto3", "google", "google.oauth2", "google.oauth2.service_account", "googleapiclient", "googleapiclient.discovery"]:
        sys.modules.setdefault(name, types.ModuleType(name))
    sys.modules["boto3"].client = lambda *args, **kwargs: None
    sys.modules["google.oauth2.service_account"].Credentials = object
    sys.modules["googleapiclient.discovery"].build = lambda *args, **kwargs: None

    spec = importlib.util.spec_from_file_location("audit_file_systems", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeSheets:
    def __init__(self, rows):
        self.rows = rows

    def spreadsheets(self):
        return self

    def values(self):
        return self

    def get(self, **kwargs):
        self.tab = kwargs["range"]
        return self

    def execute(self):
        return {"values": self.rows[self.tab]}


class CatalogAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mod = load_module()

    def test_catalog_uses_stable_key(self):
        rows = {
            "'Documentación'!A:AZ": [
                ["Id_Documento", "Ficheiro"],
                ["12", "Balance 2025.pdf"],
            ]
        }
        catalog = self.mod.catalog_for_scope(FakeSheets(rows), "documentacion")
        self.assertEqual(catalog[0]["record_id"], "12")
        self.assertEqual(catalog[0]["source_name"], "Balance 2025.pdf")
        self.assertEqual(catalog[0]["r2_key"], "documentacion/documentos/12-balance-2025.pdf")

    def test_extra_drive_is_backup_not_missing_r2(self):
        rows = {
            "'Documentación'!A:AZ": [
                ["Id_Documento", "Ficheiro"],
                ["12", "Balance_2025.pdf"],
            ]
        }
        files = [
            {"id": "a", "name": "Balance_2025.pdf", "size": 100},
            {"id": "b", "name": "Balance_2025.xls", "size": 80},
        ]
        r2_objects = [
            {"Key": "documentacion/documentos/12-balance_2025.pdf", "Size": 100},
        ]
        scope = next(x for x in self.mod.DRIVE_SCOPES if x.code == "documentacion")
        findings = []
        result = self.mod.audit_catalog_scope(scope, files, r2_objects, FakeSheets(rows), findings)
        self.assertEqual(result["cataloged"], 1)
        self.assertEqual(result["correct"], 1)
        self.assertEqual(result["missing_r2"], 0)
        self.assertEqual(result["extra_drive"], 1)
        self.assertTrue(any(x.code == "DRIVE_BACKUP_EXTRA" for x in findings))
        self.assertFalse(any(x.code == "CATALOG_MISSING_R2" for x in findings))

    def test_missing_catalog_object_is_real_error(self):
        rows = {
            "'Actas XD e AX'!A:AZ": [
                ["Id_Actas", "Acta"],
                ["3", "Acta_03.pdf"],
            ]
        }
        files = [{"id": "a", "name": "Acta_03.pdf", "size": 100}]
        scope = next(x for x in self.mod.DRIVE_SCOPES if x.code == "actas")
        findings = []
        result = self.mod.audit_catalog_scope(scope, files, [], FakeSheets(rows), findings)
        self.assertEqual(result["missing_r2"], 1)
        self.assertTrue(any(x.code == "CATALOG_MISSING_R2" for x in findings))


if __name__ == "__main__":
    unittest.main()
