"""Convert SUMO simulation data to map component format."""

import logging

logger = logging.getLogger(__name__)


class SimulationSnapshotConverter:
    """Convert SUMO state to frontend-compatible snapshot format."""

    def to_snapshot(self, vehicles, incidents, routes, center, tick):
        """
        Convert SUMO data to map component props format.

        Returns:
            dict: Snapshot compatible with OpenStreetMapView component
        """
        return {
            "type": "snapshot",
            "tick": tick,
            "timestamp": self._get_iso_timestamp(),
            "center": [center["lat"], center["lon"]],
            "markers": self._vehicles_to_markers(vehicles),
            "routes": self._routes_to_polylines(routes),
            "incidents": self._incidents_to_circles(incidents),
            "stats": {
                "active_vehicles": len(vehicles),
                "avg_speed": self._calculate_avg_speed(vehicles),
                "total_incidents": len(incidents),
            },
        }

    def _vehicles_to_markers(self, vehicles):
        """Convert vehicle list to map markers."""
        markers = []
        for v in vehicles:
            markers.append(
                {
                    "id": v["id"],
                    "lat": v["lat"],
                    "lng": v["lon"],
                    "label": v["id"],
                    "status": f"{v['state'].title()} - {v['speed']:.1f} m/s",
                    "speed": v["speed"],
                    "route": v["route"],
                }
            )
        return markers

    def _routes_to_polylines(self, routes):
        """Convert routes to polylines."""
        polylines = []
        for r in routes:
            if len(r["points"]) > 1:
                polylines.append(
                    {
                        "id": r["id"],
                        "color": r["color"],
                        "points": r["points"],
                        "weight": 3,
                        "vehicle_id": r.get("vehicle_id"),
                    }
                )
        return polylines

    def _incidents_to_circles(self, incidents):
        """Convert incidents to circle markers."""
        circles = []
        for incident in incidents:
            circles.append(
                {
                    "id": incident["id"],
                    "lat": incident["lat"],
                    "lng": incident["lon"],
                    "title": incident["title"],
                    "detail": incident["detail"],
                    "color": self._severity_to_color(incident.get("severity", "low")),
                    "radius": self._severity_to_radius(incident.get("severity", "low")),
                }
            )
        return circles

    def _calculate_avg_speed(self, vehicles):
        """Calculate average speed of all vehicles."""
        if not vehicles:
            return 0
        total_speed = sum(v["speed"] for v in vehicles)
        return total_speed / len(vehicles)

    def _severity_to_color(self, severity):
        """Map severity to color."""
        colors = {
            "low": "#22c55e",  # green
            "medium": "#f59e0b",  # amber
            "high": "#ef4444",  # red
            "critical": "#b91c1c",  # dark red
        }
        return colors.get(severity, "#888888")

    def _severity_to_radius(self, severity):
        """Map severity to circle radius."""
        radii = {
            "low": 8,
            "medium": 12,
            "high": 16,
            "critical": 20,
        }
        return radii.get(severity, 10)

    def _get_iso_timestamp(self):
        """Get current ISO timestamp."""
        from datetime import datetime

        return datetime.utcnow().isoformat() + "Z"
