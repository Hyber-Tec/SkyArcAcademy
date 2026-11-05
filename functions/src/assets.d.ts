/** Pictures the build puts in the bundle as their bytes (esbuild's binary loader, functions/package.json). */
declare module '*.png' {
  const bytes: Uint8Array
  export default bytes
}
