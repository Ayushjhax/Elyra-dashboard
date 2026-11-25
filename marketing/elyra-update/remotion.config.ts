import { Config } from "@remotion/cli/config";

/* 1280 × 720 at 60 fps, rendered silent; scripts/finalize.sh muxes AAC from
   the 24-bit WAV master so the audio never passes through a resampler. */
Config.setVideoImageFormat("png");
Config.setCodec("h264");
Config.setCrf(14);
Config.setPixelFormat("yuv420p");
Config.setColorSpace("bt709");
Config.setConcurrency(4);
Config.setChromiumOpenGlRenderer("angle");
if (process.env.REMOTION_BROWSER) Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
Config.setCachingEnabled(false);
