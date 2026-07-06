import JSZip from 'jszip';

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&agrave;': 'à',
  '&egrave;': 'è',
  '&eacute;': 'é',
  '&igrave;': 'ì',
  '&ograve;': 'ò',
  '&ugrave;': 'ù',
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&[a-zA-Z]+;/g, (m) => HTML_ENTITIES[m.toLowerCase()] ?? ' ');
}

/** Strips an HTML page down to readable text (no heavy DOM dependency). */
export function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ');
  const withBreaks = withoutBlocks
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(withBreaks)
    .replace(/[ \t\r]+/g, ' ')
    .replace(/ *\n+ */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Filename heuristics for chrome imagery we never want to propose as venue photos. */
const SKIP_IMAGE_NAME = /icon|logo|sprite|favicon|placeholder|spinner|loading|avatar|badge|pixel|tracking|bullet|arrow/i;
const SKIP_IMAGE_EXT = /\.(svg|gif|ico)(?:$|\?)/i;
const MIN_IMAGE_DIMENSION = 200;

/**
 * Collects candidate venue photo URLs from a page: og:image metas plus <img>
 * src attributes, absolutized against the page URL, deduped, with vector /
 * animated / chrome images (svg, gif, icons, logos, sprites) and images
 * declared smaller than 200px skipped. Capped at `cap` results.
 */
export function extractImageUrls(html: string, pageUrl: string, cap = 12): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string | null | undefined): void => {
    if (!raw) return;
    let abs: URL;
    try {
      abs = new URL(decodeEntities(raw.trim()), pageUrl);
    } catch {
      return;
    }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return;
    const filename = abs.pathname.split('/').pop() ?? '';
    if (SKIP_IMAGE_EXT.test(filename) || SKIP_IMAGE_NAME.test(filename)) return;
    if (seen.has(abs.href)) return;
    seen.add(abs.href);
    urls.push(abs.href);
  };

  for (const meta of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = meta[0];
    if (!/(?:property|name)\s*=\s*["']og:image(?::secure_url|:url)?["']/i.test(tag)) continue;
    push(/content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]);
  }

  for (const img of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = img[0];
    const width = /\bwidth\s*=\s*["']?(\d+)/i.exec(tag);
    const height = /\bheight\s*=\s*["']?(\d+)/i.exec(tag);
    if (width && Number.parseInt(width[1]!, 10) < MIN_IMAGE_DIMENSION) continue;
    if (height && Number.parseInt(height[1]!, 10) < MIN_IMAGE_DIMENSION) continue;
    push(/\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]);
  }

  return urls.slice(0, cap);
}

export interface FetchedPage {
  text: string;
  /** Candidate venue photo URLs (empty for non-HTML sources). */
  images: string[];
}

/** Fetches a URL and returns both readable text and candidate photo URLs. */
export async function fetchUrlPage(url: string): Promise<FetchedPage> {
  const response = await fetch(url, {
    headers: { 'user-agent': 'VenueScout/1.0 (+https://venuescout.example)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Fetch failed with status ${response.status}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/pdf')) {
    return { text: await pdfToText(Buffer.from(await response.arrayBuffer())), images: [] };
  }
  const html = await response.text();
  // Resolve relative image URLs against the final URL after redirects.
  const baseUrl = response.url || url;
  return { text: htmlToText(html), images: extractImageUrls(html, baseUrl) };
}

export async function fetchUrlText(url: string): Promise<string> {
  return (await fetchUrlPage(url)).text;
}

export async function pdfToText(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return typeof text === 'string' ? text : (text as string[]).join('\n');
}

export async function docxToText(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

/** PPTX: unzip and pull all <a:t> runs from slide XML, one line per slide. */
export async function pptxToText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number.parseInt(a.replace(/\D+/g, ''), 10);
      const nb = Number.parseInt(b.replace(/\D+/g, ''), 10);
      return na - nb;
    });
  const parts: string[] = [];
  for (const name of slideNames) {
    const xml = await zip.files[name]!.async('string');
    const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeEntities(m[1] ?? ''));
    if (runs.length > 0) parts.push(runs.join(' '));
  }
  return parts.join('\n').trim();
}

export async function bufferToText(buffer: Buffer, sourceType: 'pdf' | 'docx' | 'pptx'): Promise<string> {
  switch (sourceType) {
    case 'pdf':
      return pdfToText(buffer);
    case 'docx':
      return docxToText(buffer);
    case 'pptx':
      return pptxToText(buffer);
  }
}
