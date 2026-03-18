import { useContext, useEffect, useRef, useCallback } from "react";
import { SimulationContext } from "../context/SimulationContext";
import {
  mockVehicles,
  mockMapData,
  mockAlerts,
  mockTimeline,
} from "../data/mockSimulation";

export const useSimulation = (useMockData = false, options = {}) => {
  const { controller = false } = options;
  const { state, dispatch } = useContext(SimulationContext);
  const backendBaseUrl = (
    import.meta.env.VITE_BACKEND_URL || "http://localhost:8000"
  ).replace(/\/$/, "");
  const backendWsUrl = backendBaseUrl.replace(/^http/, "ws");
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const tickIntervalRef = useRef(null);
  const mockDataTickRef = useRef(0);
  const mockRoutesRef = useRef(mockMapData.routes);
  const baseMarkersRef = useRef(mockMapData.markers);
  const seedVehiclesRef = useRef(mockVehicles);
  const mockProgressRef = useRef({});
  const markerStateRef = useRef({});
  const historicalRoutesRef = useRef([]);
  const mockSimulationActiveRef = useRef(false);
  const knownIncidentIdsRef = useRef(new Set());
  const knownDisasterIdsRef = useRef(new Set());
  const routeSignatureRef = useRef({});
  const lastRouteEventTickRef = useRef({});
  const dynamicIncidentsRef = useRef([]);
  const dynamicDisasterZonesRef = useRef([]);
  const pendingDynamicReroutesRef = useRef({});
  const osrmRouteCacheRef = useRef({});
  const nextIncidentSpawnTickRef = useRef(90);
  const nextDisasterSpawnTickRef = useRef(240);
  const dynamicEventCounterRef = useRef(0);
  const rerouteInFlightRef = useRef({});
  const routeTargetRef = useRef({});
  const nextAllowedRerouteTickRef = useRef({});
  const routeLengthRef = useRef({}); // Track total route length per vehicle
  const routeCompletedRef = useRef({}); // Track if route has been completed
  const nextDispatchTargetIndexRef = useRef(0); // Cycle through dispatch targets
  const nextSpawnPointIndexRef = useRef(0);
  const nextFarTargetIndexRef = useRef(0);
  const dispatchTargetsRef = useRef([
    { lat: -1.2921, lng: 36.8219 },
    { lat: -1.2799, lng: 36.8146 },
    { lat: -1.2675, lng: 36.8108 },
    { lat: -1.3004, lng: 36.8287 },
  ]);
  const spawnPointsRef = useRef([
    { lat: -1.3168, lng: 36.7728 },
    { lat: -1.2469, lng: 36.8542 },
    { lat: -1.3325, lng: 36.8421 },
    { lat: -1.2385, lng: 36.7861 },
    { lat: -1.3091, lng: 36.8735 },
    { lat: -1.2572, lng: 36.7579 },
  ]);
  const farDestinationPointsRef = useRef([
    { lat: -1.2145, lng: 36.9028 },
    { lat: -1.3539, lng: 36.8892 },
    { lat: -1.1986, lng: 36.7463 },
    { lat: -1.3784, lng: 36.7688 },
    { lat: -1.2223, lng: 36.7039 },
    { lat: -1.3668, lng: 36.9154 },
  ]);

  const AGGRESSIVE_AVOIDANCE_MODE = true;
  const REROUTE_CHECK_INTERVAL_TICKS = AGGRESSIVE_AVOIDANCE_MODE ? 35 : 120;
  const REROUTE_COOLDOWN_TICKS = AGGRESSIVE_AVOIDANCE_MODE ? 160 : 600;
  const INCIDENT_REROUTE_PROBABILITY = AGGRESSIVE_AVOIDANCE_MODE ? 0.92 : 0.22;
  const NORMAL_REROUTE_PROBABILITY = AGGRESSIVE_AVOIDANCE_MODE ? 0.03 : 0.04;
  const MIN_TARGET_CHANGE_DISTANCE_METERS = 40;
  const INCIDENT_AVOID_DISTANCE_METERS = AGGRESSIVE_AVOIDANCE_MODE ? 260 : 180;
  const INCIDENT_TARGET_BUFFER_METERS = AGGRESSIVE_AVOIDANCE_MODE ? 170 : 120;
  const INCIDENT_ROUTE_BUFFER_METERS = AGGRESSIVE_AVOIDANCE_MODE ? 130 : 90;
  const INCIDENT_LIFETIME_TICKS = 420;
  const DISASTER_LIFETIME_TICKS = 680;
  const INCIDENT_SPAWN_MIN_INTERVAL = 150;
  const INCIDENT_SPAWN_MAX_INTERVAL = 260;
  const DISASTER_SPAWN_MIN_INTERVAL = 360;
  const DISASTER_SPAWN_MAX_INTERVAL = 520;
  const MAX_DYNAMIC_INCIDENTS = 6;
  const MAX_DYNAMIC_DISASTERS = 3;
  const DYNAMIC_EVENT_REROUTE_DELAY_MIN_TICKS = 7;
  const DYNAMIC_EVENT_REROUTE_DELAY_MAX_TICKS = 22;
  const MAX_DYNAMIC_REROUTES_PER_TICK = 2;

  const routePointDistanceMeters = useCallback((a, b) => {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const earthRadius = 6371000;
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);

    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }, []);

  const getPointAtDistance = useCallback(
    (points, distanceMeters) => {
      if (!points || points.length === 0) {
        return null;
      }

      if (points.length === 1) {
        return { lat: points[0][0], lng: points[0][1], totalLength: 0 };
      }

      const segmentLengths = [];
      let totalLength = 0;
      for (let i = 0; i < points.length - 1; i += 1) {
        const length = routePointDistanceMeters(points[i], points[i + 1]);
        segmentLengths.push(length);
        totalLength += length;
      }

      if (totalLength <= 0.1) {
        return { lat: points[0][0], lng: points[0][1], totalLength };
      }

      let remaining =
        ((distanceMeters % totalLength) + totalLength) % totalLength;

      for (let i = 0; i < segmentLengths.length; i += 1) {
        const segLength = segmentLengths[i];
        if (remaining <= segLength) {
          const t = segLength > 0 ? remaining / segLength : 0;
          const from = points[i];
          const to = points[i + 1];
          return {
            lat: from[0] + (to[0] - from[0]) * t,
            lng: from[1] + (to[1] - from[1]) * t,
            totalLength,
          };
        }
        remaining -= segLength;
      }

      const last = points[points.length - 1];
      return { lat: last[0], lng: last[1], totalLength };
    },
    [routePointDistanceMeters],
  );

  const normalizePoint = useCallback((point) => {
    if (Array.isArray(point) && point.length >= 2) {
      const lat = Number(point[0]);
      const lng = Number(point[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return [lat, lng];
      }
      return null;
    }

    if (
      point &&
      typeof point === "object" &&
      Number.isFinite(Number(point.lat)) &&
      Number.isFinite(Number(point.lng))
    ) {
      return [Number(point.lat), Number(point.lng)];
    }

    return null;
  }, []);

  const normalizeRoutePoints = useCallback(
    (points) => (points || []).map(normalizePoint).filter(Boolean),
    [normalizePoint],
  );

  const buildStreetLikeFallbackRoute = useCallback((points) => {
    if (!points || points.length < 2) {
      return points || [];
    }

    const expanded = [points[0]];

    for (let i = 0; i < points.length - 1; i += 1) {
      const from = points[i];
      const to = points[i + 1];
      const latDelta = to[0] - from[0];
      const corridorShift = i % 2 === 0 ? 0.0008 : -0.0008;

      // Generate two elbow points to mimic street/corridor movement.
      const elbow1 = [from[0] + latDelta * 0.45, from[1] + corridorShift];
      const elbow2 = [from[0] + latDelta * 0.45, to[1] - corridorShift];

      const candidates = [elbow1, elbow2, to];
      for (const candidate of candidates) {
        const prev = expanded[expanded.length - 1];
        if (!prev || prev[0] !== candidate[0] || prev[1] !== candidate[1]) {
          expanded.push(candidate);
        }
      }
    }

    return expanded;
  }, []);

  const buildRouteCacheKey = useCallback(
    (points) =>
      (points || [])
        .map(
          (point) =>
            `${Number(point[0]).toFixed(5)},${Number(point[1]).toFixed(5)}`,
        )
        .join("|"),
    [],
  );

  const fetchRoadSnappedRoute = useCallback(
    async (route) => {
      const normalizedPoints = normalizeRoutePoints(route.points);
      const fallbackPoints = buildStreetLikeFallbackRoute(normalizedPoints);

      if (!normalizedPoints || normalizedPoints.length < 2) {
        return route;
      }

      const cacheKey = buildRouteCacheKey(normalizedPoints);
      const cached = osrmRouteCacheRef.current[cacheKey];
      if (cached?.points?.length > 1) {
        return {
          ...route,
          ...cached,
        };
      }

      const coordinates = normalizedPoints
        .map((point) => `${point[1]},${point[0]}`)
        .join(";");

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false&alternatives=false`,
          );

          if (!response.ok) {
            if (
              (response.status === 429 || response.status >= 500) &&
              attempt < 1
            ) {
              await new Promise((resolve) =>
                setTimeout(resolve, 140 * (attempt + 1)),
              );
              continue;
            }
            break;
          }

          const payload = await response.json();
          const bestRoute = payload?.routes?.[0];
          const geometry = bestRoute?.geometry?.coordinates;

          if (!geometry || geometry.length < 2) {
            if (attempt < 1) {
              await new Promise((resolve) => setTimeout(resolve, 120));
              continue;
            }
            break;
          }

          const mappedGeometry = geometry.map((coord) => [coord[1], coord[0]]);
          const routed = {
            points: mappedGeometry,
            legs: [],
            distanceMeters: bestRoute?.distance || 0,
            durationSeconds: bestRoute?.duration || 0,
          };
          osrmRouteCacheRef.current[cacheKey] = routed;

          return {
            ...route,
            ...routed,
          };
        } catch {
          if (attempt < 1) {
            await new Promise((resolve) => setTimeout(resolve, 120));
            continue;
          }
          break;
        }
      }

      return {
        ...route,
        points: fallbackPoints,
      };
    },
    [buildRouteCacheKey, buildStreetLikeFallbackRoute, normalizeRoutePoints],
  );

  const minDistanceToIncidents = useCallback(
    (points, incidents) => {
      if (
        !points ||
        points.length === 0 ||
        !incidents ||
        incidents.length === 0
      ) {
        return Number.POSITIVE_INFINITY;
      }

      let minDistance = Number.POSITIVE_INFINITY;
      for (const point of points) {
        for (const incident of incidents) {
          const distance = routePointDistanceMeters(point, [
            incident.lat,
            incident.lng,
          ]);
          if (distance < minDistance) {
            minDistance = distance;
          }
        }
      }
      return minDistance;
    },
    [routePointDistanceMeters],
  );

  // Disaster zone routing logic
  const minDistanceToDisasterZone = useCallback(
    (points, disasterZones) => {
      if (
        !points ||
        points.length === 0 ||
        !disasterZones ||
        disasterZones.length === 0
      ) {
        return Number.POSITIVE_INFINITY;
      }

      let minDistance = Number.POSITIVE_INFINITY;
      for (const point of points) {
        for (const zone of disasterZones) {
          const distance = routePointDistanceMeters(point, [
            zone.lat,
            zone.lng,
          ]);
          if (distance < minDistance) {
            minDistance = distance;
          }
        }
      }
      return minDistance;
    },
    [routePointDistanceMeters],
  );

  const routeIntersectsDisasterZone = useCallback(
    (points, disasterZones) => {
      if (
        !points ||
        points.length === 0 ||
        !disasterZones ||
        disasterZones.length === 0
      ) {
        return null;
      }

      for (const zone of disasterZones) {
        const minDist = minDistanceToDisasterZone(points, [zone]);
        if (minDist <= zone.radius) {
          return zone;
        }
      }
      return null;
    },
    [minDistanceToDisasterZone],
  );

  const routeIntersectsIncidentZone = useCallback(
    (points, incidents, bufferMeters = 90) => {
      if (!points?.length || !incidents?.length) {
        return null;
      }

      for (const incident of incidents) {
        const minDist = minDistanceToIncidents(points, [incident]);
        const radius = Number(incident.radius || 0);
        if (minDist <= radius + bufferMeters) {
          return incident;
        }
      }

      return null;
    },
    [minDistanceToIncidents],
  );

  const calculateDisasterZoneHeatmapData = useCallback((disasterZones) => {
    if (!disasterZones || disasterZones.length === 0) {
      return [];
    }

    const heatmapPoints = [];
    for (const zone of disasterZones) {
      // Create multiple points around zone to form a gradient heatmap
      const points = Math.ceil(zone.radius / 20);
      const angleStep = (Math.PI * 2) / points;

      // Center point (highest intensity)
      heatmapPoints.push([zone.lat, zone.lng, zone.intensity]);

      // Gradient points around center
      for (let i = 0; i < points; i++) {
        const angle = i * angleStep;
        const distance = zone.radius * 0.7;
        const radiusMeters = distance / 111000; // Convert to degrees
        const circLat = zone.lat + Math.sin(angle) * radiusMeters;
        const circLng = zone.lng + Math.cos(angle) * radiusMeters;
        heatmapPoints.push([circLat, circLng, zone.intensity * 0.6]);
      }

      // Outer ring (low intensity)
      for (let i = 0; i < points; i++) {
        const angle = i * angleStep;
        const distance = zone.radius;
        const radiusMeters = distance / 111000;
        const circLat = zone.lat + Math.sin(angle) * radiusMeters;
        const circLng = zone.lng + Math.cos(angle) * radiusMeters;
        heatmapPoints.push([circLat, circLng, zone.intensity * 0.25]);
      }
    }

    return heatmapPoints;
  }, []);

  const calculateDisasterAvoidanceRoute = useCallback(
    async (vehicleId, startPos, endPos, disasterZones, forcedZone = null) => {
      const intersectingZone =
        forcedZone ||
        disasterZones.find((zone) =>
          routeIntersectsDisasterZone([startPos, endPos], [zone]),
        );

      if (!intersectingZone || !intersectingZone.avoidanceWaypoints) {
        // Route doesn't intersect any disaster zone, route normally
        return fetchRoadSnappedRoute({
          id: `${vehicleId}-normal`,
          points: [startPos, endPos],
        });
      }

      // Route intersects disaster zone, use avoidance waypoints
      const waypoints = [
        startPos,
        ...intersectingZone.avoidanceWaypoints
          .map((point) => normalizePoint(point))
          .filter(Boolean),
        endPos,
      ];
      return fetchRoadSnappedRoute({
        id: `${vehicleId}-avoid`,
        points: waypoints,
      });
    },
    [fetchRoadSnappedRoute, routeIntersectsDisasterZone, normalizePoint],
  );

  const buildIncidentAvoidanceWaypoints = useCallback(
    (startPos, endPos, incident) => {
      if (!incident) {
        return [];
      }

      const dy = endPos[0] - startPos[0];
      const dx = endPos[1] - startPos[1];
      const length = Math.hypot(dx, dy) || 1;
      const normalLat = -dx / length;
      const normalLng = dy / length;

      const offsetMeters = Math.max(120, (incident.radius || 0) + 80);
      const offsetDegrees = offsetMeters / 111000;

      const waypointA = [
        incident.lat + normalLat * offsetDegrees,
        incident.lng + normalLng * offsetDegrees,
      ];
      const waypointB = [
        incident.lat - normalLat * offsetDegrees,
        incident.lng - normalLng * offsetDegrees,
      ];

      const startDistA = routePointDistanceMeters(startPos, waypointA);
      const startDistB = routePointDistanceMeters(startPos, waypointB);
      return startDistA < startDistB
        ? [waypointA, waypointB]
        : [waypointB, waypointA];
    },
    [routePointDistanceMeters],
  );

  // Get the next dispatch target in round-robin fashion
  const getNextDispatchTarget = useCallback(() => {
    const target =
      dispatchTargetsRef.current[
        nextDispatchTargetIndexRef.current % dispatchTargetsRef.current.length
      ];
    nextDispatchTargetIndexRef.current += 1;
    return target;
  }, []);

  const isPointInDisasterBuffer = useCallback(
    (point, disasterZones, bufferMeters = 120) => {
      if (!point || !disasterZones?.length) {
        return false;
      }

      return disasterZones.some((zone) => {
        const distance = routePointDistanceMeters(
          [point.lat, point.lng],
          [zone.lat, zone.lng],
        );
        return distance <= (zone.radius || 0) + bufferMeters;
      });
    },
    [routePointDistanceMeters],
  );

  const getSafeDispatchTarget = useCallback(
    (preferredTarget, disasterZones) => {
      if (!disasterZones?.length) {
        return preferredTarget;
      }

      if (!isPointInDisasterBuffer(preferredTarget, disasterZones)) {
        return preferredTarget;
      }

      // Try all known dispatch targets and pick the first safe one.
      for (let i = 0; i < dispatchTargetsRef.current.length; i += 1) {
        const candidate = getNextDispatchTarget();
        if (!isPointInDisasterBuffer(candidate, disasterZones)) {
          return candidate;
        }
      }

      // Fallback to preferred if all candidates are inside buffers.
      return preferredTarget;
    },
    [getNextDispatchTarget, isPointInDisasterBuffer],
  );

  const isPointNearIncident = useCallback(
    (point, incidents, bufferMeters = INCIDENT_TARGET_BUFFER_METERS) => {
      if (!point || !incidents?.length) {
        return false;
      }

      return incidents.some((incident) => {
        const distance = routePointDistanceMeters(
          [point.lat, point.lng],
          [incident.lat, incident.lng],
        );
        const incidentRadius = Number(incident.radius || 0);
        return distance <= incidentRadius + bufferMeters;
      });
    },
    [INCIDENT_TARGET_BUFFER_METERS, routePointDistanceMeters],
  );

  const getNextSpawnPoint = useCallback(() => {
    const point =
      spawnPointsRef.current[
        nextSpawnPointIndexRef.current % spawnPointsRef.current.length
      ];
    nextSpawnPointIndexRef.current += 1;
    return point;
  }, []);

  const getNextFarDestination = useCallback(() => {
    const point =
      farDestinationPointsRef.current[
        nextFarTargetIndexRef.current % farDestinationPointsRef.current.length
      ];
    nextFarTargetIndexRef.current += 1;
    return point;
  }, []);

  const getSafeSpawnPoint = useCallback(
    (disasterZones) => {
      for (let i = 0; i < spawnPointsRef.current.length; i += 1) {
        const candidate = getNextSpawnPoint();
        if (!isPointInDisasterBuffer(candidate, disasterZones, 220)) {
          return candidate;
        }
      }
      return getNextSpawnPoint();
    },
    [getNextSpawnPoint, isPointInDisasterBuffer],
  );

  const getSafeFarDestination = useCallback(
    (originPoint, disasterZones) => {
      for (let i = 0; i < farDestinationPointsRef.current.length; i += 1) {
        const candidate = getNextFarDestination();
        const distanceFromOrigin = routePointDistanceMeters(
          [originPoint.lat, originPoint.lng],
          [candidate.lat, candidate.lng],
        );
        if (
          distanceFromOrigin >= 2500 &&
          !isPointInDisasterBuffer(candidate, disasterZones, 220)
        ) {
          return candidate;
        }
      }
      return getNextFarDestination();
    },
    [getNextFarDestination, isPointInDisasterBuffer, routePointDistanceMeters],
  );

  const getSafeHazardAwareTarget = useCallback(
    (originPoint, disasterZones, incidents) => {
      const candidates = [
        ...dispatchTargetsRef.current,
        ...farDestinationPointsRef.current,
      ];

      let bestCandidate = null;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const candidate of candidates) {
        if (isPointInDisasterBuffer(candidate, disasterZones, 220)) {
          continue;
        }
        if (
          isPointNearIncident(
            candidate,
            incidents,
            INCIDENT_TARGET_BUFFER_METERS,
          )
        ) {
          continue;
        }

        const distanceFromOrigin = routePointDistanceMeters(
          [originPoint.lat, originPoint.lng],
          [candidate.lat, candidate.lng],
        );
        const score = distanceFromOrigin;
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }

      return (
        bestCandidate ||
        getSafeFarDestination(originPoint, disasterZones) ||
        getSafeDispatchTarget(getNextDispatchTarget(), disasterZones)
      );
    },
    [
      INCIDENT_TARGET_BUFFER_METERS,
      getNextDispatchTarget,
      getSafeDispatchTarget,
      getSafeFarDestination,
      isPointInDisasterBuffer,
      isPointNearIncident,
      routePointDistanceMeters,
    ],
  );

  const getRandomTickInterval = useCallback((min, max) => {
    const span = Math.max(0, max - min);
    return min + Math.floor(Math.random() * (span + 1));
  }, []);

  const getTrafficMarkersSnapshot = useCallback(() => {
    const baseMarkers = baseMarkersRef.current || [];
    return baseMarkers
      .map((marker) => {
        const unitId = marker.label?.replace("Unit ", "") || marker.id;
        const current = markerStateRef.current[unitId];
        return {
          lat: current?.lat ?? marker.lat,
          lng: current?.lng ?? marker.lng,
        };
      })
      .filter(
        (point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng),
      );
  }, []);

  const chooseTrafficWeightedRouteAnchor = useCallback(
    (routeByVehicleId, trafficMarkers, corridorRadiusMeters = 220) => {
      const activeRoutes = Array.from(routeByVehicleId.values()).filter(
        (route) => route?.points?.length > 3 && !route.historical,
      );

      if (activeRoutes.length === 0) {
        return null;
      }

      const scoredAnchors = [];
      for (const route of activeRoutes) {
        const sampleStep = Math.max(1, Math.floor(route.points.length / 8));
        const candidateIndices = [];
        for (let idx = 1; idx < route.points.length - 1; idx += sampleStep) {
          candidateIndices.push(idx);
        }
        if (!candidateIndices.includes(route.points.length - 2)) {
          candidateIndices.push(route.points.length - 2);
        }

        for (const index of candidateIndices) {
          const anchor = route.points[index];
          if (!anchor) {
            continue;
          }

          let score = 0.9;
          for (const marker of trafficMarkers) {
            const distance = routePointDistanceMeters(anchor, [
              marker.lat,
              marker.lng,
            ]);
            if (distance < corridorRadiusMeters) {
              score += 1;
              if (distance < corridorRadiusMeters * 0.45) {
                score += 0.9;
              }
            }
          }

          scoredAnchors.push({ route, anchor, score: Math.max(0.25, score) });
        }
      }

      if (scoredAnchors.length === 0) {
        return null;
      }

      const totalWeight = scoredAnchors.reduce(
        (sum, item) => sum + item.score,
        0,
      );
      let pick = Math.random() * totalWeight;
      for (const candidate of scoredAnchors) {
        pick -= candidate.score;
        if (pick <= 0) {
          return candidate;
        }
      }

      return scoredAnchors[scoredAnchors.length - 1];
    },
    [routePointDistanceMeters],
  );

  const buildIncidentFromRoute = useCallback(
    (time, routeByVehicleId, trafficMarkers) => {
      const chosenAnchor = chooseTrafficWeightedRouteAnchor(
        routeByVehicleId,
        trafficMarkers,
        230,
      );

      if (!chosenAnchor?.anchor) {
        return null;
      }

      dynamicEventCounterRef.current += 1;
      const id = `dyn-inc-${dynamicEventCounterRef.current}`;
      const severity = Math.random() < 0.3 ? "high" : "medium";

      return {
        id,
        lat: chosenAnchor.anchor[0],
        lng: chosenAnchor.anchor[1],
        title: severity === "high" ? "Major collision" : "Road obstruction",
        detail:
          severity === "high"
            ? "Heavy congestion and lane blockage"
            : "Temporary blockage slowing corridor traffic",
        color: severity === "high" ? "#ef4444" : "#f59e0b",
        radius: severity === "high" ? 16 : 11,
        severity,
        createdAtTick: time,
        expiresAtTick: time + INCIDENT_LIFETIME_TICKS,
        dynamic: true,
      };
    },
    [INCIDENT_LIFETIME_TICKS, chooseTrafficWeightedRouteAnchor],
  );

  const buildDisasterZoneFromRoute = useCallback(
    (time, routeByVehicleId, trafficMarkers) => {
      const chosenAnchor = chooseTrafficWeightedRouteAnchor(
        routeByVehicleId,
        trafficMarkers,
        280,
      );

      if (!chosenAnchor?.anchor) {
        return null;
      }

      dynamicEventCounterRef.current += 1;
      const id = `dyn-dz-${dynamicEventCounterRef.current}`;
      const radius = 75 + Math.floor(Math.random() * 35);
      const lat = chosenAnchor.anchor[0];
      const lng = chosenAnchor.anchor[1];

      // Build coarse detour points around the hazard center.
      const offset = radius / 111000;
      const waypoints = [
        { lat: lat + offset * 0.9, lng: lng - offset * 0.8 },
        { lat: lat + offset * 0.8, lng: lng + offset * 0.9 },
        { lat: lat - offset * 0.85, lng: lng + offset * 0.8 },
      ];

      return {
        id,
        lat,
        lng,
        title: "Disaster control zone",
        detail: "Emergency operations active, forced detours applied",
        color: "#dc2626",
        radius,
        intensity: 0.9,
        severity: "critical",
        avoidanceWaypoints: waypoints,
        createdAtTick: time,
        expiresAtTick: time + DISASTER_LIFETIME_TICKS,
        dynamic: true,
      };
    },
    [DISASTER_LIFETIME_TICKS, chooseTrafficWeightedRouteAnchor],
  );

  const requestMockRerouteToLocation = useCallback(
    async (vehicleId, target, reason = "Manual reroute", tickNow = 0) => {
      if (
        !target ||
        typeof target.lat !== "number" ||
        typeof target.lng !== "number"
      ) {
        return false;
      }

      if (rerouteInFlightRef.current[vehicleId]) {
        return false;
      }

      const currentRoute = mockRoutesRef.current.find(
        (candidate) => candidate.vehicleId === vehicleId,
      );

      if (!currentRoute) {
        return false;
      }

      const currentTarget = routeTargetRef.current[vehicleId];
      if (currentTarget) {
        const delta = routePointDistanceMeters(
          [currentTarget.lat, currentTarget.lng],
          [target.lat, target.lng],
        );
        if (delta < MIN_TARGET_CHANGE_DISTANCE_METERS) {
          return false;
        }
      }

      const currentMarker =
        markerStateRef.current[vehicleId] ||
        mockMapData.markers.find((m) => m.label === `Unit ${vehicleId}`);

      if (!currentMarker) {
        return false;
      }

      rerouteInFlightRef.current[vehicleId] = true;

      try {
        const startPos = [currentMarker.lat, currentMarker.lng];
        const endPos = [target.lat, target.lng];
        let rerouted = await fetchRoadSnappedRoute({
          ...currentRoute,
          id: `${currentRoute.id}-rr-${tickNow}`,
          points: [startPos, endPos],
        });

        if (!mockSimulationActiveRef.current || !rerouted?.points?.length) {
          return false;
        }

        const activeDisasterZones = dynamicDisasterZonesRef.current.filter(
          (zone) => (zone.expiresAtTick || Number.POSITIVE_INFINITY) > tickNow,
        );
        const activeIncidents = dynamicIncidentsRef.current.filter(
          (incident) =>
            (incident.expiresAtTick || Number.POSITIVE_INFINITY) > tickNow,
        );

        const intersectingDisaster = routeIntersectsDisasterZone(
          rerouted.points,
          activeDisasterZones,
        );
        if (intersectingDisaster) {
          const disasterSafeRoute = await calculateDisasterAvoidanceRoute(
            vehicleId,
            startPos,
            endPos,
            activeDisasterZones,
            intersectingDisaster,
          );
          if (disasterSafeRoute?.points?.length > 1) {
            rerouted = disasterSafeRoute;
          }
        }

        const intersectingIncident = routeIntersectsIncidentZone(
          rerouted.points,
          activeIncidents,
          INCIDENT_ROUTE_BUFFER_METERS,
        );
        if (intersectingIncident) {
          const incidentWaypoints = buildIncidentAvoidanceWaypoints(
            startPos,
            endPos,
            intersectingIncident,
          );
          const incidentSafeRoute = await fetchRoadSnappedRoute({
            ...currentRoute,
            id: `${currentRoute.id}-inc-${tickNow}`,
            points: [startPos, ...incidentWaypoints, endPos],
          });
          if (incidentSafeRoute?.points?.length > 1) {
            rerouted = incidentSafeRoute;
          }
        }

        if (currentRoute?.points?.length > 1) {
          historicalRoutesRef.current = [
            {
              ...currentRoute,
              id: `${currentRoute.id}-hist-${tickNow}`,
              historical: true,
              dashArray: "8 8",
              opacity: 0.35,
              name: `${currentRoute.name || "Route"} (previous)`,
              expiresAtTick: tickNow + 80,
            },
            ...historicalRoutesRef.current,
          ].slice(0, 12);
        }

        mockRoutesRef.current = mockRoutesRef.current.map((candidate) =>
          candidate.vehicleId === vehicleId
            ? {
                ...rerouted,
                vehicleId,
                color: candidate.color,
                name: reason,
              }
            : candidate,
        );

        routeTargetRef.current[vehicleId] = target;
        mockProgressRef.current[vehicleId] = 0;
        nextAllowedRerouteTickRef.current[vehicleId] =
          tickNow + REROUTE_COOLDOWN_TICKS;
        routeCompletedRef.current[vehicleId] = false; // Reset completion flag for new route
        routeLengthRef.current[vehicleId] = 0; // Reset route length to recalculate

        dispatch({
          type: "ADD_ALERT",
          payload: `${vehicleId} reroute set to (${target.lat.toFixed(4)}, ${target.lng.toFixed(4)})`,
        });
        dispatch({
          type: "ADD_TIMELINE_EVENT",
          payload: {
            event: "Route recalculated",
            vehicleId,
            details: reason,
            category: "dynamic",
            severity: "info",
          },
        });

        return true;
      } finally {
        rerouteInFlightRef.current[vehicleId] = false;
      }
    },
    [
      INCIDENT_ROUTE_BUFFER_METERS,
      REROUTE_COOLDOWN_TICKS,
      buildIncidentAvoidanceWaypoints,
      calculateDisasterAvoidanceRoute,
      dispatch,
      fetchRoadSnappedRoute,
      routeIntersectsDisasterZone,
      routeIntersectsIncidentZone,
      routePointDistanceMeters,
    ],
  );

  const queueDynamicReroute = useCallback(
    (vehicleId, target, reason, tickNow) => {
      if (!vehicleId || !target) {
        return;
      }

      const delay =
        DYNAMIC_EVENT_REROUTE_DELAY_MIN_TICKS +
        Math.floor(
          Math.random() *
            (DYNAMIC_EVENT_REROUTE_DELAY_MAX_TICKS -
              DYNAMIC_EVENT_REROUTE_DELAY_MIN_TICKS +
              1),
        );

      pendingDynamicReroutesRef.current[vehicleId] = {
        vehicleId,
        target,
        reason,
        executeAtTick: tickNow + delay,
        attempts: 0,
      };
    },
    [
      DYNAMIC_EVENT_REROUTE_DELAY_MAX_TICKS,
      DYNAMIC_EVENT_REROUTE_DELAY_MIN_TICKS,
    ],
  );

  const flushDueDynamicReroutes = useCallback(
    async (tickNow) => {
      const pending = Object.values(pendingDynamicReroutesRef.current)
        .filter((item) => item.executeAtTick <= tickNow)
        .sort((a, b) => a.executeAtTick - b.executeAtTick)
        .slice(0, MAX_DYNAMIC_REROUTES_PER_TICK);

      for (const item of pending) {
        const success = await requestMockRerouteToLocation(
          item.vehicleId,
          item.target,
          item.reason,
          tickNow,
        );

        if (success) {
          delete pendingDynamicReroutesRef.current[item.vehicleId];
          continue;
        }

        const nextAttempts = (item.attempts || 0) + 1;
        if (nextAttempts >= 3) {
          delete pendingDynamicReroutesRef.current[item.vehicleId];
          continue;
        }

        pendingDynamicReroutesRef.current[item.vehicleId] = {
          ...item,
          attempts: nextAttempts,
          executeAtTick: tickNow + 8,
        };
      }
    },
    [MAX_DYNAMIC_REROUTES_PER_TICK, requestMockRerouteToLocation],
  );

  // Handle route completion - auto-assign next destination
  const handleRouteCompletion = useCallback(
    (vehicleId) => {
      const nextTarget = getNextDispatchTarget();
      const alreadyCompleted = routeCompletedRef.current[vehicleId];

      if (!alreadyCompleted) {
        routeCompletedRef.current[vehicleId] = true;

        dispatch({
          type: "ADD_ALERT",
          payload: `${vehicleId} reached destination. Dispatching to new location.`,
        });
        dispatch({
          type: "ADD_TIMELINE_EVENT",
          payload: {
            event: "Route completed",
            vehicleId,
            details: `Automatically dispatched to next location`,
            category: "dynamic",
            severity: "info",
          },
        });
      }

      // Auto-reroute to next dispatch target
      requestMockRerouteToLocation(
        vehicleId,
        nextTarget,
        "Auto-dispatch to next destination",
        mockDataTickRef.current,
      );
    },
    [getNextDispatchTarget, dispatch, requestMockRerouteToLocation],
  );

  // Start mock data simulation (animates vehicles)
  const startMockDataSimulation = useCallback(() => {
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    mockSimulationActiveRef.current = true;

    const baseMarkers = baseMarkersRef.current;
    const baseVehicles = seedVehiclesRef.current;

    tickIntervalRef.current = setInterval(() => {
      mockDataTickRef.current += 1;

      const time = mockDataTickRef.current;
      const routeByVehicleId = new Map(
        mockRoutesRef.current.map((route) => [route.vehicleId, route]),
      );
      const trafficMarkers = getTrafficMarkersSnapshot();

      const activeRoutes = mockRoutesRef.current;
      historicalRoutesRef.current = historicalRoutesRef.current.filter(
        (route) => (route.expiresAtTick || 0) > time,
      );

      const previousIncidentCount = dynamicIncidentsRef.current.length;
      const previousDisasterCount = dynamicDisasterZonesRef.current.length;

      let incidentList = dynamicIncidentsRef.current.filter(
        (incident) =>
          (incident.expiresAtTick || Number.POSITIVE_INFINITY) > time,
      );
      let disasterZones = dynamicDisasterZonesRef.current.filter(
        (zone) => (zone.expiresAtTick || Number.POSITIVE_INFINITY) > time,
      );

      if (incidentList.length < previousIncidentCount) {
        dispatch({
          type: "ADD_TIMELINE_EVENT",
          payload: {
            event: "Incident cleared",
            vehicleId: null,
            details: "Traffic flow restored on an affected corridor",
            category: "dynamic",
            severity: "info",
          },
        });
      }

      if (disasterZones.length < previousDisasterCount) {
        dispatch({
          type: "ADD_TIMELINE_EVENT",
          payload: {
            event: "Disaster zone resolved",
            vehicleId: null,
            details: "Emergency zone lifted and routes normalized",
            category: "dynamic",
            severity: "info",
          },
        });
      }

      if (
        time >= nextIncidentSpawnTickRef.current &&
        incidentList.length < MAX_DYNAMIC_INCIDENTS
      ) {
        const newIncident = buildIncidentFromRoute(
          time,
          routeByVehicleId,
          trafficMarkers,
        );
        nextIncidentSpawnTickRef.current =
          time +
          getRandomTickInterval(
            INCIDENT_SPAWN_MIN_INTERVAL,
            INCIDENT_SPAWN_MAX_INTERVAL,
          );

        if (newIncident) {
          incidentList = [...incidentList, newIncident];
          dispatch({
            type: "ADD_ALERT",
            payload: `New incident: ${newIncident.title}`,
          });
          dispatch({
            type: "ADD_TIMELINE_EVENT",
            payload: {
              event: "Incident detected",
              vehicleId: null,
              details: `${newIncident.title} now affecting active routes`,
              category: "dynamic",
              severity: "warning",
            },
          });

          for (const [vehicleId, route] of routeByVehicleId.entries()) {
            if (!route?.points?.length) {
              continue;
            }
            const distance = minDistanceToIncidents(route.points, [
              newIncident,
            ]);
            if (distance < INCIDENT_AVOID_DISTANCE_METERS) {
              const currentMarker = markerStateRef.current[vehicleId];
              const target = getSafeHazardAwareTarget(
                {
                  lat: currentMarker?.lat ?? newIncident.lat,
                  lng: currentMarker?.lng ?? newIncident.lng,
                },
                disasterZones,
                incidentList,
              );
              queueDynamicReroute(
                vehicleId,
                target,
                "Emergency incident detour",
                time,
              );
            }
          }
        }
      }

      if (
        time >= nextDisasterSpawnTickRef.current &&
        disasterZones.length < MAX_DYNAMIC_DISASTERS
      ) {
        const newZone = buildDisasterZoneFromRoute(
          time,
          routeByVehicleId,
          trafficMarkers,
        );
        nextDisasterSpawnTickRef.current =
          time +
          getRandomTickInterval(
            DISASTER_SPAWN_MIN_INTERVAL,
            DISASTER_SPAWN_MAX_INTERVAL,
          );

        if (newZone) {
          disasterZones = [...disasterZones, newZone];
          dispatch({
            type: "ADD_ALERT",
            payload: `Disaster zone active: ${newZone.title}`,
          });
          dispatch({
            type: "ADD_TIMELINE_EVENT",
            payload: {
              event: "Disaster zone activated",
              vehicleId: null,
              details: `${newZone.title} forcing emergency detours`,
              category: "dynamic",
              severity: "critical",
            },
          });

          for (const [vehicleId, route] of routeByVehicleId.entries()) {
            if (!route?.points?.length) {
              continue;
            }
            if (routeIntersectsDisasterZone(route.points, [newZone])) {
              const currentMarker = markerStateRef.current[vehicleId];
              const target = getSafeHazardAwareTarget(
                {
                  lat: currentMarker?.lat ?? newZone.lat,
                  lng: currentMarker?.lng ?? newZone.lng,
                },
                disasterZones,
                incidentList,
              );
              queueDynamicReroute(
                vehicleId,
                target,
                `Avoid ${newZone.title}`,
                time,
              );
            }
          }
        }
      }

      dynamicIncidentsRef.current = incidentList;
      dynamicDisasterZonesRef.current = disasterZones;

      void flushDueDynamicReroutes(time);

      // Animate vehicles along route geometry where available.
      const updatedMarkers = baseMarkers.map((marker, markerIndex) => {
        const unitId = marker.label.replace("Unit ", "");
        const route = routeByVehicleId.get(unitId);
        const speedMetersPerSecond = 8 + ((time + markerIndex * 7) % 6);
        const speedMetersPerTick = speedMetersPerSecond / 10;
        const previousState = markerStateRef.current[unitId] || {
          lat: marker.lat,
          lng: marker.lng,
        };

        if (route && route.points.length > 1) {
          const previousProgress = mockProgressRef.current[unitId] || 0;
          const nextProgress = previousProgress + speedMetersPerTick;
          mockProgressRef.current[unitId] = nextProgress;

          const nextPoint = getPointAtDistance(route.points, nextProgress);

          // Store route total length for completion detection
          if (!routeLengthRef.current[unitId]) {
            routeLengthRef.current[unitId] = nextPoint.totalLength;
          }

          // Detect route completion (vehicle reached destination)
          const routeLength = routeLengthRef.current[unitId];
          if (
            nextProgress >= routeLength &&
            routeLength > 0 &&
            !routeCompletedRef.current[unitId]
          ) {
            handleRouteCompletion(unitId);
          }

          // Slower reroute cycle: maintain route continuity and only reroute to explicit target coordinates.
          const nextAllowed = nextAllowedRerouteTickRef.current[unitId] || 0;
          if (
            time % REROUTE_CHECK_INTERVAL_TICKS === 0 &&
            time >= nextAllowed
          ) {
            const minIncidentDistance = minDistanceToIncidents(
              route.points,
              incidentList,
            );
            const intersectingDisaster = routeIntersectsDisasterZone(
              route.points,
              disasterZones,
            );
            const intersectingIncident = routeIntersectsIncidentZone(
              route.points,
              incidentList,
              INCIDENT_TARGET_BUFFER_METERS,
            );
            const nearIncident =
              minIncidentDistance < INCIDENT_AVOID_DISTANCE_METERS;
            const forcedHazardReroute =
              Boolean(intersectingDisaster) || Boolean(intersectingIncident);
            const shouldReroute =
              forcedHazardReroute ||
              Math.random() <
                (nearIncident
                  ? INCIDENT_REROUTE_PROBABILITY
                  : NORMAL_REROUTE_PROBABILITY);

            if (shouldReroute) {
              const target = getSafeHazardAwareTarget(
                {
                  lat: previousState.lat,
                  lng: previousState.lng,
                },
                disasterZones,
                incidentList,
              );

              queueDynamicReroute(
                unitId,
                target,
                forcedHazardReroute
                  ? "Forced hazard avoidance"
                  : nearIncident
                    ? "Hazard Avoidance Detour"
                    : "Dynamic Reroute",
                time,
              );
            }
          }

          const eased = {
            lat: previousState.lat + (nextPoint.lat - previousState.lat) * 0.28,
            lng: previousState.lng + (nextPoint.lng - previousState.lng) * 0.28,
          };
          markerStateRef.current[unitId] = eased;

          return {
            ...marker,
            lat: eased.lat,
            lng: eased.lng,
          };
        }

        // Units without routes orbit around their base point so they still move.
        const phase = time / 18 + markerIndex;
        const nextIdlePosition = {
          lat: marker.lat + Math.sin(phase) * 0.0014,
          lng: marker.lng + Math.cos(phase) * 0.0014,
        };
        const easedIdle = {
          lat:
            previousState.lat +
            (nextIdlePosition.lat - previousState.lat) * 0.2,
          lng:
            previousState.lng +
            (nextIdlePosition.lng - previousState.lng) * 0.2,
        };
        markerStateRef.current[unitId] = easedIdle;

        return {
          ...marker,
          lat: easedIdle.lat,
          lng: easedIdle.lng,
        };
      });

      const markerByUnitId = new Map(
        updatedMarkers.map((marker) => [
          marker.label.replace("Unit ", ""),
          marker,
        ]),
      );

      const updatedVehicles = baseVehicles.map((vehicle, vehicleIndex) => {
        const marker = markerByUnitId.get(vehicle.id);
        const route = routeByVehicleId.get(vehicle.id);
        const moving = Boolean(route && route.points.length > 1);
        const speedMetersPerSecond = moving
          ? 8 + ((time + vehicleIndex * 7) % 6)
          : 0;

        return {
          ...vehicle,
          lat: marker ? marker.lat : vehicle.lat,
          lng: marker ? marker.lng : vehicle.lng,
          speed: speedMetersPerSecond,
          state: moving ? "En Route" : vehicle.state,
          eta: moving ? `${2 + ((time + vehicleIndex) % 8)}m` : vehicle.eta,
        };
      });

      dispatch({ type: "SET_VEHICLES", payload: updatedVehicles });

      const heatmapData = calculateDisasterZoneHeatmapData(disasterZones);

      // Check each vehicle for disaster zone intersections
      for (const vehicle of updatedVehicles) {
        const route = routeByVehicleId.get(vehicle.id);
        if (route && route.points.length > 1) {
          const intersectingZone = routeIntersectsDisasterZone(
            route.points,
            disasterZones,
          );

          const nextAllowed =
            nextAllowedRerouteTickRef.current[vehicle.id] || 0;
          if (intersectingZone && time >= nextAllowed) {
            const currentPosition = {
              lat: vehicle.lat,
              lng: vehicle.lng,
            };
            const target = getSafeHazardAwareTarget(
              currentPosition,
              disasterZones,
              incidentList,
            );

            queueDynamicReroute(
              vehicle.id,
              target,
              `Disaster Zone Avoidance (${intersectingZone.title})`,
              time,
            );
          }
        }
      }

      dispatch({
        type: "UPDATE_MAP_DATA",
        payload: {
          markers: updatedMarkers,
          routes: [...activeRoutes, ...historicalRoutesRef.current],
          incidents: incidentList,
          disasterZones,
          heatmapData,
          tick: mockDataTickRef.current,
        },
      });
    }, 100); // 10 Hz update rate (same as backend)
  }, [
    INCIDENT_AVOID_DISTANCE_METERS,
    INCIDENT_REROUTE_PROBABILITY,
    INCIDENT_TARGET_BUFFER_METERS,
    NORMAL_REROUTE_PROBABILITY,
    REROUTE_CHECK_INTERVAL_TICKS,
    dispatch,
    flushDueDynamicReroutes,
    getPointAtDistance,
    minDistanceToIncidents,
    queueDynamicReroute,
    routeIntersectsDisasterZone,
    routeIntersectsIncidentZone,
    calculateDisasterZoneHeatmapData,
    handleRouteCompletion,
    getSafeHazardAwareTarget,
    buildIncidentFromRoute,
    buildDisasterZoneFromRoute,
    getRandomTickInterval,
    getTrafficMarkersSnapshot,
  ]);

  // Initialize with mock data if enabled or WebSocket not available
  useEffect(() => {
    if (!controller) {
      return undefined;
    }

    if (useMockData) {
      let cancelled = false;

      const setupMockRouting = async () => {
        const disasterZones = mockMapData.disasterZones || [];

        const seededMarkers = mockMapData.markers.map((marker) => {
          const spawn = getSafeSpawnPoint(disasterZones);
          return {
            ...marker,
            lat: spawn.lat,
            lng: spawn.lng,
            status: "Regular traffic in transit",
          };
        });

        const markerByVehicle = new Map(
          seededMarkers.map((marker) => [
            marker.label.replace("Unit ", ""),
            marker,
          ]),
        );

        const seededVehicles = mockVehicles.map((vehicle) => {
          const marker = markerByVehicle.get(vehicle.id);
          return {
            ...vehicle,
            lat: marker?.lat ?? vehicle.lat,
            lng: marker?.lng ?? vehicle.lng,
            state: "En Route",
            eta: "--",
            hasRoute: true,
          };
        });

        const routeColors = [
          "#22c55e",
          "#3b82f6",
          "#f59e0b",
          "#14b8a6",
          "#ef4444",
        ];
        const destinationByVehicleId = {};

        const routed = await Promise.all(
          seededVehicles.map(async (vehicle, index) => {
            const origin = { lat: vehicle.lat, lng: vehicle.lng };
            const destination = getSafeFarDestination(origin, disasterZones);
            destinationByVehicleId[vehicle.id] = destination;

            const route = await calculateDisasterAvoidanceRoute(
              vehicle.id,
              [origin.lat, origin.lng],
              [destination.lat, destination.lng],
              disasterZones,
            );

            return {
              ...route,
              id: `seed-${vehicle.id}`,
              vehicleId: vehicle.id,
              color: routeColors[index % routeColors.length],
              name: "Regular traffic route",
            };
          }),
        );

        if (cancelled) {
          return;
        }

        // Assign default destinations to all vehicles
        mockProgressRef.current = {};
        markerStateRef.current = {};
        historicalRoutesRef.current = [];
        routeTargetRef.current = {};
        nextAllowedRerouteTickRef.current = {};
        routeCompletedRef.current = {};
        routeLengthRef.current = {};
        pendingDynamicReroutesRef.current = {};
        dynamicIncidentsRef.current = (mockMapData.incidents || []).map(
          (incident) => ({
            ...incident,
            createdAtTick: 0,
            expiresAtTick: Number.POSITIVE_INFINITY,
            dynamic: false,
          }),
        );
        dynamicDisasterZonesRef.current = (mockMapData.disasterZones || []).map(
          (zone) => ({
            ...zone,
            createdAtTick: 0,
            expiresAtTick: Number.POSITIVE_INFINITY,
            dynamic: false,
          }),
        );
        nextIncidentSpawnTickRef.current = 90;
        nextDisasterSpawnTickRef.current = 240;
        dynamicEventCounterRef.current = 0;
        baseMarkersRef.current = seededMarkers;
        seedVehiclesRef.current = seededVehicles;

        // Initialize route targets
        for (const route of routed) {
          if (route?.vehicleId && route.points?.length) {
            const preferredDestination =
              destinationByVehicleId[route.vehicleId];
            const destination = preferredDestination
              ? [preferredDestination.lat, preferredDestination.lng]
              : route.points[route.points.length - 1];
            routeTargetRef.current[route.vehicleId] = {
              lat: destination[0],
              lng: destination[1],
            };
            nextAllowedRerouteTickRef.current[route.vehicleId] =
              REROUTE_COOLDOWN_TICKS;
          }
        }

        // Ensure ALL vehicles have destinations
        for (const vehicle of seededVehicles) {
          if (!routeTargetRef.current[vehicle.id]) {
            const defaultTarget = getSafeFarDestination(
              { lat: vehicle.lat, lng: vehicle.lng },
              disasterZones,
            );
            routeTargetRef.current[vehicle.id] = defaultTarget;
            nextAllowedRerouteTickRef.current[vehicle.id] =
              REROUTE_COOLDOWN_TICKS;
          }
        }

        mockRoutesRef.current = routed;

        dispatch({ type: "SET_VEHICLES", payload: seededVehicles });
        dispatch({
          type: "UPDATE_MAP_DATA",
          payload: {
            ...mockMapData,
            markers: seededMarkers,
            routes: routed,
            incidents: dynamicIncidentsRef.current,
            disasterZones: dynamicDisasterZonesRef.current,
          },
        });

        mockAlerts
          .slice()
          .reverse()
          .forEach((alert) =>
            dispatch({ type: "ADD_ALERT", payload: alert.message }),
          );
        mockTimeline
          .slice()
          .reverse()
          .forEach((event) =>
            dispatch({
              type: "ADD_TIMELINE_EVENT",
              payload: {
                event: event.event,
                vehicleId: event.vehicleId,
                details: event.details,
              },
            }),
          );

        startMockDataSimulation();
      };

      setupMockRouting();

      return () => {
        cancelled = true;
        mockSimulationActiveRef.current = false;
        historicalRoutesRef.current = [];
        routeTargetRef.current = {};
        nextAllowedRerouteTickRef.current = {};
        routeCompletedRef.current = {};
        routeLengthRef.current = {};
        pendingDynamicReroutesRef.current = {};
        dynamicIncidentsRef.current = [];
        dynamicDisasterZonesRef.current = [];
        baseMarkersRef.current = mockMapData.markers;
        seedVehiclesRef.current = mockVehicles;
      };
    }

    mockSimulationActiveRef.current = false;
    historicalRoutesRef.current = [];
    routeTargetRef.current = {};
    nextAllowedRerouteTickRef.current = {};
    pendingDynamicReroutesRef.current = {};
    dynamicIncidentsRef.current = [];
    dynamicDisasterZonesRef.current = [];
    return undefined;
  }, [
    REROUTE_COOLDOWN_TICKS,
    controller,
    useMockData,
    dispatch,
    fetchRoadSnappedRoute,
    startMockDataSimulation,
    getNextDispatchTarget,
    calculateDisasterAvoidanceRoute,
    getSafeFarDestination,
    getSafeSpawnPoint,
  ]);

  const buildRouteSignature = useCallback((route) => {
    const points = route?.points || [];
    const first = points[0] || [];
    const last = points[points.length - 1] || [];

    return [
      route?.id || "",
      points.length,
      Number(first[0] || 0).toFixed(5),
      Number(first[1] || 0).toFixed(5),
      Number(last[0] || 0).toFixed(5),
      Number(last[1] || 0).toFixed(5),
    ].join("|");
  }, []);

  const processDynamicEvents = useCallback(
    (snapshot) => {
      if (!snapshot) {
        return;
      }

      const incidents = snapshot.incidents || [];
      for (const incident of incidents) {
        if (!incident?.id || knownIncidentIdsRef.current.has(incident.id)) {
          continue;
        }

        knownIncidentIdsRef.current.add(incident.id);
        const title = incident.title || incident.id;
        dispatch({
          type: "ADD_TIMELINE_EVENT",
          payload: {
            event: "Incident detected",
            vehicleId: null,
            details: `${title} triggered reroute monitoring`,
            category: "dynamic",
            severity: "warning",
          },
        });
        dispatch({
          type: "ADD_ALERT",
          payload: `Incident detected: ${title}`,
        });
      }

      const disasterZones = snapshot.disasterZones || [];
      for (const zone of disasterZones) {
        if (!zone?.id || knownDisasterIdsRef.current.has(zone.id)) {
          continue;
        }

        knownDisasterIdsRef.current.add(zone.id);
        const title = zone.title || zone.id;
        dispatch({
          type: "ADD_TIMELINE_EVENT",
          payload: {
            event: "Disaster zone activated",
            vehicleId: null,
            details: `${title} - adaptive traffic rerouting engaged`,
            category: "dynamic",
            severity: "critical",
          },
        });
        dispatch({
          type: "ADD_ALERT",
          payload: `Disaster event: ${title}`,
        });
      }

      const tickNow = Number(snapshot.tick || 0);
      const routes = snapshot.routes || [];
      for (const route of routes) {
        const vehicleId =
          route?.vehicle_id || route?.vehicleId || route?.id || "unknown";
        const signature = buildRouteSignature(route);
        const previousSignature = routeSignatureRef.current[vehicleId];

        routeSignatureRef.current[vehicleId] = signature;
        if (!previousSignature || previousSignature === signature) {
          continue;
        }

        const nextAllowedTick = lastRouteEventTickRef.current[vehicleId] || 0;
        if (tickNow < nextAllowedTick) {
          continue;
        }

        lastRouteEventTickRef.current[vehicleId] = tickNow + 25;
        dispatch({
          type: "ADD_TIMELINE_EVENT",
          payload: {
            event: "Traffic reroute updated",
            vehicleId,
            details: `Route ${route?.id || "updated"} recalculated due to network conditions`,
            category: "dynamic",
            severity: "info",
          },
        });
      }
    },
    [buildRouteSignature, dispatch],
  );

  // Connect to WebSocket
  const connectWebSocket = useCallback(() => {
    if (wsRef.current) return;

    try {
      wsRef.current = new WebSocket(`${backendWsUrl}/ws/simulation`);

      wsRef.current.onopen = () => {
        console.log("WebSocket connected to simulation backend");
        dispatch({ type: "SET_CONNECTION_STATUS", payload: true });
      };

      wsRef.current.onmessage = (event) => {
        try {
          const snapshot = JSON.parse(event.data);

          if (
            snapshot.type === "simulation_snapshot" ||
            snapshot.type === "snapshot"
          ) {
            // Extract vehicles from markers for state management
            const vehiclesFromMarkers =
              snapshot.markers?.map((marker) => ({
                id: marker.label.split(" ")[1], // Extract "U-102" from "Unit U-102"
                lat: marker.lat,
                lng: marker.lng,
                speed: marker.speed || 0,
                state: marker.status || "Unknown",
                type: marker.type || "Unknown",
              })) || [];

            dispatch({ type: "SET_VEHICLES", payload: vehiclesFromMarkers });
            dispatch({
              type: "UPDATE_MAP_DATA",
              payload: {
                markers: snapshot.markers,
                routes: snapshot.routes || [],
                incidents: snapshot.incidents || [],
                disasterZones: snapshot.disasterZones || [],
                center: snapshot.center,
                tick: snapshot.tick,
              },
            });

            processDynamicEvents(snapshot);

            if (snapshot.stats?.scenario_active) {
              dispatch({
                type: "SET_SCENARIO_ACTIVE",
                payload: snapshot.stats.scenario_active,
              });
            }
          }
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        dispatch({ type: "SET_CONNECTION_STATUS", payload: false });
      };

      wsRef.current.onclose = () => {
        console.log("WebSocket disconnected");
        dispatch({ type: "SET_CONNECTION_STATUS", payload: false });
        wsRef.current = null;

        // Attempt reconnect in 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("Attempting to reconnect to WebSocket...");
          connectWebSocket();
        }, 3000);
      };
    } catch (error) {
      console.error("Failed to connect WebSocket:", error);
      dispatch({ type: "SET_CONNECTION_STATUS", payload: false });

      // Retry connection
      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, 3000);
    }
  }, [dispatch, backendWsUrl, processDynamicEvents]);

  // Auto-connect on mount if not using mock data
  useEffect(() => {
    if (!controller) {
      return undefined;
    }

    if (!useMockData) {
      connectWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
      }
    };
  }, [controller, useMockData, connectWebSocket]);

  // Helper: Select/deselect vehicle
  const selectVehicle = useCallback(
    (vehicleId) => {
      dispatch({ type: "VEHICLE_SELECT", payload: vehicleId });
    },
    [dispatch],
  );

  const deselectVehicle = useCallback(() => {
    dispatch({ type: "VEHICLE_DESELECT" });
  }, [dispatch]);

  // Helper: Add alert
  const addAlert = useCallback(
    (message) => {
      dispatch({ type: "ADD_ALERT", payload: message });
    },
    [dispatch],
  );

  // Helper: Add timeline event
  const addTimelineEvent = useCallback(
    (event, vehicleId, details) => {
      dispatch({
        type: "ADD_TIMELINE_EVENT",
        payload: { event, vehicleId, details },
      });
    },
    [dispatch],
  );

  // Helper: In mock mode, reroute a vehicle toward a specific coordinate.
  const rerouteVehicleToCoordinate = useCallback(
    (vehicleId, lat, lng, reason = "Manual destination reroute") =>
      requestMockRerouteToLocation(
        vehicleId,
        { lat, lng },
        reason,
        mockDataTickRef.current,
      ),
    [requestMockRerouteToLocation],
  );

  // Helper: Send command to backend
  const sendCommand = useCallback(
    async (endpoint, method = "POST", body = {}) => {
      try {
        const response = await fetch(`${backendBaseUrl}${endpoint}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: method !== "GET" ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        console.error("API call failed:", error);
        throw error;
      }
    },
    [backendBaseUrl],
  );

  return {
    // State
    state,
    vehicles: state.vehicles,
    selectedVehicleId: state.selectedVehicleId,
    selectedVehicle:
      state.vehicles.find((v) => v.id === state.selectedVehicleId) || null,
    mapData: state.mapData,
    connected: state.connected,
    isPaused: state.isPaused,
    scenarioActive: state.scenarioActive,
    alerts: state.alerts,
    timeline: state.timeline,
    routeSuggestions: state.routeSuggestions,

    // Actions
    selectVehicle,
    deselectVehicle,
    addAlert,
    addTimelineEvent,
    rerouteVehicleToCoordinate,
    sendCommand,
    dispatch,

    // Disaster zone utilities
    routeIntersectsDisasterZone,
    calculateDisasterZoneHeatmapData,
    calculateDisasterAvoidanceRoute,
    minDistanceToDisasterZone,
  };
};
