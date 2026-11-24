import React from "react";
import ReactDOM from "react-dom/client";
import NetworkViewer from "./NetworkViewer";
import "../../App.css";
import "./networkViewer.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <NetworkViewer />
  </React.StrictMode>,
);
