import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { installChunkReloadHandler } from "./lib/chunk-reload";
import "./index.css";

installChunkReloadHandler();

createRoot(document.getElementById("root")!).render(<App />);
