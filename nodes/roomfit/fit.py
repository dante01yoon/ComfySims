import copy
import math

import torch
from comfy_api.latest import Types

DISTORTION_FLAG_THRESHOLD = 1.15
SIZE_DECIMALS_CM = 4
YAW_STEP_DEGREES = 0.5


def fit_scale(size_cm, dimensions, mode):
    exact = {"x": dimensions["width"] / size_cm[0], "y": dimensions["height"] / size_cm[1], "z": dimensions["depth"] / size_cm[2]}
    if mode == "exact":
        return exact
    factor = min(exact.values())
    return {"x": factor, "y": factor, "z": factor}


def distortion_of(scale):
    return max(scale.values()) / min(scale.values())


def applied_mode(size_cm, dimensions, mode):
    if mode != "auto":
        return mode
    return "exact" if distortion_of(fit_scale(size_cm, dimensions, "exact")) <= DISTORTION_FLAG_THRESHOLD else "uniform"


def fit_report(mode, scale, requested=None, yaw_degrees=0):
    distortion = distortion_of(scale)
    return {"mode": mode, "requested": requested or mode, "yawDegrees": yaw_degrees, "scale": scale, "distortion": distortion, "flagged": distortion > DISTORTION_FLAG_THRESHOLD}


def item_vertex_count(mesh, index):
    return int(mesh.vertex_counts[index]) if mesh.vertex_counts is not None else mesh.vertices.shape[1]


def turned(points, degrees):
    radians = math.radians(degrees)
    cos, sin = math.cos(radians), math.sin(radians)
    x, y, z = points[:, 0], points[:, 1], points[:, 2]
    return torch.stack([cos * x + sin * z, y, cos * z - sin * x], dim=1)


def footprint_at(points, degrees):
    flat = turned(points, degrees)
    return (flat[:, 0].max() - flat[:, 0].min()).item(), (flat[:, 2].max() - flat[:, 2].min()).item()


def smallest_footprint_yaw(points):
    def area_at(degrees):
        x, z = footprint_at(points, degrees)
        return x * z

    best, best_area = 0, area_at(0)
    for step in range(1, round(90 / YAW_STEP_DEGREES)):
        degrees = step * YAW_STEP_DEGREES
        area = area_at(degrees)
        if area < best_area * (1 - 1e-9):
            best, best_area = degrees, area
    return best


def aligned_yaw(points, dimensions):
    yaw = smallest_footprint_yaw(points)
    x, z = footprint_at(points, yaw)
    crossed = x < z if dimensions["width"] > dimensions["depth"] else dimensions["width"] < dimensions["depth"] and x > z
    return yaw + 90 if crossed else yaw


def fit_item(points, dimensions, mode, align):
    if points.shape[0] == 0:
        return None
    yaw_degrees = aligned_yaw(points.double(), dimensions) if align == "auto" else 0
    aligned = turned(points.double(), yaw_degrees)
    low = aligned.min(dim=0).values
    high = aligned.max(dim=0).values
    size_cm = [round(((high[axis] - low[axis]) * 100).item(), SIZE_DECIMALS_CM) for axis in range(3)]
    if not all(size > 0 for size in size_cm):
        return None
    applied = applied_mode(size_cm, dimensions, mode)
    scale = fit_scale(size_cm, dimensions, applied)
    factors = torch.tensor([scale["x"], scale["y"], scale["z"]], dtype=torch.float64)
    pivot = torch.stack([(low[0] + high[0]) / 2, low[1], (low[2] + high[2]) / 2])
    return ((aligned - pivot) * factors).to(points.dtype), yaw_degrees, fit_report(applied, scale, mode, yaw_degrees)


def fit_mesh(mesh: Types.MESH, dimensions, mode, align="auto"):
    """Turns each batch item to its smallest footprint and scales it to the listed size (cm) with its pivot at bottom center; never mutates the input."""
    vertices = mesh.vertices.clone()
    normals = mesh.normals.clone() if mesh.normals is not None else None
    reports = []
    for index in range(vertices.shape[0]):
        count = item_vertex_count(mesh, index)
        fitted = fit_item(vertices[index, :count], dimensions, mode, align)
        if fitted is None:
            return {"ok": False, "reason": "degenerate-bounds", "index": index}
        vertices[index, :count], yaw_degrees, report = fitted
        if normals is not None:
            normals[index, :count] = turned(normals[index, :count].double(), yaw_degrees).to(normals.dtype)
        reports.append(report)
    result = copy.copy(mesh)
    result.vertices = vertices
    result.normals = None if any(report["distortion"] != 1.0 for report in reports) else normals
    return {"ok": True, "mesh": result, "reports": reports}
