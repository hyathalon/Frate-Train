import { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing } from '../constants/theme';
import {
  QUICK_WORKOUT_EQUIPMENT_OPTIONS,
  QUICK_WORKOUT_FOCUS_OPTIONS,
  QUICK_WORKOUT_TIME_OPTIONS,
} from '../utils/workoutGenerator';

const STEPS = [
  {
    key: 'time',
    question: 'How much time do you have?',
    options: QUICK_WORKOUT_TIME_OPTIONS.map((value) => ({ value, label: `${value} min` })),
  },
  {
    key: 'equipment',
    question: 'What equipment do you have?',
    options: QUICK_WORKOUT_EQUIPMENT_OPTIONS.map((value) => ({ value, label: value })),
  },
  {
    key: 'focus',
    question: "What's your focus today?",
    options: QUICK_WORKOUT_FOCUS_OPTIONS.map((value) => ({ value, label: value })),
  },
];

function QuickWorkoutForm({ onClose, onGenerate }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ time: null, equipment: null, focus: null });

  const current = STEPS[step];
  const selected = answers[current.key];
  const isLastStep = step === STEPS.length - 1;

  const handleNext = () => {
    if (!selected) return;
    if (isLastStep) {
      onGenerate(answers);
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (step === 0) {
      onClose();
    } else {
      setStep((s) => s - 1);
    }
  };

  return (
    <View style={styles.sheet}>
      <Text style={styles.stepLabel}>
        Step {step + 1} of {STEPS.length}
      </Text>
      <Text style={styles.title}>{current.question}</Text>

      <View style={styles.optionsList}>
        {current.options.map((option) => {
          const active = selected === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.optionRow, active && styles.optionRowActive]}
              onPress={() => setAnswers((prev) => ({ ...prev, [current.key]: option.value }))}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelButton} onPress={handleBack}>
          <Text style={styles.cancelButtonText}>{step === 0 ? 'Cancel' : 'Back'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, !selected && styles.saveButtonDisabled]}
          onPress={handleNext}
          disabled={!selected}
        >
          <Text style={styles.saveButtonText}>{isLastStep ? 'Generate Workout' : 'Next'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function QuickWorkoutModal({ visible, onClose, onGenerate }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {visible && <QuickWorkoutForm onClose={onClose} onGenerate={onGenerate} />}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  stepLabel: {
    color: colors.textOnSurfaceMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.textOnSurface,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  optionsList: {
    gap: spacing.sm,
  },
  optionRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  optionRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  optionText: {
    color: colors.textOnSurfaceMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  optionTextActive: {
    color: colors.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    color: colors.textOnSurface,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
