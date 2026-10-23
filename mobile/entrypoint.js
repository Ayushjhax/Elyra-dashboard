/* ---------------------------------------------------------------------------
   The app's entry. Polyfills load before anything else, in the order Privy's
   React Native installation guide gives — Privy, the Solana libraries and
   the signing code all expect them to be global before their first import.
--------------------------------------------------------------------------- */

import "fast-text-encoding";
import "react-native-get-random-values";
import "@ethersproject/shims";
import { Buffer } from "buffer";

global.Buffer = global.Buffer ?? Buffer;

import "expo-router/entry";
