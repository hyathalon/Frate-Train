import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radii, spacing } from '../constants/theme';

function SessionEditForm({ session, onClose, onSave }) {
  const [title, setTitle] = useState(session.title);
  const [duration, setDuration] = useState(session.duration);
  const [exercises, setExercises] = useState(session.exercises);

  const trimmedExercises = exercises.map((exercise) => exercise.trim());
  const canSave =
    title.trim().length > 0 &&
    duration.trim().length > 0 &&
    trimmedExercises.some((exercise) => exercise.length > 0);

  const updateExercise = (index, value) => {
    setExercises((prev) => prev.map((exercise, i) => (i === index ? value : exercise)));
  };

  const removeExercise = (index) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const addExercise = () => {
    setExercises((prev) => [...prev, '']);
  };

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      title: title.trim(),
      duration: duration.trim(),
      exercises: trimmedExercises.filter((exercise) => exercise.length > 0),
    });
  };

  return (
    <View style={styles.sheet}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Edit Session</Text>

        <Text style={styles.label}>Session Name</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. HYROX Simulation"
          placeholderTextColor={colors.textOnSurfaceFaint}
        />

        <Text style={styles.label}>Estimated Duration</Text>
        <TextInput
          style={styles.input}
          value={duration}
          onChangeText={setDuration}
          placeholder="e.g. 65 min"
          placeholderTextColor={colors.textOnSurfaceFaint}
        />

        <Text style={styles.label}>Exercises</Text>
        {exercises.map((exercise, index) => (
          <View key={index} style={styles.exerciseRow}>
            <TextInput
              style={[styles.input, styles.exerciseInput]}
              value={exercise}
              onChangeText={(value) => updateExercise(index, value)}
              placeholder={`Exercise ${index + 1}`}
              placeholderTextColor={colors.textOnSurfaceFaint}
            />
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => removeExercise(index)}
              accessibilityLabel={`Remove exercise ${index + 1}`}
            >
              <Text style={styles.removeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={styles.addButton} onPress={addExercise}>
          <Text style={styles.addButtonText}>+ Add Exercise</Text>
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!canSave}
          >
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

export default function SessionEditModal({ visible, session, onClose, onSave }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {visible && session && (
          <SessionEditForm key={session.title} session={session} onClose={onClose} onSave={onSave} />
        )}
      </KeyboardAvoidingView>
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
    maxHeight: '85%',
  },
  title: {
    color: colors.textOnSurface,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.textOnSurfaceMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.textOnSurface,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  exerciseInput: {
    flex: 1,
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: colors.textOnSurfaceMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  addButton: {
    marginTop: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  addButtonText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
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
