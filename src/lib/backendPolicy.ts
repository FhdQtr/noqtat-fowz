/** No preview can silently use the live game backend. Unknown modes fail closed.
 * Emulator access is explicitly opt-in and loopback-only; it uses a demo project.
 * This is deployment/data-isolation policy, not an authorization boundary.
 */
export function backendTarget(hostname: string, productionBuild: boolean, requestedMode?: string) {
  const loopback = hostname === "localhost" || hostname === "127.0.0.1";
  if (requestedMode === "emulator" && loopback) return { mode: "emulator" as const };
  if ((!requestedMode || requestedMode === "production") && productionBuild && (hostname === "www.qtrgame.net" || hostname === "qtrgame.net")) return { mode: "production" as const };
  return { mode: "disabled" as const };
}
