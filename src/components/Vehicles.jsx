import React from "react";

const Vehicles = () => {
  const units = [
    {
      id: "U-102",
      type: "Patrol",
      zone: "Downtown",
      state: "En Route",
      eta: "3m",
    },
    {
      id: "U-087",
      type: "Rapid",
      zone: "North Ring",
      state: "On Scene",
      eta: "Now",
    },
    {
      id: "U-141",
      type: "Support",
      zone: "Harbor",
      state: "Standby",
      eta: "8m",
    },
    {
      id: "U-119",
      type: "Tow",
      zone: "East Link",
      state: "Monitoring",
      eta: "5m",
    },
  ];

  return (
    <article className="panel fleet-panel">
      <header className="panel-header">
        <h2>Fleet Panel</h2>
        <button type="button">Dispatch</button>
      </header>

      <div className="fleet-stats">
        <div>
          <span>Available</span>
          <strong>14</strong>
        </div>
        <div>
          <span>Busy</span>
          <strong>22</strong>
        </div>
        <div>
          <span>Reserve</span>
          <strong>6</strong>
        </div>
      </div>

      <ul className="fleet-list">
        {units.map((unit) => (
          <li key={unit.id} className="fleet-item">
            <div className="fleet-head">
              <strong>{unit.id}</strong>
              <span>{unit.type}</span>
            </div>
            <div className="fleet-row">
              <span>{unit.zone}</span>
              <span
                className={`tag ${unit.state.toLowerCase().replace(/\s/g, "-")}`}
              >
                {unit.state}
              </span>
              <span>ETA {unit.eta}</span>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
};

export default Vehicles;
