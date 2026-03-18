import asyncio
import json
import logging
from fastapi import FastAPI, WebSocket, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import sys
from datetime import datetime

from sumo_bridge import SUMOBridge
from data_converter import SimulationSnapshotConverter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global simulation control
sumo_bridge = None
simulation_active = False
connected_clients = set()
simulation_task = None
data_source_mode = "sumo"  # "sumo" | "real"
latest_real_snapshot = None
real_tick_count = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context manager for startup/shutdown."""
    logger.info("Application starting...")
    yield
    logger.info("Application shutting down...")
    # Stop SUMO if still running
    if sumo_bridge:
        try:
            sumo_bridge.stop()
        except Exception as e:
            logger.error(f"Error stopping SUMO bridge: {e}")


app = FastAPI(title="SUMO Traffic Bridge", lifespan=lifespan)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "sumo_active": simulation_active,
        "connected_clients": len(connected_clients),
        "data_source": data_source_mode,
        "has_real_snapshot": latest_real_snapshot is not None,
    }


def ensure_snapshot_defaults(snapshot: dict, tick: int) -> dict:
    """Normalize an incoming snapshot so frontend can always parse it."""
    normalized = {
        "type": snapshot.get("type", "snapshot"),
        "tick": snapshot.get("tick", tick),
        "timestamp": snapshot.get(
            "timestamp", datetime.utcnow().isoformat() + "Z"
        ),
        "center": snapshot.get("center", [-1.286389, 36.817223]),
        "markers": snapshot.get("markers", []),
        "routes": snapshot.get("routes", []),
        "incidents": snapshot.get("incidents", []),
        "stats": snapshot.get(
            "stats",
            {
                "active_vehicles": len(snapshot.get("markers", [])),
                "avg_speed": 0,
                "total_incidents": len(snapshot.get("incidents", [])),
            },
        ),
    }
    return normalized


def ensure_broadcast_loop_running():
    """Start the broadcast loop if it is not already active."""
    global simulation_task, simulation_active
    if simulation_task and not simulation_task.done():
        return

    simulation_active = True
    simulation_task = asyncio.create_task(simulation_loop())


@app.post("/simulation/source")
async def set_simulation_source(mode: str):
    """Switch live mode source between SUMO and externally pushed real data."""
    global data_source_mode
    mode = (mode or "").strip().lower()
    if mode not in {"sumo", "real"}:
        raise HTTPException(status_code=400, detail="mode must be 'sumo' or 'real'")

    data_source_mode = mode

    if mode == "real":
        ensure_broadcast_loop_running()

    return {
        "status": "source_updated",
        "data_source": data_source_mode,
        "simulation_active": simulation_active,
    }


@app.post("/simulation/real-snapshot")
async def push_real_snapshot(snapshot: dict = Body(...)):
    """Push a real-time snapshot payload to be broadcast in real-data mode."""
    global latest_real_snapshot, real_tick_count

    required_fields = ["center", "markers", "routes", "incidents"]
    missing = [field for field in required_fields if field not in snapshot]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {', '.join(missing)}",
        )

    real_tick_count += 1
    latest_real_snapshot = ensure_snapshot_defaults(snapshot, real_tick_count)

    if data_source_mode == "real":
        ensure_broadcast_loop_running()

    return {
        "status": "snapshot_received",
        "tick": latest_real_snapshot["tick"],
        "data_source": data_source_mode,
    }


@app.post("/simulation/start")
async def start_simulation(scenario_path: str = None):
    """Start the SUMO simulation."""
    global sumo_bridge, simulation_active, simulation_task

    if simulation_active:
        raise HTTPException(status_code=400, detail="Simulation already running")

    try:
        # Use default scenario if path not specified
        if not scenario_path:
            scenario_path = os.path.join(
                os.path.dirname(__file__), "sumo", "scenarios", "grid.sumocfg"
            )

        logger.info(f"Starting SUMO with scenario: {scenario_path}")
        sumo_bridge = SUMOBridge(scenario_path)
        sumo_bridge.start()
        simulation_active = True

        # Start the simulation loop as a background task
        if simulation_task:
            simulation_task.cancel()
        simulation_task = asyncio.create_task(simulation_loop())

        return {"status": "started", "scenario": scenario_path}
    except Exception as e:
        logger.error(f"Error starting simulation: {e}")
        simulation_active = False
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/simulation/stop")
async def stop_simulation():
    """Stop the SUMO simulation."""
    global sumo_bridge, simulation_active, simulation_task

    if not simulation_active:
        raise HTTPException(status_code=400, detail="Simulation not running")

    try:
        if simulation_task:
            simulation_task.cancel()
        if sumo_bridge:
            sumo_bridge.stop()
        simulation_active = False
        logger.info("Simulation stopped")
        return {"status": "stopped"}
    except Exception as e:
        logger.error(f"Error stopping simulation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/simulation/pause")
async def pause_simulation():
    """Pause the simulation (stops sending updates but keeps SUMO running)."""
    global simulation_active
    simulation_active = False
    return {"status": "paused"}


@app.post("/simulation/resume")
async def resume_simulation():
    """Resume the simulation."""
    global simulation_active
    if not sumo_bridge:
        raise HTTPException(status_code=400, detail="Simulation not initialized")
    simulation_active = True
    return {"status": "resumed"}


@app.post("/vehicle/reroute")
async def reroute_vehicle(vehicle_id: str, route_id: str = None):
    """Reroute a vehicle to a different route."""
    if not sumo_bridge:
        raise HTTPException(status_code=400, detail="Simulation not running")

    try:
        sumo_bridge.reroute_vehicle(vehicle_id, route_id)
        return {"status": "rerouted", "vehicle": vehicle_id, "route": route_id}
    except Exception as e:
        logger.error(f"Error rerouting vehicle: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/simulation/incident")
async def report_incident(x: float, y: float, severity: str = "high"):
    """Report an incident at a location (for testing)."""
    if not sumo_bridge:
        raise HTTPException(status_code=400, detail="Simulation not running")

    try:
        # Could trigger traffic light changes, route updates, etc.
        logger.info(f"Incident reported at ({x}, {y}) with severity {severity}")
        return {
            "status": "incident_reported",
            "location": {"x": x, "y": y},
            "severity": severity,
        }
    except Exception as e:
        logger.error(f"Error reporting incident: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def simulation_loop():
    """Main simulation loop that broadcasts updates to all connected clients."""
    global simulation_active, sumo_bridge, connected_clients, data_source_mode, latest_real_snapshot

    converter = SimulationSnapshotConverter()
    tick_count = 0
    max_steps = 10000  # Prevent infinite loops

    try:
        while simulation_active and tick_count < max_steps:
            try:
                if data_source_mode == "real":
                    tick_count += 1
                    snapshot = ensure_snapshot_defaults(
                        latest_real_snapshot or {},
                        tick_count,
                    )

                    if connected_clients:
                        message = json.dumps(snapshot)
                        disconnected = set()
                        for client in connected_clients:
                            try:
                                await client.send_text(message)
                            except Exception as e:
                                logger.warning(f"Error sending to client: {e}")
                                disconnected.add(client)

                        connected_clients.difference_update(disconnected)

                    await asyncio.sleep(0.1)
                    continue

                if not sumo_bridge:
                    await asyncio.sleep(0.1)
                    continue

                # Step SUMO forward
                sumo_bridge.step()
                tick_count += 1

                # Collect simulation state
                vehicles = sumo_bridge.get_vehicles()
                incidents = sumo_bridge.detect_incidents()
                routes = sumo_bridge.get_active_routes()
                center = sumo_bridge.get_bounds_center()

                # Convert to map format
                snapshot = converter.to_snapshot(
                    vehicles=vehicles,
                    incidents=incidents,
                    routes=routes,
                    center=center,
                    tick=tick_count,
                )

                # Broadcast to all connected clients
                if connected_clients:
                    message = json.dumps(snapshot)
                    disconnected = set()
                    for client in connected_clients:
                        try:
                            await client.send_text(message)
                        except Exception as e:
                            logger.warning(f"Error sending to client: {e}")
                            disconnected.add(client)

                    # Clean up disconnected clients
                    connected_clients.difference_update(disconnected)

                # Tick rate: ~10 Hz (0.1s per step)
                await asyncio.sleep(0.1)

            except Exception as e:
                logger.error(f"Error in simulation loop: {e}")
                await asyncio.sleep(0.1)

    except asyncio.CancelledError:
        logger.info("Simulation loop cancelled")
    except Exception as e:
        logger.error(f"Fatal simulation loop error: {e}")
    finally:
        simulation_active = False
        logger.info(f"Simulation loop ended after {tick_count} ticks")


@app.websocket("/ws/simulation")
async def websocket_simulation(websocket: WebSocket):
    """WebSocket endpoint for real-time simulation updates."""
    await websocket.accept()
    connected_clients.add(websocket)
    logger.info(f"Client connected. Total clients: {len(connected_clients)}")

    try:
        # Keep connection open
        while True:
            # Read any incoming commands from client
            data = await websocket.receive_text()
            try:
                command = json.loads(data)
                logger.info(f"Received command: {command}")
                # Could handle client commands here (e.g., reroute, incident)
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON received: {data}")

    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        connected_clients.discard(websocket)
        logger.info(f"Client disconnected. Total clients: {len(connected_clients)}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
