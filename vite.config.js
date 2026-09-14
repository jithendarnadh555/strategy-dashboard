import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: If you deploy to https://<username>.github.io/<repo-name>/
// set base to "/<repo-name>/" below. If this repo IS your
// <username>.github.io repo (root site), leave base as "/".
export default defineConfig({
  plugins: [react()],
  base: "/",
});
