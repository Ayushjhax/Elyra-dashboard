import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

/* ---------------------------------------------------------------------------
   The account's photo, kept on this phone.

   Picked from the system photo picker (no storage permission), cropped to a
   circle there, then scaled to a 256px square JPEG and kept as a data URI in
   the persisted store — small enough to sit beside the other preferences,
   and gone with them when another account signs in (claimPhoneFor). Nothing
   is uploaded: the website still shows the wallet's identicon.
--------------------------------------------------------------------------- */

export const AVATAR_EDGE = 256;

/** Asks for a photo; the data URI to keep, or null when the person backed out. */
export async function pickAvatar(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: "images",
    allowsEditing: true,
    aspect: [1, 1],
    shape: "oval",
    quality: 1,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (asset === undefined) return null;

  const context = ImageManipulator.manipulate(asset.uri);
  /* The crop is square already; a photo picked without it is centred. */
  const edge = Math.min(asset.width, asset.height);
  if (asset.width !== asset.height && edge > 0) {
    context.crop({ originX: (asset.width - edge) / 2, originY: (asset.height - edge) / 2, width: edge, height: edge });
  }
  context.resize({ width: AVATAR_EDGE, height: AVATAR_EDGE });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
  if (saved.base64 === undefined) throw new Error("The photo could not be read.");
  return `data:image/jpeg;base64,${saved.base64}`;
}
