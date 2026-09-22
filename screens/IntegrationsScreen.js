import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../constants/theme';

const initialIntegrations = [
  { id: 'strava', name: 'Strava', detail: 'Runs & Hyrox sessions', connected: true },
  { id: 'garmin', name: 'Garmin Connect', detail: 'Watch metrics & HR', connected: true },
  { id: 'apple-health', name: 'Apple Health', detail: 'Steps & sleep', connected: false },
  { id: 'whoop', name: 'Whoop', detail: 'Recovery & strain', connected: false },
  { id: 'training-peaks', name: 'TrainingPeaks', detail: 'Coach-assigned plans', connected: true },
];

export default function IntegrationsScreen() {
  const [integrations, setIntegrations] = useState(initialIntegrations);

  const toggleConnection = (id) => {
    setIntegrations((prev) =>
      prev.map((item) => (item.id === id ? { ...item, connected: !item.connected } : item)),
    );
  };

  const connectedCount = integrations.filter((item) => item.connected).length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Integrations</Text>
        <Text style={styles.subtitle}>
          {connectedCount}/{integrations.length} connected · data syncs to your coach
        </Text>

        <View style={styles.list}>
          {integrations.map((item) => (
            <View key={item.id} style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowDetail}>{item.detail}</Text>
                <Text
                  style={[
                    styles.rowStatus,
                    item.connected ? styles.rowStatusConnected : styles.rowStatusDisconnected,
                  ]}
                >
                  {item.connected ? 'Connected' : 'Not connected'}
                </Text>
              </View>
              <Switch
                value={item.connected}
                onValueChange={() => toggleConnection(item.id)}
                trackColor={{ false: colors.border, true: colors.primaryMuted }}
                thumbColor={item.connected ? colors.primary : colors.textFaint}
              />
            </View>
          ))}
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteText}>
            Connected apps sync automatically each night. Pull down on Home to force a manual
            sync before your next session.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rowDetail: {
    color: colors.textMuted,
    fontSize: 13,
  },
  rowStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  rowStatusConnected: {
    color: colors.success,
  },
  rowStatusDisconnected: {
    color: colors.textFaint,
  },
  noteCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  noteText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
});
