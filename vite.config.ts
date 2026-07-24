import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/ComandasWeb/",
});



// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react";

// export default defineConfig({
//   plugins: [react()],
//   base: "/",
//   server: {
//     host: "0.0.0.0",
//     port: 5173,
//     strictPort: true,
//     proxy: {
//       "/api": {
//         target: "http://192.168.56.1:400",
//         changeOrigin: true,
//         secure: false,
//       },
//     },
//     hmr: {
//       protocol: "ws",
//       host: " 192.168.56.1",
//       clientPort: 5173,
//     },
//   },
// });
