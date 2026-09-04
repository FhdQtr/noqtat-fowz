import { Analytics, type BeforeSendEvent } from "@vercel/analytics/react";

const PRIVATE_ROUTES = [
  [/^\/play\/[^/]+$/i, "/play/[team]"],
  [/^\/host\/[^/]+$/i, "/host/[match]"],
  [/^\/tv\/[^/]+$/i, "/tv/[match]"],
  [/^\/act\/[^/]+$/i, "/act/[match]"],
] as const;

function hidePrivateCodes(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = new URL(event.url);
    for (const [pattern, replacement] of PRIVATE_ROUTES) {
      if (pattern.test(url.pathname)) {
        url.pathname = replacement;
        break;
      }
    }
    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  } catch {
    return null;
  }
}

export default function SiteAnalytics() {
  return <Analytics beforeSend={hidePrivateCodes} />;
}
