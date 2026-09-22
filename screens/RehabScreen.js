import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '../constants/theme';

const activeIssues = [
  { id: '1', area: 'Right Achilles', status: 'Managing', severity: 'warning' },
];

const mobilityRoutine = [
  { id: '1', name: 'Calf & Achilles isometrics', duration: '3 x 45s' },
  { id: '2', name: 'Hip flexor stretch', duration: '2 x 60s / side' },
  { id: '3', name: 'Thoracic rotations', duration: '2 x 10 / side' },
  { id: '4', name: 'Ankle dorsiflexion drill', duration: '3 x 12' },
  { id: '5', name: 'Foam roll quads & calves', duration: '5 min' },
];

const recoveryTips = [
  'Prioritise 7-9 hours of sleep on double-session days.',
  'Keep Achilles load in a pain range of 0-3/10 during isometrics.',
  'Hydrate and re-fuel within 30 minutes of finishing a Hyrox simulation.',
];

export default function RehabScreen() {
  const [checked, setChecked] = useState({});

  const toggleItem = (id) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Rehab & Recovery</Text>

        <View style={styles.statusBanner}>
          <Text style={styles.statusBannerTitle}>
            {activeIssues.length > 0 ? 'Active niggles' : 'No active injuries'}
          </Text>
          {activeIssues.map((issue) => (
            <View key={issue.id} style={styles.issueRow}>
              <View style={styles.issueDot} />
              <Text style={styles.issueText}>
                {issue.area} — {issue.status}
              </Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.logButton}>
          <Text style={styles.logButtonText}>+ Log a niggle or injury</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Today's Mobility Routine</Text>
        <View style={styles.routineList}>
          {mobilityRoutine.map((item) => {
            const isDone = !!checked[item.id];
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.routineRow, isDone && styles.routineRowDone]}
                onPress={() => toggleItem(item.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, isDone && styles.checkboxDone]}>
                  {isDone && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={styles.routineInfo}>
                  <Text style={[styles.routineName, isDone && styles.routineNameDone]}>
                    {item.name}
                  </Text>
                  <Text style={styles.routineDuration}>{item.duration}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Recovery Tips</Text>
        <View style={styles.tipsCard}>
          {recoveryTips.map((tip) => (
            <Text key={tip} style={styles.tipText}>
              • {tip}
            </Text>
          ))}
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
  statusBanner: {
    backgroundColor: colors.warningMuted,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  statusBannerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  issueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.warning,
  },
  issueText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  logButton: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  logButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  routineList: {
    gap: spacing.sm,
  },
  routineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  routineRowDone: {
    borderColor: colors.success,
    backgroundColor: colors.successMuted,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  checkmark: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '700',
  },
  routineInfo: {
    flex: 1,
    gap: 2,
  },
  routineName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  routineNameDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  routineDuration: {
    color: colors.textMuted,
    fontSize: 13,
  },
  tipsCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  tipText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
