import React, { useState } from "react";
import { useSimulation } from "../hooks/useSimulation";

const Details = ({ useMockData = false }) => {
  const {
    selectedVehicle,
    alerts,
    timeline,
    routeSuggestions,
    addTimelineEvent,
  } = useSimulation(useMockData);

  const [targetSpeed, setTargetSpeed] = useState(10);
  const [showRouteOptimizer, setShowRouteOptimizer] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState(null);

  const handleSpeedChange = (e) => {
    const newSpeed = parseFloat(e.target.value);
    setTargetSpeed(newSpeed);
    if (selectedVehicle) {
      addTimelineEvent(
        "Speed adjusted",
        selectedVehicle.id,
        `Target speed set to ${newSpeed} m/s`,
      );
    }
  };

  const handleRouteSelect = (route) => {
    setSelectedRoute(route);
  };

  const handleAcceptRoute = (route) => {
    if (selectedVehicle) {
      addTimelineEvent(
        "Route accepted",
        selectedVehicle.id,
        `Accepted route: ${route.name}`,
      );
      setShowRouteOptimizer(false);
      setSelectedRoute(null);
    }
  };

  return (
    <article className="panel details-panel">
      <header className="panel-header">
        <h2>
          {selectedVehicle
            ? `${selectedVehicle.id} - Details`
            : "Incident Desk"}
        </h2>
        <button type="button">Export</button>
      </header>

      {selectedVehicle ? (
        <>
          {/* Vehicle Details Section */}
          <section className="details-section">
            <h3>Vehicle Status</h3>
            <div className="vehicle-details">
              <p>
                <strong>Type:</strong> {selectedVehicle.type}
              </p>
              <p>
                <strong>Zone:</strong> {selectedVehicle.zone}
              </p>
              <p>
                <strong>State:</strong>{" "}
                <span
                  className={`tag ${selectedVehicle.state.toLowerCase().replace(/\s/g, "-")}`}
                >
                  {selectedVehicle.state}
                </span>
              </p>
              <p>
                <strong>Speed:</strong> {selectedVehicle.speed || 0} /{" "}
                {selectedVehicle.maxSpeed} m/s
              </p>
              <p>
                <strong>ETA:</strong> {selectedVehicle.eta}
              </p>
            </div>
          </section>

          {/* Speed Control */}
          <section className="details-section">
            <h3>Speed Control</h3>
            <div className="speed-control">
              <input
                type="range"
                min="0"
                max={selectedVehicle.maxSpeed}
                step="0.5"
                value={targetSpeed}
                onChange={handleSpeedChange}
              />
              <span className="speed-value">{targetSpeed} m/s</span>
            </div>
          </section>

          {/* Route Optimizer */}
          <section className="details-section">
            <h3>Route Optimization</h3>
            <button
              className="btn-optimize"
              onClick={() => setShowRouteOptimizer(!showRouteOptimizer)}
            >
              {showRouteOptimizer ? "Hide Routes" : "Show Suggestions"}
            </button>

            {showRouteOptimizer && routeSuggestions.length > 0 && (
              <div className="route-suggestions">
                {routeSuggestions.map((route) => (
                  <div
                    key={route.id}
                    className={`route-card ${selectedRoute?.id === route.id ? "selected" : ""}`}
                    onClick={() => handleRouteSelect(route)}
                  >
                    <div className="route-header">
                      <strong>{route.name}</strong>
                      <span className="route-eta">{route.eta}</span>
                    </div>
                    <div className="route-info">
                      <span>{route.distance}</span>
                      <span
                        className={`congestion congestion-${Math.round(route.congestion * 3)}`}
                      >
                        {Math.round(route.congestion * 100)}% congestion
                      </span>
                    </div>
                    {selectedRoute?.id === route.id && (
                      <button
                        className="btn-accept"
                        onClick={() => handleAcceptRoute(route)}
                      >
                        Accept Route
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Timeline */}
          <section className="details-section">
            <h3>Timeline</h3>
            <ul className="timeline">
              {timeline.slice(0, 5).map((event) => (
                <li key={event.id} className="timeline-item">
                  <small>{event.timestamp.toLocaleTimeString()}</small>
                  <div>{event.event}</div>
                  {event.details && (
                    <small style={{ color: "#888" }}>{event.details}</small>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <>
          {/* Default Alerts Section */}
          <section className="details-section">
            <h3>Live Alerts</h3>
            <ul>
              {alerts.length > 0 ? (
                alerts
                  .slice(0, 5)
                  .map((alert) => <li key={alert.id}>{alert.message}</li>)
              ) : (
                <li style={{ color: "#888" }}>
                  No alerts. Select a vehicle to see details.
                </li>
              )}
            </ul>
          </section>

          {/* Timeline */}
          <section className="details-section">
            <h3>Recent Events</h3>
            <ul className="timeline">
              {timeline.slice(0, 5).map((event) => (
                <li key={event.id} className="timeline-item">
                  <small>{event.timestamp.toLocaleTimeString()}</small>
                  <div>{event.event}</div>
                  {event.details && (
                    <small style={{ color: "#888" }}>{event.details}</small>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </article>
  );
};

export default Details;
