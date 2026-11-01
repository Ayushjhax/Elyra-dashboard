import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
import { F } from "./theme";

/* All three faces are local files (public/fonts) — no network at render
   time. Fustat is the website's variable Latin cut (OFL 1.1); General Sans
   and DM Serif Display are the Android app's own files (ITF FFL / OFL 1.1). */

let started: Promise<unknown> | null = null;

export function loadFonts(): Promise<unknown> {
  if (started) return started;
  started = Promise.all([
    loadFont({ family: F.display, url: staticFile("fonts/Fustat-Latin-Variable.woff2"), weight: "200 800" }),
    loadFont({ family: F.sans, url: staticFile("fonts/GeneralSans-Regular.otf"), weight: "400" }),
    loadFont({ family: F.sans, url: staticFile("fonts/GeneralSans-Medium.otf"), weight: "500" }),
    loadFont({ family: F.sans, url: staticFile("fonts/GeneralSans-Semibold.otf"), weight: "600" }),
    loadFont({ family: F.serif, url: staticFile("fonts/DMSerifDisplay-Regular.ttf"), weight: "400" }),
  ]);
  return started;
}
