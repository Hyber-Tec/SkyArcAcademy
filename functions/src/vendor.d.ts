/** subset-font: HarfBuzz's subsetter (contractPdf.ts cuts the Korean font down to the characters a PDF draws). */
declare module 'subset-font' {
  export default function subsetFont(font: Uint8Array, text: string, options?: { targetFormat?: 'sfnt' | 'truetype' | 'woff' | 'woff2' }): Promise<Uint8Array>
}
