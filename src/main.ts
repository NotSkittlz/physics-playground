import "katex/dist/katex.min.css";
import "./styles.css";
import { startApp } from "./ui/app.ts";

const root = document.getElementById("app");
if (!root) throw new Error("#app is missing");
startApp(root);
