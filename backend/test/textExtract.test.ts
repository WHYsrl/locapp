import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { extractImageUrls, htmlToText, pptxToText } from '../src/ingest/textExtract.js';

describe('htmlToText', () => {
  it('strips scripts, styles and tags keeping readable text', () => {
    const html = `<html><head><title>x</title><style>.a{color:red}</style></head>
      <body><script>alert(1)</script><h1>Villa dei Pini</h1>
      <p>Capienza massima: 200 persone.</p><div>Citt&agrave;: Firenze &amp; dintorni</div></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain('Villa dei Pini');
    expect(text).toContain('Capienza massima: 200 persone.');
    expect(text).toContain('Città: Firenze & dintorni');
    expect(text).not.toContain('alert(1)');
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('<');
  });
});

describe('extractImageUrls', () => {
  const PAGE_URL = 'https://venue.example/location/index.html';

  it('collects og:image and img src, absolutized against the page URL, og first', () => {
    const html = `<html><head>
      <meta property="og:image" content="https://cdn.example.com/hero.jpg"/>
      <meta name="og:image" content="/img/og-cover.jpg">
      </head><body>
      <img src="/img/sala.jpg">
      <img src="gallery/giardino.jpeg" width="800" height="600">
      </body></html>`;
    expect(extractImageUrls(html, PAGE_URL)).toEqual([
      'https://cdn.example.com/hero.jpg',
      'https://venue.example/img/og-cover.jpg',
      'https://venue.example/img/sala.jpg',
      'https://venue.example/location/gallery/giardino.jpeg',
    ]);
  });

  it('skips svg/gif/icons/logos/sprites, small images, duplicates and non-http URLs', () => {
    const html = `<body>
      <img src="/img/sala.jpg">
      <img src="/img/sala.jpg">
      <img src="/img/logo.png">
      <img src="/icons/pin-icon.jpg">
      <img src="/assets/sprite.png">
      <img src="/img/vettoriale.svg">
      <img src="/img/animazione.gif">
      <img src="/img/thumb.jpg" width="120">
      <img src="/img/thumb2.jpg" height='80'>
      <img src="/img/grande.jpg" width="1200" height="900">
      <img src="data:image/png;base64,AAAA">
      <img alt="senza src">
      </body>`;
    expect(extractImageUrls(html, PAGE_URL)).toEqual([
      'https://venue.example/img/sala.jpg',
      'https://venue.example/img/grande.jpg',
    ]);
  });

  it('caps the number of candidates at 12', () => {
    const imgs = Array.from({ length: 20 }, (_, i) => `<img src="/foto-${i}.jpg">`).join('');
    expect(extractImageUrls(`<body>${imgs}</body>`, PAGE_URL)).toHaveLength(12);
  });
});

describe('pptxToText', () => {
  it('extracts text runs from slide XML in order', async () => {
    const zip = new JSZip();
    const slide = (runs: string[]) =>
      `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${runs
        .map((r) => `<a:t>${r}</a:t>`)
        .join('')}</p:sld>`;
    zip.file('ppt/slides/slide2.xml', slide(['Sala Grande', '300 posti platea']));
    zip.file('ppt/slides/slide1.xml', slide(['Villa dei Pini', 'Presentazione']));
    zip.file('ppt/presentation.xml', '<x/>');
    const buffer = Buffer.from(await zip.generateAsync({ type: 'arraybuffer' }));
    const text = await pptxToText(buffer);
    expect(text.split('\n')).toEqual(['Villa dei Pini Presentazione', 'Sala Grande 300 posti platea']);
  });
});
