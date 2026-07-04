/**
 * Optional loader for the native `sharp` image library.
 *
 * sharp ships prebuilt native binaries. Since libvips 8.18 (sharp 0.35) the
 * prebuilt Linux x64 binary requires a CPU with the x86-64-v2 microarchitecture
 * (SSE4.2, POPCNT, …). On older CPUs - or minimal VM CPU models such as QEMU
 * `kvm64`, which do not expose those features to the guest - sharp throws
 * "Unsupported CPU" while loading its addon at `require()` time.
 *
 * Both consumers (overlay rendering and collection posters) import sharp at
 * module top level, so an uncaught load failure would crash the whole server
 * during Nest bootstrap. We require it inside a try/catch instead: the server
 * keeps booting and the guarded callers degrade with {@link
 * SHARP_UNAVAILABLE_MESSAGE} rather than crash-looping. Only the image features
 * are affected.
 */
type SharpFactory = typeof import('sharp');

let loaded: SharpFactory | null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  loaded = require('sharp') as SharpFactory;
} catch {
  loaded = null;
}

/** The sharp factory, or `null` when the native module could not be loaded. */
export const sharp = loaded;

/** True when the native sharp module loaded successfully. */
export const isSharpAvailable = loaded !== null;

/** Operator-facing explanation + remediation, shared by every guard. */
export const SHARP_UNAVAILABLE_MESSAGE =
  'Image processing is unavailable: the native "sharp" module could not be ' +
  'loaded. Its prebuilt Linux x64 binaries require a CPU with the x86-64-v2 ' +
  'microarchitecture. If you run Maintainerr in a VM, set the CPU type to ' +
  '"host", "x86-64-v2", or newer. Overlay rendering and collection poster ' +
  'generation stay disabled until this is resolved.';
