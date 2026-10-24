import { Redirect } from "expo-router";

/* The old "new alert" route. Price rules are set in Alerts & automation, so
   anything still linking here lands there. */
export default function AlertScreen() {
  return <Redirect href="/automation" />;
}
