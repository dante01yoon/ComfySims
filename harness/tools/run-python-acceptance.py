import json
import os
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
COMFYUI_DIR = Path(os.environ.get("ROOMFIT_COMFYUI_DIR", Path.home() / "Desktop/github/ComfyUI"))
sys.path[:0] = [str(COMFYUI_DIR), str(REPO / "nodes"), str(REPO / "acceptance" / "python")]
os.chdir(COMFYUI_DIR)


class JsonResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.records = []

    def record(self, test, status, message=""):
        name = test.id().split(".")[-1].replace("_", " ")
        self.records.append({"fullName": name.replace("test ac ", "AC-", 1), "status": status, "failureMessages": [message] if message else []})

    def addSuccess(self, test):
        super().addSuccess(test)
        self.record(test, "passed")

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self.record(test, "failed", self._exc_info_to_string(err, test))

    def addError(self, test, err):
        super().addError(test, err)
        self.record(test, "failed", self._exc_info_to_string(err, test))


suite = unittest.defaultTestLoader.discover(str(REPO / "acceptance" / "python"), top_level_dir=str(REPO / "acceptance" / "python"))
runner = unittest.TextTestRunner(resultclass=JsonResult, verbosity=1)
result = runner.run(suite)
(REPO / ".harness").mkdir(exist_ok=True)
(REPO / ".harness" / "python.json").write_text(json.dumps(result.records, indent=2))
sys.exit(0 if result.wasSuccessful() else 1)
