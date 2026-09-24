import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PILLAR_MAP } from '../constants/pillars';
import { radii, spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';

const STRENGTH_WEAKNESS_OPTIONS = ['Running', 'Strength', 'Stations', 'Endurance', 'Recovery'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MIN_HOURS = 3;
const MAX_HOURS = 15;

function MultiSelectChips({ label, options, value, onToggle, styles }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((option) => {
          const selected = value.includes(option);
          return (
            <TouchableOpacity
              key={option}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onToggle(option)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function ProgramBuilderScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [weeklyHours, setWeeklyHours] = useState(8);
  const [weeksUntilRace, setWeeksUntilRace] = useState('');
  const [strengths, setStrengths] = useState([]);
  const [weaknesses, setWeaknesses] = useState([]);
  const [trainingDays, setTrainingDays] = useState([]);
  const [goal, setGoal] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [program, setProgram] = useState(null);

  const toggleInArray = (setter) => (value) => {
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setProgram(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-program', {
        body: {
          name: name.trim() || undefined,
          weeklyHours,
          weeksUntilRace: Number(weeksUntilRace) || undefined,
          strengths,
          weaknesses,
          trainingDays,
          goal: goal.trim(),
        },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setProgram(data.program);
    } catch (err) {
      setError(err.message || 'Failed to generate program.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Program Builder</Text>
          <Text style={styles.subtitle}>
            AI-generated training programs built on The Hyathlon System.
          </Text>

          <View style={styles.card}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Athlete name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Sam Taylor"
                placeholderTextColor={colors.textOnSurfaceFaint}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Weeks until race</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 12"
                placeholderTextColor={colors.textOnSurfaceFaint}
                value={weeksUntilRace}
                onChangeText={setWeeksUntilRace}
                keyboardType="number-pad"
              />
            </View>

            <View style={styles.field}>
              <View style={styles.sliderLabelRow}>
                <Text style={styles.fieldLabel}>Weekly training hours available</Text>
                <Text style={styles.sliderValue}>{weeklyHours}h</Text>
              </View>
              <Slider
                minimumValue={MIN_HOURS}
                maximumValue={MAX_HOURS}
                step={1}
                value={weeklyHours}
                onValueChange={setWeeklyHours}
                minimumTrackTintColor={colors.primary}
                maximumTrackTintColor={colors.border}
                thumbTintColor={colors.primary}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Training days available</Text>
              <View style={styles.chipRow}>
                {DAYS.map((day) => {
                  const selected = trainingDays.includes(day);
                  return (
                    <TouchableOpacity
                      key={day}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => toggleInArray(setTrainingDays)(day)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{day}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <MultiSelectChips
              label="Strengths"
              options={STRENGTH_WEAKNESS_OPTIONS}
              value={strengths}
              onToggle={toggleInArray(setStrengths)}
              styles={styles}
            />

            <MultiSelectChips
              label="Weaknesses"
              options={STRENGTH_WEAKNESS_OPTIONS}
              value={weaknesses}
              onToggle={toggleInArray(setWeaknesses)}
              styles={styles}
            />

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Race goal</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Sub 90 min"
                placeholderTextColor={colors.textOnSurfaceFaint}
                value={goal}
                onChangeText={setGoal}
              />
            </View>

            <TouchableOpacity
              style={[styles.generateButton, loading && styles.generateButtonDisabled]}
              onPress={handleGenerate}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <>
                  <ActivityIndicator color="#FFFFFF" />
                  <Text style={styles.generateButtonText}>Building your program...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={16} color="#FFFFFF" />
                  <Text style={styles.generateButtonText}>Generate Program</Text>
                </>
              )}
            </TouchableOpacity>

            {error && <Text style={styles.errorText}>{error}</Text>}
          </View>

          {program?.weeks?.map((week) => (
            <View key={week.week} style={styles.card}>
              <Text style={styles.weekTitle}>
                Week {week.week}
                {week.focus ? ` — ${week.focus}` : ''}
              </Text>

              {(week.sessions || []).map((session, sessionIndex) => {
                const pillar = PILLAR_MAP[session.pillar];
                return (
                  <View key={sessionIndex} style={styles.sessionRow}>
                    <View style={styles.sessionHeaderRow}>
                      <Text style={styles.sessionDay}>{session.day}</Text>
                      {pillar && (
                        <View style={[styles.pillarChip, { backgroundColor: `${pillar.color}22` }]}>
                          <View style={[styles.pillarDot, { backgroundColor: pillar.color }]} />
                          <Text style={[styles.pillarChipText, { color: pillar.color }]}>
                            {pillar.name}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.sessionTitle}>{session.title}</Text>
                    <Text style={styles.sessionMeta}>
                      {[session.duration && `${session.duration} min`].filter(Boolean).join(' · ')}
                    </Text>
                    {session.notes ? <Text style={styles.sessionNotes}>{session.notes}</Text> : null}
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: spacing.md,
      paddingBottom: spacing.xl,
      gap: spacing.lg,
    },
    title: {
      color: colors.text,
      fontSize: 26,
      fontWeight: '700',
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 13,
      marginTop: -spacing.sm,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.md,
    },
    field: {
      gap: spacing.xs,
    },
    fieldLabel: {
      color: colors.textOnSurfaceMuted,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    input: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      color: colors.textOnSurface,
      fontSize: 14,
    },
    sliderLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sliderValue: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '700',
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    chip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 8,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceAlt,
    },
    chipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      color: colors.textOnSurfaceMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    chipTextSelected: {
      color: '#FFFFFF',
    },
    generateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      paddingVertical: spacing.sm + 2,
    },
    generateButtonDisabled: {
      opacity: 0.6,
    },
    generateButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    errorText: {
      color: '#EF4444',
      fontSize: 13,
    },
    weekTitle: {
      color: colors.textOnSurface,
      fontSize: 17,
      fontWeight: '700',
    },
    sessionRow: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radii.md,
      padding: spacing.sm,
      gap: 4,
    },
    sessionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sessionDay: {
      color: colors.textOnSurfaceMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    pillarChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.xs,
      paddingVertical: 3,
      borderRadius: radii.pill,
    },
    pillarDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    pillarChipText: {
      fontSize: 10,
      fontWeight: '700',
    },
    sessionTitle: {
      color: colors.textOnSurface,
      fontSize: 14,
      fontWeight: '700',
    },
    sessionMeta: {
      color: colors.textOnSurfaceMuted,
      fontSize: 12,
    },
    sessionNotes: {
      color: colors.textOnSurfaceFaint,
      fontSize: 12,
      fontStyle: 'italic',
    },
  });
}
