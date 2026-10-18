import json
from pathlib import Path

from aiohttp import web
from server import PromptServer

from .fit import fit_mesh

EDITOR_DIR = (Path(__file__).parent / "editor").resolve()
SIZE_CM = ("FLOAT", {"default": 100.0, "min": 1.0, "max": 2000.0, "step": 0.5})


class RoomfitFitMesh:
    CATEGORY = "roomfit"
    FUNCTION = "fit"
    RETURN_TYPES = ("MESH", "STRING")
    RETURN_NAMES = ("mesh", "fit_report")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mesh": ("MESH", {}),
                "width_cm": SIZE_CM,
                "depth_cm": SIZE_CM,
                "height_cm": SIZE_CM,
                "mode": (["auto", "exact", "uniform"], {}),
            }
        }

    def fit(self, mesh, width_cm, depth_cm, height_cm, mode):
        outcome = fit_mesh(mesh, {"width": width_cm, "depth": depth_cm, "height": height_cm}, mode)
        if not outcome["ok"]:
            raise ValueError(outcome["reason"])
        return (outcome["mesh"], json.dumps(outcome["reports"]))


async def serve_editor(request):
    target = (EDITOR_DIR / (request.match_info["path"] or "index.html")).resolve()
    if not target.is_relative_to(EDITOR_DIR) or not target.is_file():
        raise web.HTTPNotFound()
    return web.FileResponse(target)


if getattr(PromptServer, "instance", None) is not None:
    PromptServer.instance.routes.get("/roomfit/{path:.*}")(serve_editor)

NODE_CLASS_MAPPINGS = {"RoomfitFitMesh": RoomfitFitMesh}
NODE_DISPLAY_NAME_MAPPINGS = {"RoomfitFitMesh": "Roomfit Fit Mesh (cm)"}
