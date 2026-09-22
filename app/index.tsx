import { StyleSheet, Text, View } from 'react-native';

const WORDMARK = 'FincWin';

export default function BootScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.wordmark}>{WORDMARK}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FBFAF7',
  },
  wordmark: {
    fontSize: 34,
    fontWeight: '600',
    color: '#111111',
  },
});
