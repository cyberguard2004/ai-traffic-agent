# SUMO Bridge Server

FastAPI backend that connects SUMO traffic simulation to the frontend dashboard via WebSocket.

## Setup

### 1. Environment Setup

```powershell
# Navigate to server directory
cd server

# Create virtual environment
python -m venv .venv

# Activate it (PowerShell)
.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

```bash
# If you use Git Bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Set SUMO_HOME

```powershell
setx SUMO_HOME "C:\Program Files\Eclipse\Sumo"
# Restart PowerShell
```

Verify:

```powershell
echo $env:SUMO_HOME
& "$env:SUMO_HOME\bin\sumo-gui.exe" --version
```

### 3. Prepare SUMO Scenario

Create a minimal SUMO scenario in `server/sumo/scenarios/grid.sumocfg`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/sumoConfiguration.xsd">
  <input>
    <net-file value="grid.net.xml"/>
    <route-files value="routes.xml"/>
  </input>
  <time>
    <begin value="0"/>
    <end value="3600"/>
  </time>
</configuration>
```

Or use NETEDIT to create a scenario:

```powershell
& "$env:SUMO_HOME\bin\netedit.exe"
```

### 4. Run the Bridge

```powershell
# Activate venv first
.venv\Scripts\activate

# Start server
python app.py
# or
uvicorn app:app --reload --port 8000
```

Server runs at: `http://localhost:8000`

## API Endpoints

### Health Check

```
GET /health
```

### Start Simulation

```
POST /simulation/start?scenario_path=sumo/scenarios/grid.sumocfg
```

### Stop Simulation

```
POST /simulation/stop
```

### Pause/Resume

```
POST /simulation/pause
POST /simulation/resume
```

### WebSocket (Real-time updates)

```
ws://localhost:8000/ws/simulation
```

Receives snapshots like:

```json
{
  "type": "snapshot",
  "tick": 42,
  "center": [40.7128, -74.006],
  "markers": [
    {
      "id": "veh_0",
      "lat": 40.713,
      "lng": -74.005,
      "label": "U-102",
      "status": "Moving"
    }
  ],
  "routes": [
    {
      "id": "r1",
      "color": "#22c55e",
      "points": [
        [40.713, -74.005],
        [40.712, -74.008]
      ]
    }
  ],
  "incidents": [
    {
      "id": "i1",
      "lat": 40.711,
      "lng": -74.009,
      "title": "J12",
      "detail": "Queue spike",
      "radius": 12
    }
  ]
}
```

### Reroute Vehicle

```
POST /vehicle/reroute?vehicle_id=veh_0&route_id=route_1
```

### Report Incident

```
POST /simulation/incident?x=100&y=200&severity=high
```

## Frontend Integration

In `src/components/Map.jsx`:

```javascript
useEffect(() => {
  const ws = new WebSocket("ws://localhost:8000/ws/simulation");

  ws.onmessage = (event) => {
    const snapshot = JSON.parse(event.data);
    setMapData({
      center: snapshot.center,
      markers: snapshot.markers,
      routes: snapshot.routes,
      incidents: snapshot.incidents,
    });
  };

  return () => ws.close();
}, []);
```

Then start simulation:

```javascript
const startSim = async () => {
  await fetch("http://localhost:8000/simulation/start", { method: "POST" });
};
```

## Troubleshooting

**SUMO executable not found:**

- Verify `SUMO_HOME` is set
- Restart terminal after setting environment variable

**TraCI connection refused:**

- Make sure SUMO is starting properly
- Check if port 8813 is available

**Network file error:**

- Ensure .sumocfg points to valid .net.xml and .rou.xml files

**WebSocket connection fails:**

- Make sure backend is running on port 8000
- Check CORS settings if frontend on different port

## Next Steps

1. Create more sophisticated SUMO scenarios (real networks, etc.)
2. Add vehicle control commands (reroute, speed changes)
3. Implement incident detection logic
4. Add signal timing control
5. Create scenario replay/recording
