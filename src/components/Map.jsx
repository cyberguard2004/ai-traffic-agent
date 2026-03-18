import React from "react";
import { useState, useEffect } from "react";
import OpenStreetMapView from "./OpenStreetMapView";

const Map = () => {
  const [mapData, setMapData] = useState({
    center: [40.7128, -74.006],
    zoom: 13,
    markers: [
      {
        id: "v-1",
        lat: 40.7139,
        lng: -74.0018,
        label: "Unit U-102",
        status: "Patrol unit en route",
      },
      {
        id: "v-2",
        lat: 40.7098,
        lng: -74.0132,
        label: "Unit U-087",
        status: "Rapid response on scene",
      },
    ],
    routes: [
      {
        id: "r-1",
        color: "#22c55e",
        points: [
          [40.7139, -74.0018],
          [40.7121, -74.0065],
          [40.7098, -74.0132],
        ],
      },
    ],
    incidents: [
      {
        id: "i-1",
        lat: 40.7108,
        lng: -74.0095,
        title: "Junction J12",
        detail: "Collision reported, lane 2 closed",
        color: "#ef4444",
        radius: 12,
      },
    ],
  });

  const [connected, setConnected] = useState(false);
  const [tick, setTick] = useState(0);
  const wsRef = React.useRef(null);

  useEffect(() => {
    // Connect to SUMO bridge WebSocket
    const connectWebSocket = () => {
      const ws = new WebSocket("ws://localhost:8000/ws/simulation");

      ws.onopen = () => {
        console.log("Connected to SUMO bridge");
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const snapshot = JSON.parse(event.data);
          if (snapshot.type === "snapshot") {
            // Update map with live data
            setMapData({
              center: snapshot.center,
              zoom: 15,
              markers: snapshot.markers || [],
              routes: snapshot.routes || [],
              incidents: snapshot.incidents || [],
            });
            setTick(snapshot.tick);
          }
        } catch (e) {
          console.error("Error parsing snapshot:", e);
        }
      };

      ws.onclose = () => {
        console.log("Disconnected from SUMO bridge");
        setConnected(false);
        // Attempt reconnection after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div className="map-surface">
      <OpenStreetMapView
        center={mapData.center}
        zoom={mapData.zoom}
        markers={mapData.markers}
        routes={mapData.routes}
        incidents={mapData.incidents}
      />
      <div className="map-watermark">
        OpenStreetMap {connected ? "● Live" : "○ Offline"}
        {tick > 0 && <span> • Tick {tick}</span>}
      </div>
    </div>
  );
};

export default Map;
