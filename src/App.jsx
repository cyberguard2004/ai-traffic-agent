import Admin from "./pages/admin";
import { SimulationProvider } from "./context/SimulationContext";
import "./App.css";

function App() {
  return (
    <SimulationProvider>
      <Admin />
    </SimulationProvider>
  );
}

export default App;
