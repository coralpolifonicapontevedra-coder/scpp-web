import importlib.util
import pathlib
import unittest


SCRIPT = pathlib.Path(__file__).parents[1] / "scripts" / "sync-concertos-r2.py"
SPEC = importlib.util.spec_from_file_location("sync_concertos_r2", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def normalized(**values):
    return {MODULE.header_name(key): str(value) for key, value in values.items()}


class SyncConcertosR2Tests(unittest.TestCase):
    def test_iso_date_accepts_sheet_and_iso_formats(self):
        self.assertEqual(MODULE.iso_date("9/4/1925"), "1925-04-09")
        self.assertEqual(MODULE.iso_date("2026-05-15"), "2026-05-15")
        self.assertEqual(MODULE.iso_date(""), "")

    def test_builds_public_and_private_indexes_without_exposing_hidden_rows(self):
        concerts = [
            normalized(
                Id="hist-0001",
                Data="09/04/1925",
                Nome="Concerto nº 1",
                Cidade="Pontevedra",
                Lugar="San Francisco",
                Características="Concerto sacro.",
                Mostrar_Web="FALSE",
                Destacado_Web="FALSE",
                Estado="Realizado",
                NumeroConcerto="1",
                OrdeHistorica="1",
            ),
            normalized(
                Id="1",
                Data="15/05/2026",
                Nome="Rúas do Vento Ceibe",
                Cidade="Lugo",
                Lugar="Fuxan os Ventos",
                Mostrar_Web="TRUE",
                Destacado_Web="FALSE",
                Estado="Realizado",
                NumeroConcerto="2",
                OrdeHistorica="2",
            ),
        ]
        programs = [
            normalized(Id_Conciertos="1", Id_Obras="obra-1", Orde="1")
        ]
        repertoire = [
            normalized(Id="obra-1", NomeObra="Obra de proba", Compositor="Autora")
        ]

        built = MODULE.build_concerts(concerts, programs, repertoire)
        public = MODULE.index_payload(built, public_only=True)
        private = MODULE.index_payload(built, public_only=False)
        history = MODULE.history_payload(built)

        self.assertEqual(public["total"], 1)
        self.assertEqual(public["concertos"][0]["id"], "1")
        self.assertEqual(public["concertos"][0]["programa"][0]["obra"], "Obra de proba")
        self.assertEqual(private["total"], 2)
        self.assertEqual(private["totalHistorico"], 2)
        self.assertEqual(private["ordeHistoricaMax"], 2)
        self.assertEqual(history["total"], 2)
        self.assertEqual(history["totalAnos"], 2)
        self.assertEqual(history["concertos"][0]["ano"], "1925")
        self.assertEqual(
            set(history["concertos"][0]),
            {
                "id",
                "numeroConcerto",
                "ordeHistorica",
                "data",
                "dataTextoHistorica",
                "ano",
                "nome",
                "cidade",
                "lugar",
                "descricion",
            },
        )
        self.assertNotIn("programa", history["concertos"][0])
        self.assertNotIn("mostrarWeb", history["concertos"][0])

    def test_rejects_non_consecutive_historical_order(self):
        concerts = [
            normalized(
                Id="hist-0001",
                Data="09/04/1925",
                Nome="Concerto nº 1",
                Mostrar_Web="FALSE",
                Estado="Realizado",
                NumeroConcerto="1",
                OrdeHistorica="2",
            ),
            normalized(
                Id="1",
                Data="15/05/2026",
                Nome="Concerto público",
                Mostrar_Web="TRUE",
                Estado="Realizado",
            ),
        ]
        with self.assertRaisesRegex(RuntimeError, "OrdeHistorica"):
            MODULE.build_concerts(concerts, [], [])


if __name__ == "__main__":
    unittest.main()
