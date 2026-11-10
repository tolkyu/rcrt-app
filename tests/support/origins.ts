export const E2E_ORIGIN = 'http://localhost:3100';
/** Same build with `AUTH_GOOGLE_ENABLED=true`: renders the Google buttons for screenshots; nothing there calls Google. */
export const GOOGLE_E2E_ORIGIN = 'http://localhost:3101';
/** `next dev` serving the `/dev/ui` gallery (compiled only in development); separate dist dir so it never touches the production build. */
export const DEV_UI_ORIGIN = 'http://localhost:3102';
