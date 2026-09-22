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
import { addDaysISO, formatDate, isValidDateString, todayISODate } from '../utils/date';

const QUICK_OPTIONS = [
  { label: 'Today', date: todayISODate() },
  { label: 'Tomorrow', date: addDaysISO(1) },
  { label: 'In 2 days', date: addDaysISO(2) },
  { label: 'In 3 days', date: addDaysISO(3) },
];

function MoveSessionForm({ currentDate, onClose, onSave, label }) {
  const [date, setDate] = useState(currentDate);

  const dateValid = isValidDateString(date);

  const handleSave = () => {
    if (!dateValid) return;
    onSave(date);
  };

  return (
    <View style={styles.sheet}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Move {label}</Text>
        <Text style={styles.subtitle}>Currently scheduled for {formatDate(currentDate)}</Text>

        <View style={styles.quickRow}>
          {QUICK_OPTIONS.map((option) => {
            const active = date === option.date;
            return (
              <TouchableOpacity
                key={option.label}
                style={[styles.quickChip, active && styles.quickChipActive]}
                onPress={() => setDate(option.date)}
              >
                <Text style={[styles.quickChipText, active && styles.quickChipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Or pick a custom date</Text>
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

        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, !dateValid && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={!dateValid}
          >
            <Text style={styles.saveButtonText}>Move {label}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

export default function MoveSessionModal({
  visible,
  currentDate,
  onClose,
  onSave,
  label = 'Session',
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {visible && (
          <MoveSessionForm
            key={currentDate}
            currentDate={currentDate}
            onClose={onClose}
            onSave={onSave}
            label={label}
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
  },
  subtitle: {
    color: colors.textOnSurfaceMuted,
    fontSize: 13,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  quickChipText: {
    color: colors.textOnSurfaceMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  quickChipTextActive: {
    color: colors.primary,
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
