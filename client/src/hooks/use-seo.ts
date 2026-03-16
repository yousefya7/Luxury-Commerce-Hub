import { useEffect } from "react";
import { useLocation } from "wouter";

const BASE_URL = "https://resilientofficial.com";
const DEFAULT_IMAGE = `${BASE_URL}/images/logo-icon.png`;
const DEFAULT_KEYWORDS =
  "resilient, resilient official, streetwear, premium streetwear, luxury streetwear, urban fashion, limited drops, graphic tees, hoodies, jackets";

interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  ogImage?: string;
  ogType?: "website" | "product";
  canonical?: string;
  jsonLd?: object | object[];
}

function upsertMeta(selector: string, attrKey: string, attrVal: string, content: string) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attrKey, attrVal);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

function setJsonLd(data: object | object[]) {
  let el = document.getElementById("seo-json-ld");
  if (!el) {
    el = document.createElement("script");
    el.id = "seo-json-ld";
    el.setAttribute("type", "application/ld+json");
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(Array.isArray(data) ? data : data);
}

function removeJsonLd() {
  const el = document.getElementById("seo-json-ld");
  if (el) el.remove();
}

export function useSEO({
  title,
  description,
  keywords = DEFAULT_KEYWORDS,
  ogImage,
  ogType = "website",
  canonical,
  jsonLd,
}: SEOProps) {
  const [location] = useLocation();
  const canonicalUrl = canonical || `${BASE_URL}${location}`;
  const imageUrl = ogImage || DEFAULT_IMAGE;

  useEffect(() => {
    document.title = title;

    upsertMeta('meta[name="description"]', "name", "description", description);
    upsertMeta('meta[name="keywords"]', "name", "keywords", keywords);

    upsertMeta('meta[property="og:title"]', "property", "og:title", title);
    upsertMeta('meta[property="og:description"]', "property", "og:description", description);
    upsertMeta('meta[property="og:image"]', "property", "og:image", imageUrl);
    upsertMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    upsertMeta('meta[property="og:type"]', "property", "og:type", ogType);
    upsertMeta('meta[property="og:site_name"]', "property", "og:site_name", "Resilient Official");

    upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", imageUrl);

    upsertLink("canonical", canonicalUrl);

    if (jsonLd) {
      setJsonLd(jsonLd);
    } else {
      removeJsonLd();
    }
  }, [title, description, keywords, imageUrl, canonicalUrl, ogType]);
}
