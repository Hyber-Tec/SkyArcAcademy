// libheif-js's browser build (the libheif HEIC decoder, its WebAssembly inside the file): only what the card reader uses.
declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  interface HeifImage {
    get_width(): number
    get_height(): number
    display(target: { data: Uint8ClampedArray; width: number; height: number }, done: (result: { data: Uint8ClampedArray; width: number; height: number } | null) => void): void
    free(): void
  }
  interface LibHeif {
    /** Resolves once the module is ready (it is at once today; heic-decode waits for it all the same). */
    ready?: Promise<unknown>
    HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[]; decoder?: { delete(): void } }
  }
  const factory: (options?: object) => LibHeif | Promise<LibHeif>
  export default factory
}
