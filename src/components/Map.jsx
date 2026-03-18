import React, { useState } from "react";
import OpenStreetMapView from "./OpenStreetMapView";
import { useSimulation } from "../hooks/useSimulation";

const Map = ({ useMockData = false }) => {
  const [mapClickRerouteMode, setMapClickRerouteMode] = useState(false);
  const {
    mapData,
    connected,
    tick,
    selectedVehicle,
    rerouteVehicleToCoordinate,
    addAlert,
  } = useSimulation(useMockData, { controller: true });

  const handleMapClick = async ({ lat, lng }) => {
    if (!mapClickRerouteMode) {
      return;
    }

    if (!selectedVehicle) {
      addAlert("Select a vehicle before choosing reroute destination");
      setMapClickRerouteMode(false);
      return;
    }

    if (!useMockData) {
      addAlert("Map-click reroute is available in Demo Mode");
      setMapClickRerouteMode(false);
      return;
    }

    await rerouteVehicleToCoordinate(
      selectedVehicle.id,
      lat,
      lng,
      "Operator map-click destination",
    );

    setMapClickRerouteMode(false);
  };

  return (
    <div className="map-surface">
      <div className="map-controls">
        <button
          type="button"
          className={`map-action-btn ${mapClickRerouteMode ? "active" : ""}`}
          onClick={() => setMapClickRerouteMode((value) => !value)}
          disabled={!selectedVehicle}
          title={
            selectedVehicle
              ? "Click map to set reroute destination"
              : "Select a vehicle first"
          }
        >
          {mapClickRerouteMode
            ? "Click Destination..."
            : "Reroute By Map Click"}
        </button>
      </div>
      <OpenStreetMapView
        center={mapData.center}
        zoom={mapData.zoom}
        markers={mapData.markers}
        routes={mapData.routes}
        incidents={mapData.incidents}
        disasterZones={mapData.disasterZones}
        heatmapData={mapData.heatmapData}
        onMapClick={handleMapClick}
        mapClickMode={mapClickRerouteMode}
        selectedVehicleLabel={selectedVehicle?.id}
      />
      <div className="map-watermark">
        OpenStreetMap {connected ? "● Live" : "○ Offline"}
        {tick > 0 && <span> • Tick {tick}</span>}
      </div>
    </div>
  );
};

export default Map;
