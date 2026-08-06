declare module 'extenso' {
  interface ExtensoOptions {
    mode?: 'number' | 'currency' | 'ordinal';
    locale?: 'br' | 'pt';
    number?: { gender?: 'm' | 'f'; scale?: 'short' | 'long' };
    currency?: { type?: string };
    negative?: 'formal' | 'informal';
  }
  function extenso(value: string | number, options?: ExtensoOptions): string;
  export = extenso;
}
