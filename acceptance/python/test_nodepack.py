import json
import os
import re
import subprocess
import time
import unittest
import urllib.request
from pathlib import Path

import torch
from comfy_api.latest import Types

from roomfit.fit import fit_mesh

REPO = Path(__file__).resolve().parents[2]
COMFYUI_DIR = Path(os.environ.get("ROOMFIT_COMFYUI_DIR", Path.home() / "Desktop/github/ComfyUI"))
SOFA = {"width": 200.0, "depth": 90.0, "height": 85.0}
CORNERS = [(x, y, z) for x in (-0.5, 0.5) for y in (-0.5, 0.5) for z in (-0.5, 0.5)]


def box_vertices(size, center):
    return torch.tensor([[c[i] * size[i] + center[i] for i in range(3)] for c in CORNERS], dtype=torch.float32)


def box_mesh(size, center, normals=False):
    vertices = box_vertices(size, center).unsqueeze(0)
    faces = torch.tensor([[[0, 1, 2], [1, 3, 2]]], dtype=torch.int64)
    return Types.MESH(vertices, faces, normals=torch.ones_like(vertices) if normals else None)


OFFSET_BOX = ([1.0, 0.425, 0.45], [0.3, 0.6, -0.2])
SQUASHED_BOX = ([1.0, 0.3, 0.45], [-0.1, 0.05, 0.4])


class AC18FitMeshParity(unittest.TestCase):
    def assert_bounds(self, vertices, low, high):
        for axis in range(3):
            self.assertAlmostEqual(vertices[:, axis].min().item(), low[axis], delta=0.001)
            self.assertAlmostEqual(vertices[:, axis].max().item(), high[axis], delta=0.001)

    def test_ac_18_exact_fit_matches_the_listed_size_with_bottom_center_pivot(self):
        outcome = fit_mesh(box_mesh(*OFFSET_BOX), SOFA, "exact")

        self.assertTrue(outcome["ok"])
        self.assert_bounds(outcome["mesh"].vertices[0], (-1.0, 0.0, -0.45), (1.0, 0.85, 0.45))
        self.assertEqual(outcome["reports"], [{"mode": "exact", "scale": {"x": 2.0, "y": 2.0, "z": 2.0}, "distortion": 1.0, "flagged": False}])

    def test_ac_18_reports_the_same_distortion_as_the_typescript_fit(self):
        exact = fit_mesh(box_mesh(*SQUASHED_BOX), SOFA, "exact")["reports"][0]
        uniform = fit_mesh(box_mesh(*SQUASHED_BOX), SOFA, "uniform")

        self.assertAlmostEqual(exact["scale"]["y"], 85 / 30, places=4)
        self.assertAlmostEqual(exact["distortion"], 85 / 60, places=4)
        self.assertTrue(exact["flagged"])
        self.assertEqual(uniform["reports"][0]["scale"], {"x": 2.0, "y": 2.0, "z": 2.0})
        self.assert_bounds(uniform["mesh"].vertices[0], (-1.0, 0.0, -0.45), (1.0, 0.6, 0.45))

    def test_ac_18_drops_normals_after_non_uniform_scale_and_keeps_them_after_uniform(self):
        self.assertIsNone(fit_mesh(box_mesh(*SQUASHED_BOX, normals=True), SOFA, "exact")["mesh"].normals)
        self.assertIsNotNone(fit_mesh(box_mesh(*SQUASHED_BOX, normals=True), SOFA, "uniform")["mesh"].normals)

    def test_ac_18_fits_each_item_of_a_padded_batch_and_leaves_padding_alone(self):
        first = box_vertices(*OFFSET_BOX)
        second = box_vertices(*SQUASHED_BOX)
        vertices = torch.zeros((2, 10, 3))
        vertices[0, :8] = first
        vertices[1, :8] = second
        faces = torch.zeros((2, 3, 3), dtype=torch.int64)
        mesh = Types.MESH(vertices, faces, vertex_counts=torch.tensor([8, 8]), face_counts=torch.tensor([3, 3]))

        outcome = fit_mesh(mesh, SOFA, "exact")

        self.assertEqual(len(outcome["reports"]), 2)
        for item in range(2):
            self.assert_bounds(outcome["mesh"].vertices[item, :8], (-1.0, 0.0, -0.45), (1.0, 0.85, 0.45))
            self.assertTrue(torch.equal(outcome["mesh"].vertices[item, 8:], torch.zeros((2, 3))))
        self.assertTrue(torch.equal(mesh.vertices[0, :8], first))

    def test_ac_18_returns_a_reason_for_a_flat_mesh(self):
        outcome = fit_mesh(box_mesh([1.0, 0.0, 0.45], [0, 0, 0]), SOFA, "exact")

        self.assertEqual(outcome, {"ok": False, "reason": "degenerate-bounds", "index": 0})


class AC19NodePackInComfyUI(unittest.TestCase):
    port = 8198
    process = None

    @classmethod
    def setUpClass(cls):
        base = REPO / ".harness" / "comfy-base"
        (base / "custom_nodes").mkdir(parents=True, exist_ok=True)
        link = base / "custom_nodes" / "roomfit"
        if not link.exists():
            link.symlink_to(REPO / "nodes" / "roomfit")
        cls.log = open(REPO / ".harness" / "comfyui.log", "w")
        cls.process = subprocess.Popen(
            [str(COMFYUI_DIR / "venv/bin/python"), "main.py", "--cpu", "--port", str(cls.port),
             "--base-directory", str(base), "--disable-auto-launch"],
            cwd=COMFYUI_DIR, stdout=cls.log, stderr=subprocess.STDOUT,
        )
        deadline = time.time() + 180
        while time.time() < deadline:
            try:
                urllib.request.urlopen(cls.url("/object_info/RoomfitFitMesh"), timeout=2)
                return
            except Exception:
                time.sleep(1)
        cls.tearDownClass()
        raise RuntimeError("ComfyUI did not start; see .harness/comfyui.log")

    @classmethod
    def tearDownClass(cls):
        if cls.process:
            cls.process.terminate()
            cls.process.wait(timeout=30)
            cls.process = None
        cls.log.close()

    @classmethod
    def url(cls, path):
        return f"http://127.0.0.1:{cls.port}{path}"

    def get(self, path):
        with urllib.request.urlopen(self.url(path), timeout=10) as response:
            return response.status, response.headers.get("Content-Type", ""), response.read().decode("utf8", "replace")

    def test_ac_19_registers_roomfit_fit_mesh_exactly_as_the_contract_says(self):
        contract = json.loads((REPO / "spec/contracts/roomfit-nodes.json").read_text())["RoomfitFitMesh"]
        _, _, body = self.get("/object_info/RoomfitFitMesh")
        live = json.loads(body)["RoomfitFitMesh"]

        self.assertEqual(live["input"]["required"], contract["input"]["required"])
        self.assertEqual(live["input_order"]["required"], contract["input_order"]["required"])
        self.assertEqual(live["output"], contract["output"])
        self.assertEqual(live["output_name"], contract["output_name"])

    def test_ac_19_serves_the_built_editor_under_roomfit(self):
        status, content_type, html = self.get("/roomfit/")
        script = re.search(r'<script[^>]+src="([^"]+)"', html)

        self.assertEqual(status, 200)
        self.assertIn("text/html", content_type)
        self.assertIn('<div id="root">', html)
        self.assertIsNotNone(script)
        self.assertTrue(script.group(1).startswith("/roomfit/"))
        self.assertEqual(self.get(script.group(1))[0], 200)


if __name__ == "__main__":
    unittest.main()
