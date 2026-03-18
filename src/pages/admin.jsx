import React, { useEffect, useState } from "react";
import Map from "../components/Map";
import Vehicles from "../components/Vehicles";
import Details from "../components/Details";

const Admin = () => {
  // Toggle between mock data and live backend (default to demo mode)
  const [useMockData, setUseMockData] = useState(true);
  const [liveSource, setLiveSource] = useState("sumo");
  const [sourceStatus, setSourceStatus] = useState("Idle");
  const backendBaseUrl = (
    import.meta.env.VITE_BACKEND_URL || "http://localhost:8000"
  ).replace(/\/$/, "");

  useEffect(() => {
    if (useMockData) {
      return;
    }

    let cancelled = false;

    const syncLiveSource = async () => {
      try {
        setSourceStatus("Switching...");
        const response = await fetch(
          `${backendBaseUrl}/simulation/source?mode=${liveSource}`,
          { method: "POST" },
        );

        if (!response.ok) {
          throw new Error(`Failed to switch source (${response.status})`);
        }

        if (!cancelled) {
          setSourceStatus(
            liveSource === "real"
              ? "Live source: Real Data"
              : "Live source: SUMO",
          );
        }
      } catch {
        if (!cancelled) {
          setSourceStatus(
            "Source switch failed (check backend URL/connectivity)",
          );
        }
      }
    };

    syncLiveSource();

    return () => {
      cancelled = true;
    };
  }, [useMockData, liveSource, backendBaseUrl]);

  return (
    <div className="admin-dashboard">
      <section className="map-background-layer">
        <Map useMockData={useMockData} />
      </section>

      <div className="overlay-panels">
        <section className="floating-panel layout-left">
          <Vehicles useMockData={useMockData} />
        </section>

        <section className="floating-panel layout-right">
          <Details useMockData={useMockData} />

          {/* Demo Mode Toggle */}
          <div
            className="demo-toggle"
            style={{
              marginTop: "12px",
              padding: "8px",
              border: "1px solid rgba(81, 144, 188, 0.5)",
              borderRadius: "6px",
              fontSize: "0.8rem",
              textAlign: "center",
            }}
          >
            <label style={{ cursor: "pointer", color: "#b7d5eb" }}>
              <input
                type="checkbox"
                checked={useMockData}
                onChange={(e) => setUseMockData(e.target.checked)}
                style={{ marginRight: "6px" }}
              />
              {useMockData ? "Demo Mode (Mock Data)" : "Live Mode (SUMO)"}
            </label>

            {!useMockData && (
              <div style={{ marginTop: "10px", textAlign: "left" }}>
                <label style={{ color: "#b7d5eb", fontSize: "0.78rem" }}>
                  Live Source:
                </label>
                <select
                  value={liveSource}
                  onChange={(e) => setLiveSource(e.target.value)}
                  style={{
                    marginLeft: "8px",
                    background: "#12283a",
                    color: "#d8ecfb",
                    border: "1px solid rgba(81, 144, 188, 0.5)",
                    borderRadius: "4px",
                    padding: "2px 6px",
                  }}
                >
                  <option value="sumo">SUMO</option>
                  <option value="real">Real Data</option>
                </select>
                <div style={{ marginTop: "6px", color: "#8fb7d3" }}>
                  {sourceStatus}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Admin;
