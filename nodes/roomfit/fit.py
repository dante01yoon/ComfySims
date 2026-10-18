import copy

import torch
from comfy_api.latest import Types

DISTORTION_FLAG_THRESHOLD = 1.15
SIZE_DECIMALS_CM = 4


def fit_scale(size_cm, dimensions, mode):
    exact = {"x": dimensions["width"] / size_cm[0], "y": dimensions["height"] / size_cm[1], "z": dimensions["depth"] / size_cm[2]}
    if mode == "exact":
        return exact
    factor = min(exact.values())
    return {"x": factor, "y": factor, "z": factor}


def fit_report(mode, scale):
    distortion = max(scale.values()) / min(scale.values())
    return {"mode": mode, "scale": scale, "distortion": distortion, "flagged": distortion > DISTORTION_FLAG_THRESHOLD}


def item_vertex_count(mesh, index):
    return int(mesh.vertex_counts[index]) if mesh.vertex_counts is not None else mesh.vertices.shape[1]


def fit_item(points, dimensions, mode):
    if points.shape[0] == 0:
        return None
    low = points.min(dim=0).values.double()
    high = points.max(dim=0).values.double()
    size_cm = [round(((high[axis] - low[axis]) * 100).item(), SIZE_DECIMALS_CM) for axis in range(3)]
    if not all(size > 0 for size in size_cm):
        return None
    scale = fit_scale(size_cm, dimensions, mode)
    factors = torch.tensor([scale["x"], scale["y"], scale["z"]], dtype=torch.float64)
    pivot = torch.stack([(low[0] + high[0]) / 2, low[1], (low[2] + high[2]) / 2])
    return ((points.double() - pivot) * factors).to(points.dtype), fit_report(mode, scale)


def fit_mesh(mesh: Types.MESH, dimensions, mode):
    """Scales each batch item to the listed size (cm) with its pivot at bottom center; never mutates the input."""
    vertices = mesh.vertices.clone()
    reports = []
    for index in range(vertices.shape[0]):
        count = item_vertex_count(mesh, index)
        fitted = fit_item(vertices[index, :count], dimensions, mode)
        if fitted is None:
            return {"ok": False, "reason": "degenerate-bounds", "index": index}
        vertices[index, :count], report = fitted
        reports.append(report)
    result = copy.copy(mesh)
    result.vertices = vertices
    if any(report["distortion"] != 1.0 for report in reports):
        result.normals = None
    return {"ok": True, "mesh": result, "reports": reports}
