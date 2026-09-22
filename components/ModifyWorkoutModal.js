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

let nextExerciseId = 1;

function ModifyWorkoutForm({ exercises, onClose, onSave }) {
  const [items, setItems] = useState(exercises);

  const canSave = items.some((item) => item.name.trim().length > 0);

  const updateField = (index, field, value) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const moveItem = (index, direction) => {
    setItems((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const addItem = () => {
    nextExerciseId += 1;
    setItems((prev) => [...prev, { id: `new-${nextExerciseId}`, name: '', sets: 1, reps: '' }]);
  };

  const handleSave = () => {
    if (!canSave) return;
    onSave(
      items
        .map((item) => ({
          ...item,
          name: item.name.trim(),
          reps: item.reps.trim(),
          sets: Math.max(1, parseInt(item.sets, 10) || 1),
        }))
        .filter((item) => item.name.length > 0),
    );
  };

  return (
    <View style={styles.sheet}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Modify Workout</Text>

        {items.map((item, index) => (
          <View key={item.id} style={styles.exerciseCard}>
            <View style={styles.exerciseHeaderRow}>
              <Text style={styles.exerciseIndex}>{index + 1}.</Text>
              <TextInput
                style={[styles.input, styles.nameInput]}
                value={item.name}
                onChangeText={(value) => updateField(index, 'name', value)}
                placeholder="Exercise name"
                placeholderTextColor={colors.textOnSurfaceFaint}
              />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeItem(index)}
                accessibilityLabel={`Remove ${item.name || 'exercise'}`}
              >
                <Text style={styles.removeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.exerciseFieldsRow}>
              <View style={styles.setsField}>
                <Text style={styles.label}>Sets</Text>
                <TextInput
                  style={styles.input}
                  value={String(item.sets)}
                  onChangeText={(value) => updateField(index, 'sets', value)}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor={colors.textOnSurfaceFaint}
                />
              </View>
              <View style={styles.repsField}>
                <Text style={styles.label}>Reps / Distance</Text>
                <TextInput
                  style={styles.input}
                  value={item.reps}
                  onChangeText={(value) => updateField(index, 'reps', value)}
                  placeholder="e.g. 12 or 500m"
                  placeholderTextColor={colors.textOnSurfaceFaint}
                />
              </View>
            </View>

            <View style={styles.reorderRow}>
              <TouchableOpacity
                style={[styles.reorderButton, index === 0 && styles.reorderButtonDisabled]}
                onPress={() => moveItem(index, -1)}
                disabled={index === 0}
              >
                <Text style={styles.reorderButtonText}>▲ Move Up</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.reorderButton,
                  index === items.length - 1 && styles.reorderButtonDisabled,
                ]}
                onPress={() => moveItem(index, 1)}
                disabled={index === items.length - 1}
              >
                <Text style={styles.reorderButtonText}>▼ Move Down</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.addButton} onPress={addItem}>
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

export default function ModifyWorkoutModal({ visible, exercises, onClose, onSave }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {visible && exercises && (
          <ModifyWorkoutForm exercises={exercises} onClose={onClose} onSave={onSave} />
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
    marginBottom: spacing.md,
  },
  exerciseCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  exerciseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  exerciseIndex: {
    color: colors.textOnSurfaceMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  nameInput: {
    flex: 1,
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: colors.textOnSurfaceMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  exerciseFieldsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  setsField: {
    width: 72,
  },
  repsField: {
    flex: 1,
  },
  label: {
    color: colors.textOnSurfaceMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.textOnSurface,
  },
  reorderRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reorderButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
  },
  reorderButtonDisabled: {
    opacity: 0.35,
  },
  reorderButtonText: {
    color: colors.textOnSurfaceMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  addButton: {
    marginTop: spacing.xs,
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
