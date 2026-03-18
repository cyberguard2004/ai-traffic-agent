import React from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Fixes missing marker icons in Vite/Webpack environments.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const vehicleIcon = new L.Icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: "vehicle-marker-smooth",
});

const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click: (event) => {
      if (onMapClick) {
        onMapClick({ lat: event.latlng.lat, lng: event.latlng.lng });
      }
    },
  });
  return null;
};

const OpenStreetMapView = ({
  center,
  zoom,
  tick = 0,
  markers,
  routes,
  incidents,
  disasterZones = [],
  heatmapData = [],
  className = "",
  onMapClick,
  mapClickMode = false,
  selectedVehicleLabel,
}) => {
  const getEventAging = (event) => {
    const createdAtTick = Number(event?.createdAtTick);
    const expiresAtTick = Number(event?.expiresAtTick);
    const hasFiniteExpiry = Number.isFinite(expiresAtTick);

    if (!hasFiniteExpiry) {
      return {
        hasCountdown: false,
        countdownLabel: "",
        ageRatio: 1,
      };
    }

    const totalDuration = Math.max(1, expiresAtTick - (createdAtTick || 0));
    const remainingTicks = Math.max(0, expiresAtTick - Number(tick || 0));
    const ageRatio = Math.max(0, Math.min(1, remainingTicks / totalDuration));
    const secondsLeft = Math.ceil(remainingTicks / 10);

    return {
      hasCountdown: true,
      countdownLabel: `T-${secondsLeft}s`,
      ageRatio,
    };
  };

  // Convert heatmap data to heatmap layer format (lat, lng, intensity as weight)
  const renderHeatmapLayer = () => {
    if (!heatmapData || heatmapData.length === 0) {
      return null;
    }

    // Group heatmap points by disaster zone for visual organization
    return heatmapData.map((point, index) => {
      const [lat, lng, intensity] = point;
      const radius = Math.max(5, intensity * 25);
      const opacity = Math.max(0.1, intensity * 0.8);

      return (
        <CircleMarker
          key={`heatmap-point-${index}`}
          center={[lat, lng]}
          radius={radius}
          pathOptions={{
            color: "rgba(220, 38, 38, 0.6)",
            fillColor: "rgba(239, 68, 68, 1)",
            fillOpacity: opacity,
            weight: 0,
          }}
        />
      );
    });
  };

  return (
    <div
      className={`osm-map-shell ${className} ${mapClickMode ? "map-click-armed" : ""}`.trim()}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        className="osm-map-container"
      >
        <MapClickHandler onMapClick={onMapClick} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Render heatmap layer for disaster zones */}
        {renderHeatmapLayer()}

        {routes.map((route) => (
          <Polyline
            key={route.id}
            positions={route.points}
            pathOptions={{
              color: route.color || "#0ea5e9",
              weight: route.historical ? 3 : 4,
              opacity: route.opacity ?? (route.historical ? 0.35 : 0.9),
              dashArray: route.dashArray,
            }}
          >
            <Popup>
              <strong>{route.name || `Route ${route.id}`}</strong>
              <br />
              {route.distanceMeters ? (
                <span>
                  {(route.distanceMeters / 1000).toFixed(2)} km •{" "}
                  {Math.round((route.durationSeconds || 0) / 60)} min
                </span>
              ) : (
                <span>{route.points?.length || 0} path points</span>
              )}

              {route.legs?.length > 0 && (
                <>
                  <hr style={{ margin: "8px 0" }} />
                  <div style={{ maxHeight: "160px", overflowY: "auto" }}>
                    {route.legs.slice(0, 2).map((leg) => (
                      <div key={leg.id} style={{ marginBottom: "8px" }}>
                        <div>
                          <strong>{leg.summary || "Turn-by-turn"}</strong>
                        </div>
                        {leg.steps?.slice(0, 6).map((step, index) => (
                          <div
                            key={`${leg.id}-step-${index}`}
                            style={{ fontSize: "0.8rem" }}
                          >
                            {index + 1}. {step}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Popup>
          </Polyline>
        ))}

        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            icon={vehicleIcon}
          >
            <Popup>
              <strong>{marker.label}</strong>
              <br />
              {marker.status}
              {selectedVehicleLabel &&
                marker.label?.includes(selectedVehicleLabel) && (
                  <>
                    <br />
                    <em>Selected for reroute</em>
                  </>
                )}
            </Popup>
          </Marker>
        ))}

        {incidents.map((incident) =>
          (() => {
            const aging = getEventAging(incident);
            const radiusScale = 0.78 + aging.ageRatio * 0.42;
            const fillOpacity = 0.14 + aging.ageRatio * 0.3;
            const ringWeight = 1.2 + aging.ageRatio * 1.8;

            return (
              <CircleMarker
                key={incident.id}
                center={[incident.lat, incident.lng]}
                radius={(incident.radius || 10) * radiusScale}
                pathOptions={{
                  color: incident.color || "#ef4444",
                  fillColor: incident.color || "#ef4444",
                  fillOpacity,
                  weight: ringWeight,
                }}
              >
                {aging.hasCountdown && (
                  <Tooltip
                    permanent
                    direction="top"
                    offset={[0, -12]}
                    className="event-countdown-chip incident"
                  >
                    {aging.countdownLabel}
                  </Tooltip>
                )}
                <Popup>
                  <strong>{incident.title}</strong>
                  <br />
                  {incident.detail}
                  {aging.hasCountdown && (
                    <>
                      <br />
                      <strong>Clears in:</strong>{" "}
                      {aging.countdownLabel.replace("T-", "")}
                    </>
                  )}
                </Popup>
              </CircleMarker>
            );
          })(),
        )}

        {/* Render disaster zones with warning styling */}
        {disasterZones.map((zone) =>
          (() => {
            const aging = getEventAging(zone);
            const fillOpacity = 0.08 + aging.ageRatio * 0.16;
            const ringWeight = 2 + aging.ageRatio * 2.2;
            const dash = aging.ageRatio < 0.33 ? "3 9" : "5 5";

            return (
              <CircleMarker
                key={zone.id}
                center={[zone.lat, zone.lng]}
                radius={zone.radius || 50}
                pathOptions={{
                  color: zone.color || "#dc2626",
                  fillColor: zone.color || "#dc2626",
                  fillOpacity,
                  weight: ringWeight,
                  dashArray: dash,
                }}
              >
                {aging.hasCountdown && (
                  <Tooltip
                    permanent
                    direction="top"
                    offset={[0, -18]}
                    className="event-countdown-chip disaster"
                  >
                    {aging.countdownLabel}
                  </Tooltip>
                )}
                <Popup>
                  <strong style={{ color: zone.color }}>⚠️ {zone.title}</strong>
                  <br />
                  <em>{zone.detail}</em>
                  <br />
                  <br />
                  <strong>Severity:</strong> {zone.severity}
                  <br />
                  <strong>Radius:</strong> {zone.radius}m
                  <br />
                  <strong>Status:</strong> All traffic rerouted
                  {aging.hasCountdown && (
                    <>
                      <br />
                      <strong>Expected clear:</strong>{" "}
                      {aging.countdownLabel.replace("T-", "")}
                    </>
                  )}
                </Popup>
              </CircleMarker>
            );
          })(),
        )}
      </MapContainer>
    </div>
  );
};

OpenStreetMapView.defaultProps = {
  center: [37.7749, -122.4194],
  zoom: 13,
  markers: [],
  routes: [],
  incidents: [],
};

export default OpenStreetMapView;
