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
import { isValidDateString } from '../utils/date';

const RACE_TYPES = ['Hyrox', '5K', '10K', 'Half', 'Full'];

function RaceEditForm({ race, onClose, onSave }) {
  const [name, setName] = useState(race.name);
  const [date, setDate] = useState(race.date);
  const [type, setType] = useState(race.type);
  const [location, setLocation] = useState(race.location);

  const dateValid = isValidDateString(date);
  const canSave = name.trim().length > 0 && dateValid && location.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({ name: name.trim(), date, type, location: location.trim() });
  };

  return (
    <View style={styles.sheet}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Edit Race</Text>

        <Text style={styles.label}>Race Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. HYROX Melbourne"
          placeholderTextColor={colors.textOnSurfaceFaint}
        />

        <Text style={styles.label}>Race Type</Text>
        <View style={styles.typeRow}>
          {RACE_TYPES.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.typeChip, type === option && styles.typeChipActive]}
              onPress={() => setType(option)}
            >
              <Text style={[styles.typeChipText, type === option && styles.typeChipTextActive]}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Date</Text>
        <TextInput
          style={[styles.input, date.length > 0 && !dateValid && styles.inputError]}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textOnSurfaceFaint}
          autoCapitalize="none"
        />
        {date.length > 0 && !dateValid && (
          <Text style={styles.errorText}>Use the format YYYY-MM-DD</Text>
        )}

        <Text style={styles.label}>Location</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="e.g. Melbourne, AU"
          placeholderTextColor={colors.textOnSurfaceFaint}
        />

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

export default function RaceEditModal({ visible, race, onClose, onSave }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {visible && race && (
          <RaceEditForm
            key={`${race.name}-${race.date}`}
            race={race}
            onClose={onClose}
            onSave={onSave}
          />
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
  inputError: {
    borderColor: colors.primary,
  },
  errorText: {
    color: colors.primary,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  typeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  typeChipText: {
    color: colors.textOnSurfaceMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  typeChipTextActive: {
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
