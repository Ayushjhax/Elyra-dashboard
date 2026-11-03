import { Config } from "@remotion/cli/config";

/* Deterministic, high-quality H.264 master. The film is rendered silent
   (--muted) and scripts/finalize.sh muxes AAC encoded from the 24-bit WAV
   master, so the audio never passes through Remotion's resampler. */
Config.setVideoImageFormat("png");
Config.setCodec("h264");
Config.setCrf(14);
Config.setPixelFormat("yuv420p");
Config.setColorSpace("bt709");
Config.setConcurrency(4); // 6 tabs exhausted memory/disk headroom on the 13" machine
Config.setChromiumOpenGlRenderer("angle");
if (process.env.REMOTION_BROWSER) Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
Config.setCachingEnabled(false); // the webpack cache is ~230 MB; this project renders rarely
