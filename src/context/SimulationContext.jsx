import React, { createContext, useReducer } from "react";

const SimulationContext = createContext();

const initialState = {
  // Vehicle data
  vehicles: [],
  selectedVehicleId: null,

  // Map data
  mapData: {
    center: [-1.286389, 36.817223],
    zoom: 13,
    markers: [],
    routes: [],
    incidents: [],
    disasterZones: [],
    heatmapData: [],
  },

  // Simulation state
  connected: false,
  tick: 0,
  isPaused: false,
  scenarioActive: false,

  // Alerts and timeline
  alerts: [],
  timeline: [],

  // Dispatcher suggestions
  routeSuggestions: [],
  speedRecommendation: null,
};

const simulationReducer = (state, action) => {
  switch (action.type) {
    // Map and vehicle updates from WebSocket
    case "UPDATE_MAP_DATA":
      return {
        ...state,
        mapData: {
          ...state.mapData,
          markers: action.payload.markers || state.mapData.markers,
          routes: action.payload.routes || state.mapData.routes,
          incidents: action.payload.incidents || state.mapData.incidents,
          disasterZones:
            action.payload.disasterZones || state.mapData.disasterZones,
          heatmapData: action.payload.heatmapData || state.mapData.heatmapData,
          center: action.payload.center || state.mapData.center,
        },
        tick: action.payload.tick || state.tick,
      };

    case "SET_VEHICLES":
      return {
        ...state,
        vehicles: action.payload,
      };

    case "VEHICLE_SELECT":
      return {
        ...state,
        selectedVehicleId: action.payload,
      };

    case "VEHICLE_DESELECT":
      return {
        ...state,
        selectedVehicleId: null,
      };

    case "SET_CONNECTION_STATUS":
      return {
        ...state,
        connected: action.payload,
      };

    case "SET_SCENARIO_ACTIVE":
      return {
        ...state,
        scenarioActive: action.payload,
      };

    case "SET_PAUSED":
      return {
        ...state,
        isPaused: action.payload,
      };

    case "ADD_ALERT":
      return {
        ...state,
        alerts: [
          {
            id: Date.now(),
            timestamp: new Date(),
            message: action.payload,
          },
          ...state.alerts,
        ].slice(0, 20), // Keep last 20 alerts
      };

    case "CLEAR_ALERTS":
      return {
        ...state,
        alerts: [],
      };

    case "SET_ROUTE_SUGGESTIONS":
      return {
        ...state,
        routeSuggestions: action.payload,
      };

    case "SET_SPEED_RECOMMENDATION":
      return {
        ...state,
        speedRecommendation: action.payload,
      };

    case "ADD_TIMELINE_EVENT":
      return {
        ...state,
        timeline: [
          {
            id: Date.now(),
            timestamp: new Date(),
            event: action.payload.event,
            vehicleId: action.payload.vehicleId,
            details: action.payload.details,
          },
          ...state.timeline,
        ].slice(0, 50), // Keep last 50 events
      };

    case "RESET_STATE":
      return initialState;

    default:
      return state;
  }
};

export const SimulationProvider = ({ children }) => {
  const [state, dispatch] = useReducer(simulationReducer, initialState);

  return (
    <SimulationContext.Provider value={{ state, dispatch }}>
      {children}
    </SimulationContext.Provider>
  );
};

export { SimulationContext };
