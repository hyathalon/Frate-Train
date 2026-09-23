import { Ionicons } from '@expo/vector-icons';
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
import { supabase } from '../lib/supabase';
import { radii, spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const GOALS = ['Hyrox', 'Running', 'General Fitness'];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const FREQUENCIES = [3, 4, 5];

function ChipGroup({ label, options, value, onChange, styles }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onChange(option)}
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
  const [goal, setGoal] = useState(GOALS[0]);
  const [level, setLevel] = useState(LEVELS[0]);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(FREQUENCIES[1]);
  const [equipment, setEquipment] = useState('');
  const [injuries, setInjuries] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [program, setProgram] = useState(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setProgram(null);
    setSaved(false);
    setSaveError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-program', {
        body: {
          name: name.trim() || undefined,
          goal,
          level,
          sessionsPerWeek,
          equipment: equipment.trim() || undefined,
          injuries: injuries.trim() || undefined,
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

  const handleSave = async () => {
    if (!program) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const { data: programRow, error: programError } = await supabase
        .from('programs')
        .insert({
          code: `AI-${Date.now()}`,
          name: program.program_name || name.trim() || 'AI Generated Program',
          goal: program.goal || goal,
          level: program.level || level,
          frequency: program.frequency || `${sessionsPerWeek}x/week`,
          category: 'AI',
          source: 'ai_generated',
          athlete_name: name.trim() || null,
          sessions_per_week: sessionsPerWeek,
          injuries: injuries.trim() || null,
          equipment: equipment.trim() || null,
          program_json: program,
        })
        .select()
        .single();
      if (programError) throw programError;

      const blocks = program.blocks || [];
      for (let i = 0; i < blocks.length; i += 1) {
        const block = blocks[i];
        const { data: blockRow, error: blockError } = await supabase
          .from('blocks')
          .insert({
            program_id: programRow.id,
            name: block.name,
            focus: block.focus || null,
            block_order: i + 1,
          })
          .select()
          .single();
        if (blockError) throw blockError;

        const exercises = (block.exercises || []).map((ex, idx) => ({
          block_id: blockRow.id,
          name: ex.name,
          sets: ex.sets != null ? String(ex.sets) : null,
          reps: ex.reps != null ? String(ex.reps) : null,
          rest: ex.rest != null ? String(ex.rest) : null,
          notes: ex.notes || null,
          exercise_order: idx + 1,
        }));
        if (exercises.length) {
          const { error: exError } = await supabase.from('exercises').insert(exercises);
          if (exError) throw exError;
        }
      }
      setSaved(true);
    } catch (err) {
      setSaveError(err.message || 'Failed to save program.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Program Builder</Text>
          <Text style={styles.subtitle}>
            AI-generated training programs, grounded in Hyathlon Performance methodology.
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

            <ChipGroup label="Goal" options={GOALS} value={goal} onChange={setGoal} styles={styles} />
            <ChipGroup label="Level" options={LEVELS} value={level} onChange={setLevel} styles={styles} />

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Sessions per week</Text>
              <View style={styles.chipRow}>
                {FREQUENCIES.map((freq) => {
                  const selected = sessionsPerWeek === freq;
                  return (
                    <TouchableOpacity
                      key={freq}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setSessionsPerWeek(freq)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {freq}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Available equipment</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="e.g. Dumbbells, sled, rower, no barbell"
                placeholderTextColor={colors.textOnSurfaceFaint}
                value={equipment}
                onChangeText={setEquipment}
                multiline
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Injuries / limitations</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="e.g. Left knee — avoid deep lunges"
                placeholderTextColor={colors.textOnSurfaceFaint}
                value={injuries}
                onChangeText={setInjuries}
                multiline
              />
            </View>

            <TouchableOpacity
              style={[styles.generateButton, loading && styles.generateButtonDisabled]}
              onPress={handleGenerate}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={16} color="#FFFFFF" />
                  <Text style={styles.generateButtonText}>Generate Program</Text>
                </>
              )}
            </TouchableOpacity>

            {error && <Text style={styles.errorText}>{error}</Text>}
          </View>

          {program && (
            <View style={styles.card}>
              <View style={styles.outputHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.programName}>{program.program_name || 'Generated Program'}</Text>
                  <Text style={styles.programMeta}>
                    {[program.goal, program.level, program.frequency].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.generateButtonDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.saveButtonText}>{saved ? 'Saved ✓' : 'Save Program'}</Text>
                  )}
                </TouchableOpacity>
              </View>

              {saveError && <Text style={styles.errorText}>{saveError}</Text>}

              {(program.blocks || []).map((block, blockIndex) => (
                <View key={blockIndex} style={styles.block}>
                  <Text style={styles.blockTitle}>
                    {block.name}
                    {block.focus ? ` — ${block.focus}` : ''}
                  </Text>
                  {(block.exercises || []).map((ex, exIndex) => (
                    <View key={exIndex} style={styles.exerciseRow}>
                      <Text style={styles.exerciseName}>{ex.name}</Text>
                      <Text style={styles.exerciseMeta}>
                        {[ex.sets && `${ex.sets} sets`, ex.reps, ex.rest && `rest ${ex.rest}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                      {ex.notes ? <Text style={styles.exerciseNotes}>{ex.notes}</Text> : null}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}
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
    inputMultiline: {
      minHeight: 60,
      textAlignVertical: 'top',
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
    outputHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    programName: {
      color: colors.textOnSurface,
      fontSize: 18,
      fontWeight: '700',
    },
    programMeta: {
      color: colors.textOnSurfaceMuted,
      fontSize: 12,
      marginTop: 2,
    },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      minWidth: 96,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveButtonText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    block: {
      gap: spacing.xs,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    blockTitle: {
      color: colors.textOnSurface,
      fontSize: 14,
      fontWeight: '700',
    },
    exerciseRow: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radii.sm,
      padding: spacing.xs,
      gap: 2,
    },
    exerciseName: {
      color: colors.textOnSurface,
      fontSize: 13,
      fontWeight: '600',
    },
    exerciseMeta: {
      color: colors.textOnSurfaceMuted,
      fontSize: 12,
    },
    exerciseNotes: {
      color: colors.textOnSurfaceFaint,
      fontSize: 11,
      fontStyle: 'italic',
    },
  });
}
