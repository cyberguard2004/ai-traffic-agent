import React from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
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

const OpenStreetMapView = ({
  center,
  zoom,
  markers,
  routes,
  incidents,
  className = "",
}) => {
  return (
    <div className={`osm-map-shell ${className}`.trim()}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        className="osm-map-container"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {routes.map((route) => (
          <Polyline
            key={route.id}
            positions={route.points}
            pathOptions={{ color: route.color || "#0ea5e9", weight: 4 }}
          />
        ))}

        {markers.map((marker) => (
          <Marker key={marker.id} position={[marker.lat, marker.lng]}>
            <Popup>
              <strong>{marker.label}</strong>
              <br />
              {marker.status}
            </Popup>
          </Marker>
        ))}

        {incidents.map((incident) => (
          <CircleMarker
            key={incident.id}
            center={[incident.lat, incident.lng]}
            radius={incident.radius || 10}
            pathOptions={{
              color: incident.color || "#ef4444",
              fillColor: incident.color || "#ef4444",
              fillOpacity: 0.3,
            }}
          >
            <Popup>
              <strong>{incident.title}</strong>
              <br />
              {incident.detail}
            </Popup>
          </CircleMarker>
        ))}
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
