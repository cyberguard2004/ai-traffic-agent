import os
import subprocess
import time
import logging
import math
from pathlib import Path

try:
    import traci
    import sumolib
except ImportError:
    raise ImportError(
        "SUMO TraCI not installed. Run: pip install traci sumolib"
    )

logger = logging.getLogger(__name__)


class SUMOBridge:
    """Bridge to SUMO simulator via TraCI."""

    NAIROBI_LAT = -1.286389
    NAIROBI_LON = 36.817223

    def __init__(self, sumocfg_path: str, gui: bool = False, port: int = 8813):
        """
        Initialize SUMO bridge.

        Args:
            sumocfg_path: Path to SUMO config file
            gui: Whether to launch SUMO-GUI or run headless
            port: TraCI port number
        """
        self.sumocfg_path = sumocfg_path
        self.gui = gui
        self.port = port
        self.running = False
        self.step_count = 0
        self.net = None
        self.incident_queue = []

        # Validate config exists
        if not os.path.exists(sumocfg_path):
            raise FileNotFoundError(f"SUMO config not found: {sumocfg_path}")

    def start(self):
        """Start SUMO and connect via TraCI."""
        if self.running:
            logger.warning("SUMO already running")
            return

        try:
            sumo_cmd = self._build_sumo_command()
            logger.info(f"Starting SUMO: {' '.join(sumo_cmd)}")

            # Start SUMO process
            subprocess.Popen(sumo_cmd)
            time.sleep(2)  # Wait for SUMO to start

            # Connect via TraCI
            traci.connect(port=self.port)
            self.running = True

            # Load network for coordinate conversion
            try:
                self.net = sumolib.net.readNet(
                    self._get_net_file(), withInternal=False
                )
            except Exception as e:
                logger.warning(
                    "Failed to load SUMO net geodata; using XY fallback around Nairobi: %s",
                    e,
                )
                self.net = None
            logger.info("SUMO connected via TraCI")

        except Exception as e:
            logger.error(f"Error starting SUMO: {e}")
            self.running = False
            raise

    def stop(self):
        """Stop SUMO and close connection."""
        if not self.running:
            return

        try:
            traci.close()
            self.running = False
            logger.info("SUMO disconnected")
        except Exception as e:
            logger.error(f"Error stopping SUMO: {e}")

    def step(self):
        """Step SUMO simulation forward."""
        if not self.running:
            raise RuntimeError("SUMO not running")

        try:
            traci.simulationStep()
            self.step_count += 1
        except Exception as e:
            logger.error(f"Error stepping SUMO: {e}")
            self.running = False
            raise

    def get_vehicles(self):
        """Get current vehicle state."""
        try:
            vehicles = []
            for veh_id in traci.vehicle.getIDList():
                pos = traci.vehicle.getPosition(veh_id)
                speed = traci.vehicle.getSpeed(veh_id)
                route = traci.vehicle.getRouteID(veh_id)
                state = traci.vehicle.getSpeed(veh_id)
                lon, lat = self._xy_to_lon_lat(pos[0], pos[1])

                vehicles.append(
                    {
                        "id": veh_id,
                        "x": pos[0],
                        "y": pos[1],
                        "lon": lon,
                        "lat": lat,
                        "speed": speed,
                        "route": route,
                        "state": "moving" if speed > 0.1 else "waiting",
                    }
                )

            return vehicles
        except Exception as e:
            logger.error(f"Error getting vehicles: {e}")
            return []

    def get_active_routes(self):
        """Get routes of all active vehicles."""
        try:
            routes = []
            for veh_id in traci.vehicle.getIDList():
                route_edges = traci.vehicle.getRoute(veh_id)
                if len(route_edges) > 1:
                    points = []
                    for edge_id in route_edges:
                        try:
                            edge = self.net.getEdge(edge_id)
                            shape = edge.getShape()
                            for x, y in shape:
                                lon, lat = self._xy_to_lon_lat(x, y)
                                points.append([lat, lon])
                        except:
                            pass

                    if points:
                        routes.append(
                            {
                                "id": f"route_{veh_id}",
                                "vehicle_id": veh_id,
                                "points": points,
                                "color": self._get_route_color(veh_id),
                            }
                        )

            return routes
        except Exception as e:
            logger.error(f"Error getting routes: {e}")
            return []

    def detect_incidents(self):
        """Detect traffic incidents (congestion, stopped vehicles, etc.)."""
        try:
            incidents = []

            # Check for congestion
            for junction_id in traci.junction.getIDList()[:10]:  # Sample junctions
                incoming_lanes = traci.junction.getIncomingEdges(junction_id)
                for edge_id in incoming_lanes[:2]:  # Sample edges
                    try:
                        queue_len = traci.edge.getLastStepLength(edge_id)
                        avg_speed = traci.edge.getLastStepMeanSpeed(edge_id)

                        if queue_len > 50 or avg_speed < 2:
                            # Get junction position
                            junction = self.net.getNode(junction_id)
                            x, y = junction.getCoord()
                            lon, lat = self._xy_to_lon_lat(x, y)

                            incidents.append(
                                {
                                    "id": f"incident_{junction_id}",
                                    "type": "congestion" if queue_len > 50 else "slow",
                                    "x": x,
                                    "y": y,
                                    "lon": lon,
                                    "lat": lat,
                                    "title": f"Junction {junction_id}",
                                    "detail": f"Queue: {int(queue_len)}m, Speed: {avg_speed:.1f} m/s",
                                    "severity": "high"
                                    if queue_len > 100
                                    else "medium",
                                }
                            )
                    except:
                        pass

            # Add queued incidents
            incidents.extend(self.incident_queue)
            self.incident_queue = []

            return incidents
        except Exception as e:
            logger.error(f"Error detecting incidents: {e}")
            return []

    def get_bounds_center(self):
        """Get the center of the simulation network."""
        try:
            if self.net:
                bounds = self.net.getBoundary()
                center_x = (bounds[0] + bounds[2]) / 2
                center_y = (bounds[1] + bounds[3]) / 2
                lon, lat = self._xy_to_lon_lat(center_x, center_y)
                return {"lat": lat, "lon": lon, "x": center_x, "y": center_y}
        except Exception as e:
            logger.error(f"Error getting bounds: {e}")

        # Fallback Nairobi center
        return {"lat": self.NAIROBI_LAT, "lon": self.NAIROBI_LON, "x": 0, "y": 0}

    def _xy_to_lon_lat(self, x: float, y: float):
        """Convert SUMO XY coordinates to lon/lat with robust fallback.

        Some generated SUMO networks do not include full georeferencing metadata
        (for example missing origBoundary), which makes convertXY2LonLat fail.
        In that case, project the local XY plane around Nairobi.
        """
        if self.net:
            try:
                lon, lat = self.net.convertXY2LonLat(x, y)
                return lon, lat
            except Exception:
                pass

        meters_per_deg_lat = 111320.0
        meters_per_deg_lon = 111320.0 * max(
            0.2, abs(math.cos(math.radians(self.NAIROBI_LAT)))
        )
        lat = self.NAIROBI_LAT + (y / meters_per_deg_lat)
        lon = self.NAIROBI_LON + (x / meters_per_deg_lon)
        return lon, lat

    def reroute_vehicle(self, vehicle_id: str, route_id: str = None):
        """Reroute a vehicle."""
        try:
            if route_id:
                traci.vehicle.setRoute(vehicle_id, [route_id])
            else:
                # Use SUMO's rerouting
                traci.vehicle.changeTarget(vehicle_id, "random")
            logger.info(f"Rerouted vehicle {vehicle_id}")
        except Exception as e:
            logger.error(f"Error rerouting: {e}")

    def report_incident(self, x: float, y: float, severity: str = "high"):
        """Queue an incident for reporting (for simulation testing)."""
        self.incident_queue.append(
            {
                "id": f"incident_{len(self.incident_queue)}",
                "type": "reported",
                "x": x,
                "y": y,
                "title": "Reported Incident",
                "detail": f"Severity: {severity}",
                "severity": severity,
            }
        )

    def _build_sumo_command(self):
        """Build SUMO startup command."""
        sumo_bin = "sumo-gui" if self.gui else "sumo"
        candidate_homes = []

        # Respect explicit SUMO_HOME first.
        env_home = os.environ.get("SUMO_HOME")
        if env_home:
            candidate_homes.append(env_home)

        # Common Windows install locations.
        candidate_homes.extend(
            [
                "C:\\Program Files\\Eclipse\\Sumo",
                "C:\\Program Files (x86)\\Eclipse\\Sumo",
                "C:\\Program Files\\SUMO",
                "C:\\Program Files (x86)\\SUMO",
                "C:\\sumo",
            ]
        )

        sumo_exe = None
        for home in candidate_homes:
            candidate_exe = os.path.join(home, "bin", f"{sumo_bin}.exe")
            if os.path.exists(candidate_exe):
                sumo_exe = candidate_exe
                break

        if not sumo_exe:
            raise FileNotFoundError(
                "SUMO executable not found. "
                "Set SUMO_HOME to your SUMO install root, e.g. "
                "C:\\Program Files (x86)\\Eclipse\\Sumo."
            )

        return [
            sumo_exe,
            "-c",
            self.sumocfg_path,
            "--remote-port",
            str(self.port),
            "--step-length",
            "0.1",
            "--start",
        ]

    def _get_net_file(self):
        """Extract network file path from SUMO config."""
        import xml.etree.ElementTree as ET

        tree = ET.parse(self.sumocfg_path)
        root = tree.getroot()

        # Find the net-file element
        for elem in root.iter():
            if elem.tag == "net-file":
                net_file = elem.get("value")
                # Resolve relative paths
                if not os.path.isabs(net_file):
                    base_dir = os.path.dirname(self.sumocfg_path)
                    net_file = os.path.join(base_dir, net_file)
                return net_file

        raise ValueError("Could not find net-file in SUMO config")

    def _get_route_color(self, vehicle_id: str):
        """Get a consistent color for a vehicle route."""
        colors = [
            "#22c55e",  # green
            "#3b82f6",  # blue
            "#f59e0b",  # amber
            "#ef4444",  # red
            "#8b5cf6",  # purple
        ]
        return colors[hash(vehicle_id) % len(colors)]
