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

export async function fetchUrlText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'user-agent': 'VenueScout/1.0 (+https://venuescout.example)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Fetch failed with status ${response.status}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/pdf')) {
    return pdfToText(Buffer.from(await response.arrayBuffer()));
  }
  return htmlToText(await response.text());
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
