import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { spacing, radii } from '../constants/theme';

// ─── Constants ──────────────────────────────────────────────────────────────

const TRAINING_OPTIONS = [
  'No structured plan',
  'Following an app',
  'AI-generated plans',
  'Self-programmed',
  'Working with a coach',
  'Other',
];

const EXPERIENCE_OPTIONS = [
  'First HYROX',
  '1–2 races',
  '3–5 races',
  '6+ races',
];

const DAYS_OPTIONS = ['2', '3', '4', '5', '6', '7'];

const GOAL_OPTIONS = [
  'Complete my first HYROX',
  'Beat a personal best',
  'Qualify for Worlds',
  'Podium / top-10',
  'Improve specific stations',
  'General fitness',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ChipGroup({ label, options, selected, onSelect, multi = false, colors }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map(opt => {
          const active = multi
            ? (selected || []).includes(opt)
            : selected === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => {
                if (multi) {
                  const cur = selected || [];
                  onSelect(
                    cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt]
                  );
                } else {
                  onSelect(opt === selected ? null : opt);
                }
              }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function Field({ label, children, colors }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function CoachingEnquiryScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    goals: [],
    targetTime: '',
    experience: null,
    daysAvailable: null,
    currentTraining: null,
    injuries: '',
    additionalInfo: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function validate() {
    if (!form.name.trim()) return 'Please enter your name.';
    if (!form.email.trim() || !form.email.includes('@'))
      return 'Please enter a valid email address.';
    if (!form.goals.length) return 'Please select at least one goal.';
    if (!form.experience) return 'Please select your HYROX experience level.';
    if (!form.daysAvailable) return 'Please select how many days you can train.';
    if (!form.currentTraining) return 'Please select your current training approach.';
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) {
      Alert.alert('Missing info', err);
      return;
    }

    setSubmitting(true);

    // Build email body
    const body = [
      `NAME: ${form.name}`,
      `EMAIL: ${form.email}`,
      form.phone ? `PHONE: ${form.phone}` : null,
      ``,
      `GOALS: ${form.goals.join(', ')}`,
      form.targetTime ? `TARGET TIME: ${form.targetTime}` : null,
      `EXPERIENCE: ${form.experience}`,
      `TRAINING DAYS: ${form.daysAvailable} days/week`,
      `CURRENT TRAINING: ${form.currentTraining}`,
      ``,
      `INJURIES / MEDICAL: ${form.injuries.trim() || 'None stated'}`,
      form.additionalInfo.trim()
        ? `ADDITIONAL INFO:\n${form.additionalInfo.trim()}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    // Use mailto as the delivery mechanism (opens device mail app)
    // In production you'd call a backend / Supabase Edge Function here
    const mailtoUrl =
      `mailto:coach@fratetrain.com.au` +
      `?subject=${encodeURIComponent('Hyathlon Coaching Enquiry — ' + form.name)}` +
      `&body=${encodeURIComponent(body)}`;

    try {
      const { Linking } = require('react-native');
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
        // Mark as submitted after opening mail app
        setSubmitting(false);
        setSubmitted(true);
      } else {
        // Fallback: show the info and ask them to email manually
        setSubmitting(false);
        Alert.alert(
          'No mail app found',
          `Please email coach@fratetrain.com.au with the following:\n\n${body}`,
          [{ text: 'OK', onPress: () => setSubmitted(true) }]
        );
      }
    } catch (e) {
      setSubmitting(false);
      Alert.alert('Error', 'Could not open mail app. Please email coach@fratetrain.com.au directly.');
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>🏆</Text>
          <Text style={styles.successTitle}>Enquiry Sent!</Text>
          <Text style={styles.successBody}>
            Thanks {form.name.split(' ')[0]}! The Hyathlon Coaching team will review your enquiry and be in touch shortly.
          </Text>
          <Text style={styles.successSub}>
            Keep an eye on {form.email} for our reply.
          </Text>
          <TouchableOpacity
            style={styles.newEnquiryBtn}
            onPress={() => {
              setSubmitted(false);
              setForm({
                name: '', email: '', phone: '', goals: [], targetTime: '',
                experience: null, daysAvailable: null, currentTraining: null,
                injuries: '', additionalInfo: '',
              });
            }}
          >
            <Text style={styles.newEnquiryBtnText}>New Enquiry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Hyathlon Coaching</Text>
            <Text style={styles.headerSub}>
              Work with Frates directly. Fill in your details and we'll be in touch with a personalised program.
            </Text>
          </View>

          {/* Contact */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Details</Text>

            <Field label="Full Name *" colors={colors}>
              <TextInput
                style={styles.input}
                placeholder="Jane Smith"
                placeholderTextColor={colors.textMuted}
                value={form.name}
                onChangeText={v => set('name', v)}
                autoCapitalize="words"
              />
            </Field>

            <Field label="Email *" colors={colors}>
              <TextInput
                style={styles.input}
                placeholder="jane@example.com"
                placeholderTextColor={colors.textMuted}
                value={form.email}
                onChangeText={v => set('email', v)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </Field>

            <Field label="Phone (optional)" colors={colors}>
              <TextInput
                style={styles.input}
                placeholder="+61 400 000 000"
                placeholderTextColor={colors.textMuted}
                value={form.phone}
                onChangeText={v => set('phone', v)}
                keyboardType="phone-pad"
              />
            </Field>
          </View>

          {/* Goals */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Training Goals</Text>

            <ChipGroup
              label="Primary goals * (select all that apply)"
              options={GOAL_OPTIONS}
              selected={form.goals}
              onSelect={v => set('goals', v)}
              multi
              colors={colors}
            />

            <Field label="Target finish time (optional)" colors={colors}>
              <TextInput
                style={styles.input}
                placeholder="e.g. 1:15:00"
                placeholderTextColor={colors.textMuted}
                value={form.targetTime}
                onChangeText={v => set('targetTime', v)}
              />
            </Field>
          </View>

          {/* Background */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Background</Text>

            <ChipGroup
              label="HYROX experience *"
              options={EXPERIENCE_OPTIONS}
              selected={form.experience}
              onSelect={v => set('experience', v)}
              colors={colors}
            />

            <ChipGroup
              label="Days available to train per week *"
              options={DAYS_OPTIONS}
              selected={form.daysAvailable}
              onSelect={v => set('daysAvailable', v)}
              colors={colors}
            />

            <ChipGroup
              label="Current training approach *"
              options={TRAINING_OPTIONS}
              selected={form.currentTraining}
              onSelect={v => set('currentTraining', v)}
              colors={colors}
            />
          </View>

          {/* Health */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Health & Injuries</Text>

            <Field label="Injuries or medical concerns" colors={colors}>
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="Any current or past injuries, medical conditions, or movements to avoid..."
                placeholderTextColor={colors.textMuted}
                value={form.injuries}
                onChangeText={v => set('injuries', v)}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </Field>
          </View>

          {/* Additional */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Anything Else?</Text>

            <Field label="Additional information" colors={colors}>
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="Equipment access, schedule constraints, questions for Frates..."
                placeholderTextColor={colors.textMuted}
                value={form.additionalInfo}
                onChangeText={v => set('additionalInfo', v)}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </Field>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Send Enquiry →</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.footerNote}>
            We'll reply within 48 hours to coach@fratetrain.com.au
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(colors) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: spacing.md, paddingBottom: spacing.xl * 2 },

    header: {
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    },
    headerTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.xs,
    },
    headerSub: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },

    section: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.sm,
      paddingBottom: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },

    fieldGroup: { marginBottom: spacing.md },
    label: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
      fontWeight: '500',
    },

    input: {
      backgroundColor: colors.card,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.text,
      fontSize: 15,
    },
    multiline: {
      minHeight: 90,
      paddingTop: spacing.sm,
    },

    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    chip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      marginBottom: 4,
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    chipTextActive: {
      color: '#fff',
    },

    submitBtn: {
      backgroundColor: colors.primary,
      borderRadius: radii.lg,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },

    footerNote: {
      textAlign: 'center',
      fontSize: 12,
      color: colors.textMuted,
      marginTop: spacing.sm,
    },

    // Success
    successContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    successIcon: { fontSize: 56, marginBottom: spacing.md },
    successTitle: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    successBody: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: spacing.sm,
    },
    successSub: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
    newEnquiryBtn: {
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.sm,
    },
    newEnquiryBtnText: {
      color: colors.primary,
      fontWeight: '600',
      fontSize: 15,
    },
  });
}
