import React from "react";
import Map from "../components/Map";
import Vehicles from "../components/Vehicles";
import Details from "../components/Details";

const Admin = () => {
  return (
    <div className="admin-dashboard">
      <section className="map-background-layer">
        <Map />
      </section>

      <div className="overlay-panels">
        <section className="floating-panel layout-left">
          <Vehicles />
        </section>

        <section className="floating-panel layout-right">
          <Details />
        </section>
      </div>
    </div>
  );
};

export default Admin;
