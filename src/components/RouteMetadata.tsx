import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { routeMetadata } from '../lib/routeMetadata';

export default function RouteMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const data = routeMetadata(pathname, window.location.hostname);
    document.title = data.title;
    const setMeta = (selector: string, attribute: string, name: string, content: string) => {
      let node = document.head.querySelector<HTMLMetaElement>(selector);
      if (!node) {
        node = document.createElement('meta');
        node.setAttribute(attribute, name);
        document.head.appendChild(node);
      }
      node.content = content;
    };
    setMeta('meta[name="description"]', 'name', 'description', data.description);
    setMeta('meta[name="robots"]', 'name', 'robots', data.robots);
    setMeta('meta[property="og:title"]', 'property', 'og:title', data.title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', data.description);
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (data.canonical) {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
      }
      canonical.href = data.canonical;
    } else canonical?.remove();
  }, [pathname]);
  return null;
}
