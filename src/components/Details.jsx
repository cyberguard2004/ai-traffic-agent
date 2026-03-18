import React from "react";

const Details = () => {
  return (
    <article className="panel details-panel">
      <header className="panel-header">
        <h2>Incident Desk</h2>
        <button type="button">Export</button>
      </header>

      <section className="details-section">
        <h3>Live Alerts</h3>
        <ul>
          <li>Queue spike detected near Junction J12.</li>
          <li>Emergency routing plan active in Sector B.</li>
          <li>Lane closure reported on Eastbound A1.</li>
        </ul>
      </section>
    </article>
  );
};

export default Details;
