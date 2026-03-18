import React from "react";
import { useSimulation } from "../hooks/useSimulation";

const Vehicles = ({ useMockData = false }) => {
  const { vehicles, selectedVehicleId, selectVehicle, deselectVehicle } =
    useSimulation(useMockData);

  const handleVehicleClick = (vehicleId) => {
    if (selectedVehicleId === vehicleId) {
      deselectVehicle();
    } else {
      selectVehicle(vehicleId);
    }
  };

  // Count stats by state
  const stats = {
    available: vehicles.filter(
      (v) => v.state === "Standby" || v.state === "On Patrol",
    ).length,
    busy: vehicles.filter((v) =>
      ["En Route", "On Scene", "Monitoring"].includes(v.state),
    ).length,
    reserve: Math.max(0, 6 - vehicles.length),
  };

  return (
    <article className="panel fleet-panel">
      <header className="panel-header">
        <h2>Fleet Panel</h2>
        <button type="button">Dispatch</button>
      </header>

      <div className="fleet-stats">
        <div>
          <span>Available</span>
          <strong>{stats.available}</strong>
        </div>
        <div>
          <span>Busy</span>
          <strong>{stats.busy}</strong>
        </div>
        <div>
          <span>Reserve</span>
          <strong>{stats.reserve}</strong>
        </div>
      </div>

      <ul className="fleet-list">
        {vehicles.length > 0 ? (
          vehicles.map((unit) => (
            <li
              key={unit.id}
              className={`fleet-item ${selectedVehicleId === unit.id ? "selected" : ""}`}
              onClick={() => handleVehicleClick(unit.id)}
            >
              <div className="fleet-head">
                <strong>{unit.id}</strong>
                <span>{unit.type}</span>
              </div>
              <div className="fleet-row">
                <span>{unit.zone}</span>
                <span
                  className={`tag ${unit.state
                    .toLowerCase()
                    .replace(/\s/g, "-")}`}
                >
                  {unit.state}
                </span>
                <span>ETA {unit.eta}</span>
              </div>
              {selectedVehicleId === unit.id && (
                <div className="fleet-details">
                  <p>Speed: {unit.speed || 0} m/s</p>
                  <p>Max Speed: {unit.maxSpeed} m/s</p>
                  <p>Has Route: {unit.hasRoute ? "Yes" : "No"}</p>
                </div>
              )}
            </li>
          ))
        ) : (
          <li style={{ padding: "10px", color: "#888" }}>
            No vehicles available
          </li>
        )}
      </ul>
    </article>
  );
};

export default Vehicles;
