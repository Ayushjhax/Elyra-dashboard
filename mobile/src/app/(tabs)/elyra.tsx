import { StyleSheet, View } from "react-native";
import { ReviewCards } from "~/components/actions/ReviewCards";
import { EmptyState, Screen } from "~/components/ui/layout";

/* Ask Elyra arrives with a later prompt. The actions it prepares are already
   real, so their review cards sit here, where they will be asked for. */
export default function ElyraScreen() {
  return (
    <Screen>
      <View style={styles.cards}>
        <ReviewCards />
      </View>
      <EmptyState title="Elyra" body="Ask Elyra and Capital Intelligence arrive here." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cards: { marginBottom: 8 },
});
