import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { htmlToText, pptxToText } from '../src/ingest/textExtract.js';

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
