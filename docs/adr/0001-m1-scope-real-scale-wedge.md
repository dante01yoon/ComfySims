# ADR-0001: M1 is real-scale furniture plus a render loop, local only

Date: 2026-10-18

## Status

Accepted

## Context

The first idea had everything: product links, floor plan to 3D, room photos, a hosted website, a local app, a node pack, and a multi-agent demo. Generic image-to-3D demos are already everywhere. What is not common: a model that is exactly the listed size, and using a 3D layout to control a ComfyUI image render.

## Decision

- The wedge is **real scale**: product photo + listed W×D×H → GLB that measures exactly that.
- M1 closes the loop **2D → 3D → 2D**: fitted GLB → box room → depth/normal/mask passes → ComfyUI render.
- Distribution is **one node pack** that also serves the editor from the ComfyUI server (same origin, no CORS, one install).
- Workflow JSON is the contract between the editor and ComfyUI, so local ComfyUI and Comfy Cloud are the same API.

## Rejected for M1

- Hosted website: GPU cost, auth, storage, abuse and support make it a business, not a side project. Revisit only after the M1 success signal.
- Floor plan / room photo to 3D: M2. Box room only in M1.
- Scraping retail pages: terms of service and anti-bot. Image upload + typed dimensions instead.

## Success signal

Registry release, one demo video, and an install/star target agreed before launch. Missing it means stop or change direction, not "a bit more".
