# Real Data Schema and Integration

This document defines the real-time payload contract for live mode when using real (non-SUMO) data.

## Source Switching

Use these endpoints to control live data source:

- `POST /simulation/source?mode=sumo`
- `POST /simulation/source?mode=real`

Behavior:

- `mode=sumo`: WebSocket broadcasts SUMO-derived snapshots.
- `mode=real`: WebSocket broadcasts snapshots pushed via `/simulation/real-snapshot`.

## Push Real Snapshot Endpoint

- `POST /simulation/real-snapshot`
- Content-Type: `application/json`

Required top-level fields:

- `center`
- `markers`
- `routes`
- `incidents`

Optional top-level fields:

- `type` (default: `"snapshot"`)
- `tick` (auto-filled if omitted)
- `timestamp` (auto-filled ISO UTC if omitted)
- `stats` (auto-computed if omitted)

## Snapshot JSON Schema (Practical)

```json
{
  "type": "snapshot",
  "tick": 123,
  "timestamp": "2026-03-18T12:00:00Z",
  "center": [-1.286389, 36.817223],
  "markers": [
    {
      "id": "U-102",
      "lat": -1.3012,
      "lng": 36.8123,
      "label": "Unit U-102",
      "status": "En Route - 13.4 m/s",
      "speed": 13.4,
      "route": "r-102-main"
    }
  ],
  "routes": [
    {
      "id": "r-102-main",
      "color": "#22c55e",
      "points": [
        [-1.3012, 36.8123],
        [-1.296, 36.8191],
        [-1.289, 36.8278]
      ],
      "weight": 3,
      "vehicle_id": "U-102"
    }
  ],
  "incidents": [
    {
      "id": "i-77",
      "lat": -1.2899,
      "lng": 36.8207,
      "title": "Flooding",
      "detail": "Waterlogging near underpass",
      "color": "#ef4444",
      "radius": 16
    }
  ],
  "stats": {
    "active_vehicles": 18,
    "avg_speed": 11.7,
    "total_incidents": 2
  }
}
```

## Field Notes

### `center`

- Type: `[number, number]`
- Format: `[lat, lng]`

### `markers[]`

- `id`: Vehicle identifier (string)
- `lat`, `lng`: Current vehicle coordinate
- `label`: Display label. Recommended format: `"Unit <id>"`
- `status`: UI text (for popup)
- `speed`: Number in m/s
- `route`: Route id or null

### `routes[]`

- `id`: Unique route id
- `color`: Hex color string
- `points`: Array of `[lat, lng]`
- `weight`: Optional stroke width
- `vehicle_id`: Optional vehicle id owning this route

### `incidents[]`

- `id`: Unique incident id
- `lat`, `lng`: Incident coordinate
- `title`: Short title
- `detail`: Description
- `color`: Display color
- `radius`: Marker radius (map units used by frontend circle marker)

## Frontend Usage

In the dashboard:

1. Disable Demo Mode (mock data off).
2. Set `Live Source` to `Real Data`.
3. Keep pushing snapshots to `/simulation/real-snapshot` at your desired rate (recommended around 5-10 Hz).

WebSocket stream consumed by frontend:

- `ws://localhost:8000/ws/simulation`

## Example cURL

Switch to real data mode:

```bash
curl -X POST "http://localhost:8000/simulation/source?mode=real"
```

Push one real snapshot:

```bash
curl -X POST "http://localhost:8000/simulation/real-snapshot" \
  -H "Content-Type: application/json" \
  -d '{
    "center": [-1.286389, 36.817223],
    "markers": [
      {
        "id": "U-102",
        "lat": -1.3012,
        "lng": 36.8123,
        "label": "Unit U-102",
        "status": "En Route - 13.4 m/s",
        "speed": 13.4,
        "route": "r-102-main"
      }
    ],
    "routes": [
      {
        "id": "r-102-main",
        "color": "#22c55e",
        "points": [[-1.3012, 36.8123], [-1.296, 36.8191]],
        "weight": 3,
        "vehicle_id": "U-102"
      }
    ],
    "incidents": []
  }'
```
