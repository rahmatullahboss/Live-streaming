import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("admin", "routes/admin.tsx"),
  route("camera", "routes/camera.tsx"),
  route("checkout/success", "routes/checkout-success.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("score/:token", "routes/score.tsx"),
  route("studio", "routes/studio.tsx"),
  route("watch", "routes/watch.tsx"),
] satisfies RouteConfig;
