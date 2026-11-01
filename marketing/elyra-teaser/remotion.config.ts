import { Config } from "@remotion/cli/config";

/* Deterministic, high-quality H.264 + stereo AAC master. */
Config.setVideoImageFormat("png");
Config.setCodec("h264");
Config.setCrf(14);
Config.setPixelFormat("yuv420p");
Config.setAudioCodec("aac");
Config.setAudioBitrate("320k");
Config.setColorSpace("bt709");
Config.setConcurrency(4);
// Use the container's pre-installed headless shell when present (no download).
if (process.env.REMOTION_BROWSER) Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
