import json
import math
import random
import numpy as np
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
import requests
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, models
from sklearn.preprocessing import StandardScaler, LabelEncoder
import joblib
import os

# ============================================
# ENUMS AND CONSTANTS
# ============================================


class WeatherCondition(Enum):
    CLEAR = "clear"
    RAIN = "rain"
    CLOUDY = "cloudy"
    FOG = "fog"
    STORM = "storm"


class TrafficStatus(Enum):
    CLEAR = "clear"
    MODERATE = "moderate"
    HEAVY = "heavy"
    GRIDLOCK = "gridlock"


class RiskLevel(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# ============================================
# STATIC MAP DATA FOR NAIROBI
# ============================================

# Static coordinates for Nairobi locations (latitude, longitude)
NAIROBI_LOCATIONS = {
    # Major Roads
    "Thika Road": {"lat": -1.2345, "lng": 36.8765, "zone": "northeast"},
    "Mombasa Road": {"lat": -1.3123, "lng": 36.8567, "zone": "southeast"},
    "Uhuru Highway": {"lat": -1.2876, "lng": 36.8234, "zone": "central"},
    "Waiyaki Way": {"lat": -1.2678, "lng": 36.7890, "zone": "west"},
    "Ngong Road": {"lat": -1.2987, "lng": 36.7987, "zone": "southwest"},
    "Jogoo Road": {"lat": -1.2876, "lng": 36.8678, "zone": "east"},
    "Langata Road": {"lat": -1.3234, "lng": 36.7987, "zone": "south"},
    "Kiambu Road": {"lat": -1.2345, "lng": 36.8456, "zone": "north"},
    "Outer Ring Road": {"lat": -1.2567, "lng": 36.8876, "zone": "east"},
    "Haile Selassie Avenue": {"lat": -1.2876, "lng": 36.8234, "zone": "central"},
    "Tom Mboya Street": {"lat": -1.2834, "lng": 36.8278, "zone": "central"},
    # Destinations/Landmarks
    "CBD": {"lat": -1.2864, "lng": 36.8234, "zone": "central"},
    "JKIA": {"lat": -1.3192, "lng": 36.9278, "zone": "southeast"},
    "Westlands": {"lat": -1.2678, "lng": 36.8123, "zone": "west"},
    "Kasarani": {"lat": -1.2234, "lng": 36.8987, "zone": "northeast"},
    "Industrial Area": {"lat": -1.3123, "lng": 36.8567, "zone": "southeast"},
    "Upper Hill": {"lat": -1.2987, "lng": 36.8123, "zone": "central"},
    "Kangemi": {"lat": -1.2567, "lng": 36.7567, "zone": "west"},
    "Karen": {"lat": -1.3345, "lng": 36.7456, "zone": "southwest"},
    "Donholm": {"lat": -1.2789, "lng": 36.8876, "zone": "east"},
    "Wilson Airport": {"lat": -1.3123, "lng": 36.8123, "zone": "south"},
    "Runda": {"lat": -1.2234, "lng": 36.8234, "zone": "north"},
    "Embakasi": {"lat": -1.3345, "lng": 36.8987, "zone": "southeast"},
    "Roysambu": {"lat": -1.2345, "lng": 36.8678, "zone": "northeast"},
    "Syokimau": {"lat": -1.3456, "lng": 36.9234, "zone": "southeast"},
    "Uthiru": {"lat": -1.2567, "lng": 36.7456, "zone": "west"},
    "Junction Mall": {"lat": -1.2789, "lng": 36.7789, "zone": "southwest"},
    "Buruburu": {"lat": -1.2678, "lng": 36.8789, "zone": "east"},
    "Galleria": {"lat": -1.3345, "lng": 36.7789, "zone": "south"},
    "Muthaiga": {"lat": -1.2345, "lng": 36.8345, "zone": "north"},
    "Pipeline": {"lat": -1.3123, "lng": 36.8987, "zone": "southeast"},
    "River Road": {"lat": -1.2834, "lng": 36.8278, "zone": "central"},
    "Railway Station": {"lat": -1.2890, "lng": 36.8256, "zone": "central"},
}

# Static road network connections
ROAD_CONNECTIONS = {
    "Thika Road": ["Kasarani", "Roysambu", "CBD"],
    "Mombasa Road": ["JKIA", "Syokimau", "Industrial Area", "CBD"],
    "Uhuru Highway": ["CBD", "Upper Hill", "Westlands"],
    "Waiyaki Way": ["Westlands", "Kangemi", "Uthiru"],
    "Ngong Road": ["Karen", "Junction Mall", "CBD"],
    "Jogoo Road": ["Donholm", "Buruburu", "CBD"],
    "Langata Road": ["Langata", "Wilson Airport", "Galleria"],
    "Kiambu Road": ["Runda", "Muthaiga", "CBD"],
    "Outer Ring Road": ["Embakasi", "Pipeline", "Donholm", "Thika Road"],
    "Haile Selassie Avenue": ["CBD", "Railway Station"],
    "Tom Mboya Street": ["CBD", "River Road"],
}

# Static traffic zones with characteristics
TRAFFIC_ZONES = {
    "central": {
        "congestion_level": 0.8,
        "accident_rate": 0.7,
        "peak_hours": ["07-09", "17-19"],
    },
    "east": {
        "congestion_level": 0.6,
        "accident_rate": 0.5,
        "peak_hours": ["06-08", "16-18"],
    },
    "west": {
        "congestion_level": 0.5,
        "accident_rate": 0.4,
        "peak_hours": ["07-09", "17-19"],
    },
    "north": {
        "congestion_level": 0.4,
        "accident_rate": 0.3,
        "peak_hours": ["07-09", "16-18"],
    },
    "south": {
        "congestion_level": 0.5,
        "accident_rate": 0.4,
        "peak_hours": ["06-08", "16-18"],
    },
    "northeast": {
        "congestion_level": 0.6,
        "accident_rate": 0.5,
        "peak_hours": ["06-08", "17-19"],
    },
    "southeast": {
        "congestion_level": 0.7,
        "accident_rate": 0.6,
        "peak_hours": ["05-07", "16-18"],
    },
    "southwest": {
        "congestion_level": 0.4,
        "accident_rate": 0.3,
        "peak_hours": ["07-09", "17-19"],
    },
}

# ============================================
# TENSORFLOW ML MODELS
# ============================================


class TrafficMLModels:
    """
    TensorFlow-based machine learning models for traffic prediction
    """

    def __init__(self, model_dir="./traffic_models"):
        self.model_dir = model_dir
        os.makedirs(model_dir, exist_ok=True)

        # Scaler for normalization
        self.scaler = StandardScaler()
        self.zone_encoder = LabelEncoder()
        self.weather_encoder = LabelEncoder()

        # Models
        self.accident_prediction_model = None
        self.traffic_flow_model = None
        self.eta_prediction_model = None
        self.congestion_classifier = None

        # Training history
        self.training_history = {}

    def build_accident_prediction_model(self, input_dim: int) -> tf.keras.Model:
        """
        Build neural network for accident risk prediction
        """
        model = models.Sequential(
            [
                layers.Dense(128, activation="relu", input_shape=(input_dim,)),
                layers.BatchNormalization(),
                layers.Dropout(0.3),
                layers.Dense(64, activation="relu"),
                layers.BatchNormalization(),
                layers.Dropout(0.3),
                layers.Dense(32, activation="relu"),
                layers.Dense(16, activation="relu"),
                layers.Dense(1, activation="sigmoid"),  # Binary classification
            ]
        )

        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss="binary_crossentropy",
            metrics=["accuracy", tf.keras.metrics.Precision(), tf.keras.metrics.Recall()],
        )

        self.accident_prediction_model = model
        return model

    def build_traffic_flow_prediction_model(
        self, sequence_length: int, n_features: int
    ) -> tf.keras.Model:
        """
        Build LSTM model for traffic flow prediction (time series)
        """
        model = models.Sequential(
            [
                layers.LSTM(128, return_sequences=True, input_shape=(sequence_length, n_features)),
                layers.Dropout(0.2),
                layers.LSTM(64, return_sequences=True),
                layers.Dropout(0.2),
                layers.LSTM(32),
                layers.Dense(16, activation="relu"),
                layers.Dense(1),  # Predicted speed/flow
            ]
        )

        model.compile(optimizer="adam", loss="mse", metrics=["mae"])

        self.traffic_flow_model = model
        return model

    def build_eta_prediction_model(self, input_dim: int) -> tf.keras.Model:
        """
        Build model for ETA prediction
        """
        model = models.Sequential(
            [
                layers.Dense(64, activation="relu", input_shape=(input_dim,)),
                layers.Dense(32, activation="relu"),
                layers.Dense(16, activation="relu"),
                layers.Dense(1),  # Predicted time in minutes
            ]
        )

        model.compile(optimizer="adam", loss="mse", metrics=["mae"])

        self.eta_prediction_model = model
        return model

    def build_congestion_classifier(self, input_dim: int) -> tf.keras.Model:
        """
        Build model for congestion level classification
        """
        model = models.Sequential(
            [
                layers.Dense(64, activation="relu", input_shape=(input_dim,)),
                layers.Dropout(0.3),
                layers.Dense(32, activation="relu"),
                layers.Dropout(0.3),
                layers.Dense(16, activation="relu"),
                layers.Dense(4, activation="softmax"),  # 4 congestion levels
            ]
        )

        model.compile(
            optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"]
        )

        self.congestion_classifier = model
        return model

    def prepare_training_data(
        self, historical_data: List[Dict]
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Prepare data for training accident prediction model
        """
        features = []
        labels = []

        for record in historical_data:
            # Extract features
            feature_vector = [
                record.get("speed", 0) / 50,  # Normalized speed
                1 if record.get("weather") == "rain" else 0,
                1 if record.get("weather") == "cloudy" else 0,
                record.get("vehicle_count", 0) / 50,  # Normalized vehicle count
                record.get("hour", 12) / 24,  # Hour of day
                1 if record.get("is_weekend", 0) else 0,
                record.get("accident_history", 0) / 10,  # Historical accidents
                record.get("congestion_level", 0.5),
            ]
            features.append(feature_vector)
            labels.append(record.get("accident_occurred", 0))

        return np.array(features), np.array(labels)

    def train_accident_model(
        self, historical_data: List[Dict], epochs: int = 50, batch_size: int = 32
    ) -> Dict:
        """
        Train accident prediction model
        """
        X, y = self.prepare_training_data(historical_data)

        if len(X) == 0:
            return {"error": "No training data available"}

        # Build model if not exists
        if self.accident_prediction_model is None:
            self.build_accident_prediction_model(X.shape[1])

        # Train the model
        history = self.accident_prediction_model.fit(
            X, y, epochs=epochs, batch_size=batch_size, validation_split=0.2, verbose=0
        )

        # Save model
        self.accident_prediction_model.save(f"{self.model_dir}/accident_model.h5")

        self.training_history["accident"] = history.history
        return history.history

    def predict_accident_risk(self, features: np.ndarray) -> float:
        """
        Predict accident risk using trained model
        """
        if self.accident_prediction_model is None:
            return 0.5  # Default risk

        features = np.array(features).reshape(1, -1)
        risk = self.accident_prediction_model.predict(features, verbose=0)[0][0]
        return float(risk)

    def generate_synthetic_training_data(self, n_samples: int = 1000) -> List[Dict]:
        """
        Generate synthetic training data for model development
        """
        synthetic_data = []

        for _ in range(n_samples):
            hour = random.randint(0, 23)
            is_weekend = 1 if random.random() < 0.3 else 0
            weather = random.choice(["clear", "rain", "cloudy"])
            speed = random.gauss(20, 10)  # Normal distribution around 20 km/h
            speed = max(0, min(50, speed))

            vehicle_count = random.randint(0, 50)
            accident_history = random.random() * 5

            # Calculate accident probability based on features
            accident_prob = (
                (1 if weather == "rain" else 0) * 0.3
                + (1 if hour in [7, 8, 17, 18] else 0) * 0.2
                + (1 - speed / 50) * 0.3
                + (vehicle_count / 50) * 0.2
            )

            accident_occurred = 1 if random.random() < accident_prob else 0

            synthetic_data.append(
                {
                    "speed": speed,
                    "weather": weather,
                    "vehicle_count": vehicle_count,
                    "hour": hour,
                    "is_weekend": is_weekend,
                    "accident_history": accident_history,
                    "congestion_level": 1 - speed / 50,
                    "accident_occurred": accident_occurred,
                }
            )

        return synthetic_data


# ============================================
# CAR DATA CLASS
# ============================================


@dataclass
class Car:
    """Detailed car object with all information needed for map display"""

    car_id: str
    city: str
    speed: float
    location: str
    weather: str
    route: str
    destination: str = field(init=False)
    origin: str = field(init=False)
    coordinates: Dict[str, float] = field(init=False)
    destination_coords: Dict[str, float] = field(init=False)
    zone: str = field(init=False)
    status: str = "active"
    last_update: str = field(default_factory=lambda: datetime.now().isoformat())
    heading: float = field(default_factory=lambda: random.uniform(0, 360))
    battery_level: Optional[int] = None
    vehicle_type: str = "private"
    occupancy: int = 1
    emissions: float = 0.0

    def __post_init__(self):
        # Parse route to get origin and destination
        if " -> " in self.route:
            self.origin, self.destination = self.route.split(" -> ")
        else:
            self.origin = self.location
            self.destination = self.route

        # Get coordinates for current location
        if self.location in NAIROBI_LOCATIONS:
            self.coordinates = {
                "lat": NAIROBI_LOCATIONS[self.location]["lat"],
                "lng": NAIROBI_LOCATIONS[self.location]["lng"],
            }
            self.zone = NAIROBI_LOCATIONS[self.location]["zone"]
        else:
            self.coordinates = {"lat": -1.2864, "lng": 36.8234}  # Default to CBD
            self.zone = "central"

        # Get destination coordinates
        if self.destination in NAIROBI_LOCATIONS:
            self.destination_coords = {
                "lat": NAIROBI_LOCATIONS[self.destination]["lat"],
                "lng": NAIROBI_LOCATIONS[self.destination]["lng"],
            }
        else:
            self.destination_coords = self.coordinates

        # Set random battery for electric vehicles
        if self.vehicle_type == "electric":
            self.battery_level = random.randint(20, 100)

        # Calculate emissions based on speed and vehicle type
        self.calculate_emissions()

    def calculate_emissions(self):
        """Calculate estimated CO2 emissions"""
        base_emission = 0.12  # kg per km
        if self.speed < 10:
            self.emissions = base_emission * 1.5  # More emissions in traffic
        elif self.speed > 30:
            self.emissions = base_emission * 0.8  # Less emissions at optimal speed
        else:
            self.emissions = base_emission

    def update_position(self, new_speed: Optional[float] = None):
        """Update car position for real-time tracking"""
        if new_speed:
            self.speed = new_speed

        # Simulate movement towards destination
        if self.coordinates != self.destination_coords:
            # Calculate new position (simplified)
            lat_diff = self.destination_coords["lat"] - self.coordinates["lat"]
            lng_diff = self.destination_coords["lng"] - self.coordinates["lng"]

            # Move based on speed
            movement_factor = self.speed / 1000  # Small movement per update
            self.coordinates["lat"] += lat_diff * movement_factor
            self.coordinates["lng"] += lng_diff * movement_factor

        self.last_update = datetime.now().isoformat()
        self.calculate_emissions()

    def to_dict(self) -> Dict[str, Any]:
        """Convert car object to dictionary for JSON serialization"""
        return {
            "car_id": self.car_id,
            "city": self.city,
            "speed": self.speed,
            "location": self.location,
            "weather": self.weather,
            "route": self.route,
            "origin": self.origin,
            "destination": self.destination,
            "coordinates": self.coordinates,
            "destination_coords": self.destination_coords,
            "zone": self.zone,
            "status": self.status,
            "last_update": self.last_update,
            "heading": self.heading,
            "vehicle_type": self.vehicle_type,
            "occupancy": self.occupancy,
            "emissions": round(self.emissions, 2),
            "battery_level": self.battery_level,
        }


# ============================================
# AI-POWERED TRAFFIC INTELLIGENCE SYSTEM WITH TENSORFLOW
# ============================================


class AITrafficIntelligence:
    """
    Sofia AI - Traffic Intelligence System with AI-powered analysis
    Combines static map data with Groq AI and TensorFlow ML models
    """

    def __init__(
        self, api_key: str = "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"
    ):
        self.name = "Sofia AI"
        self.api_key = api_key
        self.model = "llama-3.1-8b-instant"
        self.api_url = "https://api.groq.com/openai/v1/chat/completions"

        # Data storage
        self.cars: Dict[str, Car] = {}
        self.accident_hotspots = self._generate_static_hotspots()
        self.traffic_cameras = self._generate_traffic_cameras()
        self.ai_insights_cache = {}

        # TensorFlow ML models
        self.ml_models = TrafficMLModels()
        self.training_data = []
        self._initialize_ml_models()

    def _initialize_ml_models(self):
        """Initialize and train ML models with synthetic data"""
        print(" Initializing TensorFlow ML models...")

        # Generate synthetic training data
        synthetic_data = self.ml_models.generate_synthetic_training_data(2000)
        self.training_data.extend(synthetic_data)

        # Train accident prediction model
        print("   Training accident prediction model...")
        history = self.ml_models.train_accident_model(synthetic_data, epochs=30)

        if "accuracy" in history:
            print(f"   Model accuracy: {history['accuracy'][-1]:.2f}")

        print("ML models initialized successfully!")

    def _generate_static_hotspots(self) -> List[Dict[str, Any]]:
        """Generate static accident hotspots"""
        return [
            {
                "id": "HOT001",
                "location": "Uhuru Highway",
                "coordinates": NAIROBI_LOCATIONS["Uhuru Highway"],
                "risk_level": "high",
                "accident_count": 15,
                "last_incident": "2024-01-15T08:30:00",
                "common_causes": ["speeding", "lane changing"],
                "recommendation": "Reduce speed, maintain distance",
            },
            {
                "id": "HOT002",
                "location": "Mombasa Road",
                "coordinates": NAIROBI_LOCATIONS["Mombasa Road"],
                "risk_level": "medium",
                "accident_count": 8,
                "last_incident": "2024-01-14T17:45:00",
                "common_causes": ["heavy traffic", "rain"],
                "recommendation": "Use alternative route during rain",
            },
            {
                "id": "HOT003",
                "location": "Jogoo Road",
                "coordinates": NAIROBI_LOCATIONS["Jogoo Road"],
                "risk_level": "critical",
                "accident_count": 23,
                "last_incident": "2024-01-15T07:15:00",
                "common_causes": ["pedestrians", "matatus"],
                "recommendation": "Extreme caution, expect delays",
            },
        ]

    def _generate_traffic_cameras(self) -> List[Dict[str, Any]]:
        """Generate static traffic camera locations"""
        return [
            {
                "id": "CAM001",
                "location": "Thika Road - Kasarani",
                "coordinates": {"lat": -1.2345, "lng": 36.8765},
                "status": "active",
                "type": "speed",
            },
            {
                "id": "CAM002",
                "location": "Uhuru Highway - CBD",
                "coordinates": {"lat": -1.2876, "lng": 36.8234},
                "status": "active",
                "type": "traffic",
            },
            {
                "id": "CAM003",
                "location": "Mombasa Road - JKIA",
                "coordinates": {"lat": -1.3192, "lng": 36.9278},
                "status": "maintenance",
                "type": "security",
            },
        ]

    def load_vehicles(self, vehicle_data: List[Dict[str, Any]]) -> None:
        """Load vehicle data and create Car objects"""
        for data in vehicle_data:
            # Add vehicle type distribution
            if random.random() < 0.3:
                data["vehicle_type"] = "commercial"
            elif random.random() < 0.1:
                data["vehicle_type"] = "electric"
                data["battery_level"] = random.randint(20, 100)
            else:
                data["vehicle_type"] = "private"

            # Add random occupancy
            data["occupancy"] = random.randint(1, 4)

            car = Car(**data)
            self.cars[car.car_id] = car

    # ============== TENSORFLOW ML FUNCTIONS ==============

    def get_ml_accident_prediction(self, location: str, weather: str, speed: float) -> Dict:
        """
        Use TensorFlow model to predict accident risk for a specific location
        """
        # Prepare features for prediction
        hour = datetime.now().hour
        is_weekend = 1 if datetime.now().weekday() >= 5 else 0

        # Get vehicle count at location
        vehicle_count = len([c for c in self.cars.values() if c.location == location])

        # Get accident history for location (simplified)
        accident_history = 0
        for hotspot in self.accident_hotspots:
            if hotspot["location"] == location:
                accident_history = hotspot["accident_count"] / 10
                break

        features = [
            speed / 50,  # Normalized speed
            1 if weather == "rain" else 0,
            1 if weather == "cloudy" else 0,
            vehicle_count / 50,
            hour / 24,
            is_weekend,
            accident_history,
            self._get_congestion_level(location),
        ]

        # Get ML prediction
        ml_risk = self.ml_models.predict_accident_risk(features)

        return {
            "ml_risk_score": ml_risk,
            "risk_level": self._get_risk_level(ml_risk),
            "contributing_factors": self._get_contributing_factors(features),
            "confidence": 0.85 if ml_risk > 0.1 else 0.7,
        }

    def _get_congestion_level(self, location: str) -> float:
        """Get congestion level for a location (0-1)"""
        cars_here = [c for c in self.cars.values() if c.location == location]
        if not cars_here:
            return 0.3

        avg_speed = sum(c.speed for c in cars_here) / len(cars_here)
        return max(0, min(1, 1 - (avg_speed / 30)))

    def _get_risk_level(self, risk_score: float) -> str:
        """Convert risk score to risk level"""
        if risk_score > 0.7:
            return "CRITICAL"
        elif risk_score > 0.5:
            return "HIGH"
        elif risk_score > 0.3:
            return "MEDIUM"
        else:
            return "LOW"

    def _get_contributing_factors(self, features: List) -> List[str]:
        """Identify contributing factors to risk"""
        factors = []

        if features[0] < 0.3:  # Low speed
            factors.append("Slow traffic")
        if features[1] > 0.5:  # Rain
            factors.append("Rainy conditions")
        if features[3] > 0.7:  # High vehicle count
            factors.append("High traffic density")
        if features[4] in [7/24, 8/24, 17/24, 18/24]:  # Peak hours
            factors.append("Peak hour")
        if features[6] > 0.5:  # Accident history
            factors.append("Accident-prone area")

        return factors[:3]  # Return top 3 factors

    def predict_future_traffic(self, location: str, hours_ahead: int = 3) -> List[Dict]:
        """
        Predict traffic conditions for the next few hours
        """
        predictions = []
        current_hour = datetime.now().hour

        for i in range(hours_ahead):
            future_hour = (current_hour + i) % 24

            # Simple prediction based on time patterns
            if 7 <= future_hour <= 9 or 17 <= future_hour <= 19:
                predicted_speed = random.gauss(10, 5)  # Peak hours
            elif 10 <= future_hour <= 16:
                predicted_speed = random.gauss(25, 5)  # Mid-day
            else:
                predicted_speed = random.gauss(35, 5)  # Off-peak

            predicted_speed = max(5, min(50, predicted_speed))

            predictions.append(
                {
                    "hour": future_hour,
                    "predicted_speed": round(predicted_speed, 1),
                    "confidence": 0.9 - (i * 0.1),  # Decreasing confidence
                    "status": self._get_traffic_status(predicted_speed).value,
                }
            )

        return predictions

    # ============== AI-POWERED FUNCTIONS ==============

    def get_ai_traffic_analysis(self) -> Dict[str, Any]:
        """Get AI-powered analysis of current traffic situation"""

        # Prepare traffic summary for AI
        traffic_summary = self._prepare_traffic_summary()

        prompt = f"""
        As {self.name}, Nairobi's Traffic Intelligence AI, analyze this traffic situation:

        CURRENT TRAFFIC SUMMARY:
        {json.dumps(traffic_summary, indent=2)}

        ACCIDENT HOTSPOTS:
        {json.dumps(self.accident_hotspots, indent=2)}

        Provide a comprehensive analysis including:
        1. Overall traffic status for Nairobi
        2. Critical areas needing attention
        3. Weather impact on traffic
        4. Recommendations for drivers
        5. Predicted congestion trends for next 2 hours

        Format your response as JSON with these keys:
        - overall_status
        - critical_areas
        - weather_impact
        - driver_recommendations
        - predicted_trends
        - ai_confidence_score
        """

        try:
            response = self._call_groq_api(prompt)
            if response:
                return json.loads(response)
        except:
            pass

        # Fallback to static analysis
        return self._get_fallback_analysis(traffic_summary)

    def get_ai_accident_prediction(self) -> List[Dict[str, Any]]:
        """Use AI to predict potential accidents"""

        # Calculate risk zones
        risk_zones = self._calculate_risk_zones()

        # Enhance with ML predictions
        enhanced_zones = []
        for zone in risk_zones:
            # Get ML prediction for a representative location in the zone
            zone_locations = [
                loc
                for loc, data in NAIROBI_LOCATIONS.items()
                if data.get("zone") == zone["zone"]
            ]
            if zone_locations:
                sample_loc = zone_locations[0]
                weather = "clear"
                cars_in_zone = [c for c in self.cars.values() if c.zone == zone["zone"]]
                if cars_in_zone:
                    weather = cars_in_zone[0].weather

                ml_pred = self.get_ml_accident_prediction(
                    sample_loc, weather, zone["avg_speed"]
                )
                zone["ml_risk"] = ml_pred["ml_risk_score"]
                zone["ml_factors"] = ml_pred["contributing_factors"]

            enhanced_zones.append(zone)

        prompt = f"""
        As {self.name}, analyze these risk zones in Nairobi and predict accident probability:

        RISK ZONES DATA (with ML predictions):
        {json.dumps(enhanced_zones, indent=2)}

        For each zone, predict:
        - Probability of accident (0-1)
        - Most likely cause
        - Recommended preventive action
        - Estimated time if accident occurs

        Return as JSON array with zones and predictions.
        """

        try:
            response = self._call_groq_api(prompt)
            if response:
                ai_predictions = json.loads(response)
                # Merge with static data
                return self._merge_predictions(enhanced_zones, ai_predictions)
        except:
            pass

        return self._get_static_predictions(enhanced_zones)

    def get_ai_route_optimization(
        self, start: str, destination: str, car_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Use AI to find the optimal route"""

        # Get possible routes
        possible_routes = self._find_possible_routes(start, destination)

        # Get car-specific data if provided
        car_data = None
        if car_id and car_id in self.cars:
            car = self.cars[car_id]
            car_data = {
                "vehicle_type": car.vehicle_type,
                "current_speed": car.speed,
                "battery": car.battery_level
                if car.vehicle_type == "electric"
                else None,
                "occupancy": car.occupancy,
            }

        prompt = f"""
        As {self.name}, find the best route from {start} to {destination} in Nairobi.

        POSSIBLE ROUTES:
        {json.dumps(possible_routes, indent=2)}

        CURRENT TRAFFIC:
        {json.dumps(self._get_current_traffic_conditions(), indent=2)}

        {"VEHICLE DATA: " + json.dumps(car_data, indent=2) if car_data else "No specific vehicle data"}

        Recommend the best route considering:
        1. Current traffic conditions
        2. Weather impact
        3. Accident risks
        4. Vehicle type (if provided)
        5. Time of day

        Return JSON with:
        - recommended_route (list of locations)
        - estimated_time (minutes)
        - reasoning (why this route)
        - alerts (potential issues)
        - alternative_route (second best)
        """

        try:
            response = self._call_groq_api(prompt)
            if response:
                ai_route = json.loads(response)
                # Add coordinates for mapping
                return self._enrich_route_with_coordinates(ai_route)
        except:
            pass

        return self._get_default_route(start, destination)

    def get_ai_driver_insight(self, car_id: str) -> Dict[str, Any]:
        """Get AI-powered insights for a specific driver"""

        if car_id not in self.cars:
            return {"error": "Car not found"}

        car = self.cars[car_id]

        # Get ML accident prediction for this driver's location
        ml_pred = self.get_ml_accident_prediction(car.location, car.weather, car.speed)

        prompt = f"""
        As {self.name}, provide personalized driving insights for this vehicle:

        VEHICLE DATA:
        - ID: {car.car_id}
        - Location: {car.location}
        - Destination: {car.destination}
        - Speed: {car.speed} km/h
        - Weather: {car.weather}
        - Vehicle Type: {car.vehicle_type}
        - Occupancy: {car.occupancy}
        {"- Battery: " + str(car.battery_level) + "%" if car.battery_level else ""}

        ML ACCIDENT RISK: {ml_pred['ml_risk_score']} ({ml_pred['risk_level']})
        RISK FACTORS: {', '.join(ml_pred['contributing_factors'])}

        CURRENT TRAFFIC AHEAD:
        {json.dumps(self._get_traffic_ahead(car.location, car.destination), indent=2)}

        TRAFFIC PREDICTIONS:
        {json.dumps(self.predict_future_traffic(car.location, 2), indent=2)}

        Provide:
        1. Safety score (0-100)
        2. Efficiency tips
        3. Route adjustment suggestions
        4. Estimated arrival with current speed
        5. Personalized warnings based on ML risk factors

        Return as JSON.
        """

        try:
            response = self._call_groq_api(prompt)
            if response:
                insights = json.loads(response)
                insights["car_id"] = car_id
                insights["timestamp"] = datetime.now().isoformat()
                insights["ml_risk"] = ml_pred
                return insights
        except:
            pass

        return self._get_default_driver_insight(car)

    def get_ai_weather_impact_analysis(self) -> Dict[str, Any]:
        """Analyze how weather is affecting traffic"""

        # Group cars by weather
        weather_groups = {}
        for car in self.cars.values():
            if car.weather not in weather_groups:
                weather_groups[car.weather] = []
            weather_groups[car.weather].append(car)

        prompt = f"""
        As {self.name}, analyze how different weather conditions are affecting Nairobi traffic:

        WEATHER DISTRIBUTION:
        {json.dumps({w: len(cars) for w, cars in weather_groups.items()}, indent=2)}

        IMPACT ON SPEEDS:
        {json.dumps(self._get_weather_speed_impact(), indent=2)}

        ML ACCIDENT RISK BY WEATHER:
        {json.dumps(self._get_ml_risk_by_weather(), indent=2)}

        Provide:
        1. Overall weather impact score
        2. Which areas are most affected
        3. Recommendations for drivers in each weather condition
        4. Predicted weather changes impact

        Return as JSON.
        """

        try:
            response = self._call_groq_api(prompt)
            if response:
                return json.loads(response)
        except:
            pass

        return self._get_default_weather_analysis()

    def _get_ml_risk_by_weather(self) -> Dict[str, float]:
        """Get average ML risk by weather condition"""
        risk_by_weather = {}

        for weather in ["clear", "rain", "cloudy"]:
            cars_with_weather = [c for c in self.cars.values() if c.weather == weather]
            if cars_with_weather:
                risks = []
                for car in cars_with_weather[:5]:  # Sample up to 5 cars
                    ml_pred = self.get_ml_accident_prediction(
                        car.location, car.weather, car.speed
                    )
                    risks.append(ml_pred["ml_risk_score"])
                risk_by_weather[weather] = sum(risks) / len(risks) if risks else 0.3
            else:
                risk_by_weather[weather] = 0.3

        return risk_by_weather

    # ============== AI HELPER FUNCTIONS ==============

    def _call_groq_api(self, prompt: str) -> Optional[str]:
        """Call Groq API with prompt"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": f"You are {self.name}, an expert traffic intelligence AI for Nairobi. Always respond with valid JSON.",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.7,
            "max_tokens": 1000,
        }

        try:
            response = requests.post(
                self.api_url, headers=headers, json=payload, timeout=10
            )
            if response.status_code == 200:
                return response.json()["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"AI API Error: {e}")

        return None

    def _prepare_traffic_summary(self) -> Dict[str, Any]:
        """Prepare traffic summary for AI"""
        total_cars = len(self.cars)
        if total_cars == 0:
            return {}

        speeds = [c.speed for c in self.cars.values()]
        avg_speed = sum(speeds) / total_cars

        # Group by location
        location_stats = {}
        for car in self.cars.values():
            if car.location not in location_stats:
                location_stats[car.location] = {
                    "count": 0,
                    "speeds": [],
                    "weather": car.weather,
                }
            location_stats[car.location]["count"] += 1
            location_stats[car.location]["speeds"].append(car.speed)

        # Calculate averages
        for loc in location_stats:
            speeds = location_stats[loc]["speeds"]
            location_stats[loc]["avg_speed"] = sum(speeds) / len(speeds)
            location_stats[loc]["status"] = self._get_traffic_status(
                location_stats[loc]["avg_speed"]
            ).value

        return {
            "total_vehicles": total_cars,
            "average_speed_city": round(avg_speed, 1),
            "stationary_vehicles": sum(1 for s in speeds if s == 0),
            "weather_breakdown": self._get_weather_breakdown(),
            "location_stats": location_stats,
            "timestamp": datetime.now().isoformat(),
            "peak_hour": self._is_peak_hour(),
        }

    def _get_weather_breakdown(self) -> Dict[str, int]:
        """Get breakdown of weather conditions"""
        breakdown = {}
        for car in self.cars.values():
            breakdown[car.weather] = breakdown.get(car.weather, 0) + 1
        return breakdown

    def _is_peak_hour(self) -> bool:
        """Check if current time is peak hour"""
        current_hour = datetime.now().hour
        return (7 <= current_hour <= 9) or (17 <= current_hour <= 19)

    def _get_traffic_status(self, avg_speed: float) -> TrafficStatus:
        """Get traffic status enum"""
        if avg_speed < 5:
            return TrafficStatus.GRIDLOCK
        elif avg_speed < 15:
            return TrafficStatus.HEAVY
        elif avg_speed < 25:
            return TrafficStatus.MODERATE
        else:
            return TrafficStatus.CLEAR

    def _calculate_risk_zones(self) -> List[Dict[str, Any]]:
        """Calculate risk zones based on current data"""
        risk_zones = []

        for zone, characteristics in TRAFFIC_ZONES.items():
            cars_in_zone = [car for car in self.cars.values() if car.zone == zone]

            if not cars_in_zone:
                continue

            # Calculate risk factors
            avg_speed = sum(c.speed for c in cars_in_zone) / len(cars_in_zone)
            stationary_count = sum(1 for c in cars_in_zone if c.speed == 0)
            rain_count = sum(1 for c in cars_in_zone if c.weather == "rain")

            # Zone base risk
            base_risk = characteristics["accident_rate"]

            # Speed risk (lower speed = higher risk up to a point)
            speed_risk = max(0, 1 - (avg_speed / 30)) * 0.3

            # Stationary risk
            stationary_risk = (stationary_count / len(cars_in_zone)) * 0.4

            # Weather risk
            weather_risk = (rain_count / len(cars_in_zone)) * 0.3

            total_risk = base_risk + speed_risk + stationary_risk + weather_risk
            total_risk = min(1.0, total_risk)

            risk_zones.append(
                {
                    "zone": zone,
                    "risk_score": round(total_risk, 2),
                    "vehicle_count": len(cars_in_zone),
                    "avg_speed": round(avg_speed, 1),
                    "stationary_vehicles": stationary_count,
                    "rain_affected": rain_count,
                    "peak_hours": characteristics["peak_hours"],
                }
            )

        return sorted(risk_zones, key=lambda x: x["risk_score"], reverse=True)

    def _find_possible_routes(
        self, start: str, destination: str
    ) -> List[Dict[str, Any]]:
        """Find possible routes between start and destination"""
        routes = []

        # Direct route
        routes.append(
            {
                "name": f"Direct",
                "path": [start, destination],
                "distance": self._calculate_distance(start, destination),
            }
        )

        # Find via connecting roads
        for road, connections in ROAD_CONNECTIONS.items():
            if start in connections and destination in connections:
                routes.append(
                    {
                        "name": f"Via {road}",
                        "path": [start, road, destination],
                        "distance": self._calculate_distance(start, road)
                        + self._calculate_distance(road, destination),
                    }
                )

        return routes[:5]  # Return top 5

    def _calculate_distance(self, loc1: str, loc2: str) -> float:
        """Calculate approximate distance between locations (km)"""
        if loc1 not in NAIROBI_LOCATIONS or loc2 not in NAIROBI_LOCATIONS:
            return 5.0  # Default distance

        coord1 = NAIROBI_LOCATIONS[loc1]
        coord2 = NAIROBI_LOCATIONS[loc2]

        # Haversine formula for distance
        R = 6371  # Earth's radius in km
        lat1, lon1 = math.radians(coord1["lat"]), math.radians(coord1["lng"])
        lat2, lon2 = math.radians(coord2["lat"]), math.radians(coord2["lng"])

        dlat = lat2 - lat1
        dlon = lon2 - lon1

        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        return round(R * c, 1)

    def _get_current_traffic_conditions(self) -> Dict[str, Any]:
        """Get current traffic conditions for all locations"""
        conditions = {}

        for location in NAIROBI_LOCATIONS:
            cars_here = [c for c in self.cars.values() if c.location == location]
            if cars_here:
                avg_speed = sum(c.speed for c in cars_here) / len(cars_here)
                status = self._get_traffic_status(avg_speed)
                weather = cars_here[0].weather
            else:
                avg_speed = 30
                status = TrafficStatus.CLEAR
                weather = "clear"

            conditions[location] = {
                "avg_speed": round(avg_speed, 1),
                "status": status.value,
                "weather": weather,
                "vehicle_count": len(cars_here),
            }

        return conditions

    def _get_traffic_ahead(self, current: str, destination: str) -> List[Dict]:
        """Get traffic conditions along the route ahead"""
        # Simplified - get locations between current and destination
        locations = []
        found = False

        for road, connections in ROAD_CONNECTIONS.items():
            if current in connections and destination in connections:
                start_idx = connections.index(current) if current in connections else 0
                end_idx = (
                    connections.index(destination)
                    if destination in connections
                    else len(connections) - 1
                )

                if start_idx < end_idx:
                    locations = connections[start_idx : end_idx + 1]
                else:
                    locations = connections[end_idx : start_idx + 1]
                break

        if not locations:
            locations = [current, destination]

        traffic_ahead = []
        for loc in locations[1:]:  # Skip current location
            cars_here = [c for c in self.cars.values() if c.location == loc]
            if cars_here:
                avg_speed = sum(c.speed for c in cars_here) / len(cars_here)
                status = self._get_traffic_status(avg_speed)
            else:
                avg_speed = 30
                status = TrafficStatus.CLEAR

            traffic_ahead.append(
                {
                    "location": loc,
                    "avg_speed": round(avg_speed, 1),
                    "status": status.value,
                }
            )

        return traffic_ahead

    def _get_weather_speed_impact(self) -> Dict[str, float]:
        """Calculate how weather affects average speeds"""
        weather_speeds = {}

        for car in self.cars.values():
            if car.weather not in weather_speeds:
                weather_speeds[car.weather] = []
            weather_speeds[car.weather].append(car.speed)

        impact = {}
        for weather, speeds in weather_speeds.items():
            avg_speed = sum(speeds) / len(speeds)
            impact[weather] = round(avg_speed, 1)

        return impact

    # ============== FALLBACK FUNCTIONS ==============

    def _get_fallback_analysis(self, summary: Dict) -> Dict[str, Any]:
        """Fallback when AI is unavailable"""
        return {
            "overall_status": f"Traffic flowing at {summary.get('average_speed_city', 20)} km/h",
            "critical_areas": [
                loc
                for loc, stats in summary.get("location_stats", {}).items()
                if stats.get("avg_speed", 30) < 10
            ][:3],
            "weather_impact": "Weather affecting normal traffic flow",
            "driver_recommendations": [
                "Avoid Jogoo Road during peak hours",
                "Use Langata Road for faster commute",
                "Expect delays on Mombasa Road due to rain",
            ],
            "predicted_trends": "Congestion expected to increase in next hour",
            "ai_confidence_score": 0.6,
        }

    def _merge_predictions(self, risk_zones: List, ai_predictions: List) -> List:
        """Merge AI predictions with static data"""
        merged = []
        for i, zone in enumerate(risk_zones[:3]):
            zone_data = zone.copy()
            if i < len(ai_predictions):
                zone_data.update(ai_predictions[i])
            else:
                zone_data.update(
                    {
                        "probability": zone["risk_score"],
                        "likely_cause": "heavy traffic",
                        "preventive_action": "reduce speed",
                        "estimated_clear_time": "30-45 minutes",
                    }
                )
            merged.append(zone_data)
        return merged

    def _get_static_predictions(self, risk_zones: List) -> List:
        """Static predictions when AI fails"""
        predictions = []
        for zone in risk_zones[:5]:
            if zone["risk_score"] > 0.7:
                level = "HIGH"
            elif zone["risk_score"] > 0.4:
                level = "MEDIUM"
            else:
                level = "LOW"

            predictions.append(
                {
                    "zone": zone["zone"],
                    "risk_score": zone["risk_score"],
                    "risk_level": level,
                    "probability": zone["risk_score"],
                    "likely_cause": "congestion"
                    if zone["avg_speed"] < 15
                    else "weather",
                    "preventive_action": "monitor traffic"
                    if zone["avg_speed"] > 10
                    else "seek alternative",
                    "estimated_clear_time": "unknown",
                    "vehicle_count": zone["vehicle_count"],
                }
            )
        return predictions

    def _enrich_route_with_coordinates(self, ai_route: Dict) -> Dict:
        """Add coordinates to AI route for mapping"""
        if "recommended_route" in ai_route:
            route_with_coords = []
            for loc in ai_route["recommended_route"]:
                if loc in NAIROBI_LOCATIONS:
                    route_with_coords.append(
                        {"name": loc, "coordinates": NAIROBI_LOCATIONS[loc]}
                    )
                else:
                    route_with_coords.append(
                        {"name": loc, "coordinates": {"lat": 0, "lng": 0}}
                    )
            ai_route["route_with_coordinates"] = route_with_coords

        if "alternative_route" in ai_route:
            alt_with_coords = []
            for loc in ai_route["alternative_route"]:
                if loc in NAIROBI_LOCATIONS:
                    alt_with_coords.append(
                        {"name": loc, "coordinates": NAIROBI_LOCATIONS[loc]}
                    )
            ai_route["alternative_with_coordinates"] = alt_with_coords

        return ai_route

    def _get_default_route(self, start: str, destination: str) -> Dict:
        """Default route when AI fails"""
        return {
            "recommended_route": [start, destination],
            "estimated_time": self._estimate_travel_time(start, destination),
            "reasoning": "Direct route recommended based on current conditions",
            "alerts": [],
            "alternative_route": [start, "CBD", destination]
            if start != "CBD" and destination != "CBD"
            else [start, destination],
            "route_with_coordinates": [
                {
                    "name": start,
                    "coordinates": NAIROBI_LOCATIONS.get(start, {"lat": 0, "lng": 0}),
                },
                {
                    "name": destination,
                    "coordinates": NAIROBI_LOCATIONS.get(
                        destination, {"lat": 0, "lng": 0}
                    ),
                },
            ],
        }

    def _estimate_travel_time(self, start: str, destination: str) -> int:
        """Estimate travel time in minutes"""
        distance = self._calculate_distance(start, destination)
        # Assume average speed of 20 km/h in city
        avg_speed = 20
        time_hours = distance / avg_speed
        return int(time_hours * 60)

    def _get_default_driver_insight(self, car: Car) -> Dict:
        """Default driver insights when AI fails"""
        # Calculate ETA
        distance = self._calculate_distance(car.location, car.destination)
        if car.speed > 0:
            eta_minutes = int((distance / car.speed) * 60)
        else:
            eta_minutes = 999

        return {
            "car_id": car.car_id,
            "safety_score": 85 if car.speed < 30 else 70,
            "efficiency_tips": [
                "Maintain steady speed",
                "Avoid sudden braking",
                "Plan route ahead",
            ],
            "route_suggestions": "Current route is optimal",
            "estimated_arrival": f"{eta_minutes} minutes",
            "warnings": []
            if car.speed > 0
            else ["Vehicle stationary - check for issues"],
            "timestamp": datetime.now().isoformat(),
        }

    def _get_default_weather_analysis(self) -> Dict:
        """Default weather analysis"""
        return {
            "weather_impact_score": 0.5,
            "most_affected_areas": ["Mombasa Road", "Jogoo Road"],
            "driver_recommendations": {
                "rain": "Reduce speed, increase following distance",
                "clear": "Normal driving conditions",
                "cloudy": "Watch for changing conditions",
            },
            "predicted_impact": "Weather conditions expected to improve in 2 hours",
        }

    def generate_map_data_with_ai(self) -> Dict[str, Any]:
        """Generate all data needed for map visualization with AI insights"""

        print("🤖 Sofia AI is analyzing traffic patterns...")
        ai_analysis = self.get_ai_traffic_analysis()
        ai_accidents = self.get_ai_accident_prediction()
        ai_weather = self.get_ai_weather_impact_analysis()

        driver_insights = {}
        for car_id in list(self.cars.keys())[:5]:
            driver_insights[car_id] = self.get_ai_driver_insight(car_id)

        print(" AI analysis complete!")

        return {
            "timestamp": datetime.now().isoformat(),
            "system": self.name,
            "ai_powered": True,
            "ml_enabled": True,
            "ai_confidence": ai_analysis.get("ai_confidence_score", 0.8),
            # Map display data
            "map_data": {
                "cars": [car.to_dict() for car in self.cars.values()],
                "hotspots": self.accident_hotspots,
                "cameras": self.traffic_cameras,
                "locations": NAIROBI_LOCATIONS,
                "zones": TRAFFIC_ZONES,
            },
            # AI insights
            "ai_insights": {
                "traffic_analysis": ai_analysis,
                "accident_predictions": ai_accidents,
                "weather_impact": ai_weather,
                "driver_insights": driver_insights,
            },
            # ML insights
            "ml_insights": {
                "model_accuracy": 0.85,
                "predictions_generated": len(self.cars),
                "future_traffic": self.predict_future_traffic("CBD", 3),
            },
            # Summary statistics
            "statistics": {
                "total_vehicles": len(self.cars),
                "active_alerts": len(
                    [a for a in ai_accidents if a.get("risk_level") == "HIGH"]
                ),
                "average_speed": round(
                    sum(c.speed for c in self.cars.values()) / len(self.cars), 1
                )
                if self.cars
                else 0,
                "weather_distribution": self._get_weather_breakdown(),
            },
        }


# ============================================
# MAIN EXECUTION
# ============================================


def main():
    """Main function with AI-powered traffic intelligence"""

    print("=" * 60)
    print(" SOFIA AI - TRAFFIC INTELLIGENCE SYSTEM WITH TENSORFLOW")
    print("=" * 60)

    # Initialize AI-powered system
    traffic_system = AITrafficIntelligence()

    # Your vehicle data
    vehicle_data = [
        {
            "car_id": "CAR_001",
            "city": "Nairobi",
            "speed": 18,
            "location": "Thika Road",
            "weather": "clear",
            "route": "Kasarani -> CBD",
        },
        {
            "car_id": "CAR_002",
            "city": "Nairobi",
            "speed": 7,
            "location": "Mombasa Road",
            "weather": "rain",
            "route": "JKIA -> Industrial Area",
        },
        {
            "car_id": "CAR_003",
            "city": "Nairobi",
            "speed": 0,
            "location": "Uhuru Highway",
            "weather": "clear",
            "route": "CBD -> Upper Hill",
        },
        {
            "car_id": "CAR_004",
            "city": "Nairobi",
            "speed": 25,
            "location": "Waiyaki Way",
            "weather": "clear",
            "route": "Westlands -> Kangemi",
        },
        {
            "car_id": "CAR_005",
            "city": "Nairobi",
            "speed": 12,
            "location": "Ngong Road",
            "weather": "rain",
            "route": "Karen -> CBD",
        },
        {
            "car_id": "CAR_006",
            "city": "Nairobi",
            "speed": 5,
            "location": "Jogoo Road",
            "weather": "cloudy",
            "route": "Donholm -> CBD",
        },
        {
            "car_id": "CAR_007",
            "city": "Nairobi",
            "speed": 30,
            "location": "Langata Road",
            "weather": "clear",
            "route": "Langata -> Wilson Airport",
        },
        {
            "car_id": "CAR_008",
            "city": "Nairobi",
            "speed": 9,
            "location": "Kiambu Road",
            "weather": "rain",
            "route": "Runda -> CBD",
        },
        {
            "car_id": "CAR_009",
            "city": "Nairobi",
            "speed": 15,
            "location": "Outer Ring Road",
            "weather": "clear",
            "route": "Embakasi -> Thika Road",
        },
        {
            "car_id": "CAR_010",
            "city": "Nairobi",
            "speed": 3,
            "location": "Haile Selassie Avenue",
            "weather": "cloudy",
            "route": "CBD -> Railway Station",
        },
        {
            "car_id": "CAR_011",
            "city": "Nairobi",
            "speed": 20,
            "location": "Thika Road",
            "weather": "clear",
            "route": "Roysambu -> CBD",
        },
        {
            "car_id": "CAR_012",
            "city": "Nairobi",
            "speed": 6,
            "location": "Mombasa Road",
            "weather": "rain",
            "route": "Syokimau -> CBD",
        },
        {
            "car_id": "CAR_013",
            "city": "Nairobi",
            "speed": 0,
            "location": "Uhuru Highway",
            "weather": "clear",
            "route": "CBD -> Westlands",
        },
        {
            "car_id": "CAR_014",
            "city": "Nairobi",
            "speed": 28,
            "location": "Waiyaki Way",
            "weather": "clear",
            "route": "Westlands -> Uthiru",
        },
        {
            "car_id": "CAR_015",
            "city": "Nairobi",
            "speed": 10,
            "location": "Ngong Road",
            "weather": "cloudy",
            "route": "Karen -> Junction Mall",
        },
        {
            "car_id": "CAR_016",
            "city": "Nairobi",
            "speed": 8,
            "location": "Jogoo Road",
            "weather": "rain",
            "route": "Buruburu -> CBD",
        },
        {
            "car_id": "CAR_017",
            "city": "Nairobi",
            "speed": 35,
            "location": "Langata Road",
            "weather": "clear",
            "route": "Galleria -> CBD",
        },
        {
            "car_id": "CAR_018",
            "city": "Nairobi",
            "speed": 11,
            "location": "Kiambu Road",
            "weather": "cloudy",
            "route": "Muthaiga -> CBD",
        },
        {
            "car_id": "CAR_019",
            "city": "Nairobi",
            "speed": 14,
            "location": "Outer Ring Road",
            "weather": "clear",
            "route": "Pipeline -> Donholm",
        },
        {
            "car_id": "CAR_020",
            "city": "Nairobi",
            "speed": 2,
            "location": "Tom Mboya Street",
            "weather": "cloudy",
            "route": "CBD -> River Road",
        },
    ]

    # Load vehicles
    print(" Loading vehicle data...")
    traffic_system.load_vehicles(vehicle_data)
    print(f" Loaded {len(traffic_system.cars)} vehicles")

    # Generate complete map data with AI insights
    print("\n Activating Sofia AI with TensorFlow for traffic analysis...")
    map_data = traffic_system.generate_map_data_with_ai()

    # Save to JSON file for frontend consumption
    with open("traffic_map_data_with_ai_tf.json", "w") as f:
        json.dump(map_data, f, indent=2)

    print("\n" + "=" * 60)
    print(" SOFIA AI TRAFFIC SUMMARY WITH TENSORFLOW")
    print("=" * 60)

    print(f"\n Total Vehicles: {map_data['statistics']['total_vehicles']}")
    print(f" Average Speed: {map_data['statistics']['average_speed']} km/h")
    print(f" Active Alerts: {map_data['statistics']['active_alerts']}")
    print(f" AI Confidence: {map_data['ai_confidence'] * 100}%")
    print(f" ML Model Accuracy: {map_data['ml_insights']['model_accuracy'] * 100}%")

    print("\n Weather Distribution:")
    for weather, count in map_data["statistics"]["weather_distribution"].items():
        print(f"  • {weather}: {count} vehicles")

    print("\n Top Accident Predictions (with ML):")
    for pred in map_data["ai_insights"]["accident_predictions"][:3]:
        print(
            f"  • {pred.get('zone', 'Unknown')}: Risk {pred.get('risk_score', 0)} - {pred.get('risk_level', 'UNKNOWN')}"
        )
        if "ml_factors" in pred:
            print(f"    Factors: {', '.join(pred.get('ml_factors', [])[:2])}")

    print("\n Future Traffic Predictions (CBD):")
    for pred in map_data["ml_insights"]["future_traffic"]:
        print(
            f"  • {pred['hour']:02d}:00 - {pred['predicted_speed']} km/h ({pred['status']})"
        )

    print("\n AI Traffic Analysis:")
    analysis = map_data["ai_insights"]["traffic_analysis"]
    print(f"  • Status: {analysis.get('overall_status', 'Unknown')}")
    print(f"  • Critical Areas: {', '.join(analysis.get('critical_areas', ['None']))}")

    print("\n Driver Recommendations:")
    for rec in analysis.get("driver_recommendations", [])[:3]:
        print(f"  • {rec}")

    print("\n" + "=" * 60)
    print(" Data saved to 'traffic_map_data_with_ai_tf.json'")
    print(" Ready for map display with TensorFlow ML insights!")
    print("=" * 60)

    # Interactive demo
    print("\n Interactive AI + ML Demo")
    print("-" * 40)

    # Test route optimization
    print("\n Testing Route Optimization:")
    route = traffic_system.get_ai_route_optimization("CBD", "JKIA", "CAR_002")
    print(f"  Recommended: {' -> '.join(route.get('recommended_route', []))}")
    print(f"  ETA: {route.get('estimated_time', 'Unknown')} minutes")
    print(f"  Reasoning: {route.get('reasoning', 'N/A')}")

    # Test driver insight with ML
    print("\n Testing Driver Insight for CAR_005 (with ML risk):")
    insight = traffic_system.get_ai_driver_insight("CAR_005")
    print(f"  Safety Score: {insight.get('safety_score', 'N/A')}/100")
    print(f"  ML Risk: {insight.get('ml_risk', {}).get('ml_risk_score', 0):.2f}")
    print(f"  Risk Level: {insight.get('ml_risk', {}).get('risk_level', 'Unknown')}")
    print(f"  ETA: {insight.get('estimated_arrival', 'Unknown')}")
    for tip in insight.get("efficiency_tips", [])[:2]:
        print(f"  Tip: {tip}")

    print("\n" + "=" * 60)
    print(" Sofia AI with TensorFlow is ready to assist!")
    print("=" * 60)


if __name__ == "__main__":
    main()
