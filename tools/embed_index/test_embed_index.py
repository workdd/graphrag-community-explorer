"""표준 라이브러리만으로 도는 테스트. 제공자를 부르지 않습니다.

    python3 -m unittest discover -s tools/embed_index
"""
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import embed_index as E


class TestCard(unittest.TestCase):
    def test_joins_title_and_description(self):
        self.assertEqual(E.card("Alpha", "Serves carts."), "Alpha: Serves carts.")

    def test_title_only_when_there_is_no_description(self):
        self.assertEqual(E.card("Alpha", ""), "Alpha")
        self.assertEqual(E.card("Alpha", "   "), "Alpha")

    def test_trims_both_sides(self):
        self.assertEqual(E.card("  Alpha ", " d "), "Alpha: d")

    def test_survives_none(self):
        self.assertEqual(E.card(None, None), "")


class TestPack(unittest.TestCase):
    def test_little_endian_float32(self):
        self.assertEqual(E.pack([1.0, -2.0]), struct.pack("<2f", 1.0, -2.0))

    def test_length_is_four_bytes_a_value(self):
        self.assertEqual(len(E.pack([0.0] * 7)), 28)

    def test_round_trips(self):
        self.assertEqual(struct.unpack("<3f", E.pack([1.5, 0.0, -0.25])), (1.5, 0.0, -0.25))


class TestBatches(unittest.TestCase):
    def test_splits_evenly(self):
        self.assertEqual(list(E.batches([1, 2, 3, 4], 2)), [[1, 2], [3, 4]])

    def test_last_batch_may_be_short(self):
        self.assertEqual(list(E.batches([1, 2, 3], 2)), [[1, 2], [3]])

    def test_empty_input_yields_nothing(self):
        self.assertEqual(list(E.batches([], 2)), [])

    def test_refuses_a_zero_size(self):
        with self.assertRaises(ValueError):
            list(E.batches([1], 0))


class TestFingerprints(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = Path(self.dir.name)

    def tearDown(self):
        self.dir.cleanup()

    def test_hashes_only_the_files_that_exist(self):
        (self.path / "entities.parquet").write_bytes(b"abc")
        out = E.fingerprints(self.path)
        self.assertEqual(list(out), ["entities.parquet"])
        self.assertTrue(out["entities.parquet"].startswith("sha256:"))

    def test_same_bytes_give_the_same_digest(self):
        (self.path / "entities.parquet").write_bytes(b"abc")
        first = E.fingerprints(self.path)["entities.parquet"]
        (self.path / "entities.parquet").write_bytes(b"abc")
        self.assertEqual(first, E.fingerprints(self.path)["entities.parquet"])

    def test_changed_bytes_change_the_digest(self):
        (self.path / "entities.parquet").write_bytes(b"abc")
        first = E.fingerprints(self.path)["entities.parquet"]
        (self.path / "entities.parquet").write_bytes(b"abd")
        self.assertNotEqual(first, E.fingerprints(self.path)["entities.parquet"])

    def test_missing_folder_gives_nothing(self):
        self.assertEqual(E.fingerprints(self.path / "nope"), {})


class TestEntityPath(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = Path(self.dir.name)

    def tearDown(self):
        self.dir.cleanup()

    def test_prefers_the_current_name(self):
        (self.path / "entities.parquet").write_bytes(b"")
        (self.path / "create_final_entities.parquet").write_bytes(b"")
        self.assertEqual(E.entity_path(self.path).name, "entities.parquet")

    def test_falls_back_to_the_older_name(self):
        (self.path / "create_final_entities.parquet").write_bytes(b"")
        self.assertEqual(E.entity_path(self.path).name, "create_final_entities.parquet")

    def test_says_so_when_there_is_none(self):
        with self.assertRaises(SystemExit):
            E.entity_path(self.path)


class TestRunKeepsTheKeyOut(unittest.TestCase):
    def test_the_log_never_carries_the_key(self):
        lines = []
        rows = [{"id": "a", "text": "Alpha"}, {"id": "b", "text": "Beta"}]
        written = {}

        def fake_embed(texts, base_url, model, api_key):
            return [[0.5, 0.25] for _ in texts]

        original_read, original_write, original_entity = E.read_entities, E.write_parquet, E.entity_path
        E.read_entities = lambda path: rows
        E.entity_path = lambda index_dir: index_dir / "entities.parquet"
        def fake_write(out, r, model, dim, files):
            written.update({"rows": r, "model": model, "dim": dim, "files": files})
            out.write_bytes(b"")          # 실제 writer 처럼 파일을 남겨야 뒤의 크기 보고가 돕니다

        E.write_parquet = fake_write
        try:
            with tempfile.TemporaryDirectory() as tmp:
                out = E.run(
                    Path(tmp), Path(tmp), "https://x.test/v1", "m", "sk-secret-value",
                    batch_size=1, embed=fake_embed, log=lines.append,
                )
        finally:
            E.read_entities, E.write_parquet, E.entity_path = original_read, original_write, original_entity

        self.assertEqual(out.name, "embeddings.parquet")
        self.assertNotIn("sk-secret-value", "\n".join(lines))
        self.assertEqual(written["dim"], 2)
        self.assertEqual(written["rows"][0]["vector"], struct.pack("<2f", 0.5, 0.25))


if __name__ == "__main__":
    unittest.main()
