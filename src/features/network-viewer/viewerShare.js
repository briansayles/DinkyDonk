export function getViewerShareUrl({ hostname, origin, pathname }) {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" || host.endsWith(".localhost") ||
    /^127(?:\.\d{1,3}){3}$/.test(host) ||
    host === "[::1]" || host === "::1" || host === "0.0.0.0" || host === "[::]"
  ) {
    return null;
  }
  return `${origin}${pathname}`;
}
