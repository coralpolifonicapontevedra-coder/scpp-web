import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'sync-honras-r2.py'
spec = importlib.util.spec_from_file_location('sync_honras_r2', MODULE_PATH)
mod = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(mod)


CSV = '''Id_Honra,Categoria,Data,Ano,Festividade,PersoaEntidade,TipoDestinatario,Condicion,Observacions,MostrarWeb,Orde
HON-0001,Medalla de Prata,29/12/2025,2025,San David,Gabriel Bravo Bueno,Persoa,baixo,,TRUE,2
HON-0002,Medalla de Prata,29/12/2025,2025,San David,Mª Luisa Corujo Castro,Persoa,,,TRUE,1
HON-0003,Medalla de Ouro,,2024,,Persoa Oculta,Persoa,,,FALSE,1
'''


class HonrasIndexTests(unittest.TestCase):
    def test_normaliza_e_filtra_publicas(self):
        rows, headers = mod.parse_csv(CSV)
        result = mod.build(rows, headers)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['data'], '2025-12-29')
        self.assertEqual({item['id'] for item in result}, {'HON-0001', 'HON-0002'})

    def test_rexeita_ids_duplicados(self):
        duplicated = CSV + 'HON-0001,Medalla de Ouro,,2026,,Outra persoa,Persoa,,,TRUE,1\n'
        rows, headers = mod.parse_csv(duplicated)
        with self.assertRaises(RuntimeError):
            mod.build(rows, headers)

    def test_rexeita_cabeceiras_incompletas(self):
        rows, headers = mod.parse_csv('Id_Honra,Categoria\nHON-1,Medalla de Ouro\n')
        with self.assertRaises(RuntimeError):
            mod.build(rows, headers)


if __name__ == '__main__':
    unittest.main()
