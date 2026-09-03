import puppeteer, { type Browser } from 'puppeteer';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserPromise;
}

export interface PdfOptions {
  /** Rodapé (HTML puppeteer, com <span class="pageNumber"></span> etc). Liga displayHeaderFooter. */
  footerTemplate?: string;
  headerTemplate?: string;
  margin?: { top?: string; bottom?: string; left?: string; right?: string };
}

/** Converte um HTML completo em um PDF A4 (Buffer). */
export async function renderHtmlToPdf(html: string, opts: PdfOptions = {}): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const usaRodape = !!(opts.footerTemplate || opts.headerTemplate);
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: usaRodape,
      headerTemplate: opts.headerTemplate ?? '<span></span>',
      footerTemplate: opts.footerTemplate ?? '<span></span>',
      margin: {
        top: opts.margin?.top ?? '20mm',
        bottom: opts.margin?.bottom ?? (usaRodape ? '24mm' : '20mm'),
        left: opts.margin?.left ?? '18mm',
        right: opts.margin?.right ?? '18mm',
      },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

/** Fecha o navegador (usado no shutdown gracioso). */
export async function closeBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}
