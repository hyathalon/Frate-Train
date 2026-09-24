import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { radii, spacing } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  athleteType: 'Hyathlon',
  goal: '',
  experience: '',
  notes: '',
};

function buildMailtoLink(form) {
  const firstName = form.firstName.trim() || 'Athlete';
  const email = form.email.trim() || 'not-provided@example.com';
  const subject = encodeURIComponent(`Hyathlon coaching enquiry for ${firstName}`);
  const body = encodeURIComponent(
    [
      'Hi Hyathlon Performance team,',
      '',
      `First name: ${firstName}`,
      `Last name: ${form.lastName.trim() || 'Not provided'}`,
      `Email: ${email}`,
      `Athlete type: ${form.athleteType || 'Not provided'}`,
      `Primary goal: ${form.goal.trim() || 'Not provided'}`,
      `Experience: ${form.experience.trim() || 'Not provided'}`,
      '',
      'Training notes:',
      form.notes.trim() || 'No additional notes provided.',
      '',
      'Please reach out to help with my coaching plan.',
    ].join('\n'),
  );

  return `mailto:coach@hyathlonperformance.com?subject=${subject}&body=${body}`;
}

export default function CoachingEnquiryScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async () => {
    const firstName = form.firstName.trim();
    const email = form.email.trim();

    if (!firstName || !email) {
      Alert.alert('Missing details', 'Please add your first name and email so your coach can reply.');
      return;
    }

    setIsSubmitting(true);

    try {
      const mailtoLink = buildMailtoLink(form);
      const canOpen = await Linking.canOpenURL(mailtoLink);

      if (canOpen) {
        await Linking.openURL(mailtoLink);
      } else {
        Alert.alert(
          'Mail app unavailable',
          'No email app was detected on this device. Please email coach@hyathlonperformance.com directly.',
        );
      }
    } catch (error) {
      console.warn('Failed to open mail client', error);
      Alert.alert('Could not open mail app', 'Please email coach@hyathlonperformance.com directly.');
    } finally {
      setSubmitted(true);
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.successWrap}>
          <View style={[styles.successBadge, { backgroundColor: colors.primaryMuted }]}>
            <Ionicons name="trophy" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.successTitle, { color: colors.text }]}>Coaching request sent</Text>
          <Text style={[styles.successText, { color: colors.textMuted }]}>
            Thanks, {form.firstName.trim() || 'Athlete'}! Your enquiry is ready to send to the{' '}
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Hyathlon Performance</Text> team.
          </Text>
          <View style={[styles.successCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.successLabel, { color: colors.textMuted }]}>Email</Text>
            <Text style={[styles.successEmail, { color: colors.text }]}>{form.email.trim() || 'No email provided'}</Text>
          </View>
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Back to race tools</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
            <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
          </TouchableOpacity>

          <View style={styles.headerBlock}>
            <Text style={[styles.title, { color: colors.text }]}>Hyathlon Coaching</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>Tell us about your race goals and we’ll help you structure your next block.</Text>
          </View>

          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textMuted }]}>First name</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                value={form.firstName}
                onChangeText={(value) => updateField('firstName', value)}
                placeholder="Alex"
                placeholderTextColor={colors.textMuted + '80'}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Last name</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                value={form.lastName}
                onChangeText={(value) => updateField('lastName', value)}
                placeholder="Smith"
                placeholderTextColor={colors.textMuted + '80'}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Email</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                value={form.email}
                onChangeText={(value) => updateField('email', value)}
                placeholder="alex@email.com"
                placeholderTextColor={colors.textMuted + '80'}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Athlete type</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                value={form.athleteType}
                onChangeText={(value) => updateField('athleteType', value)}
                placeholder="Hyathlon"
                placeholderTextColor={colors.textMuted + '80'}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Primary goal</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                value={form.goal}
                onChangeText={(value) => updateField('goal', value)}
                placeholder="Sub-60 HYROX, 10K PB, better transitions…"
                placeholderTextColor={colors.textMuted + '80'}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Current experience</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                value={form.experience}
                onChangeText={(value) => updateField('experience', value)}
                placeholder="3 years running / first HYROX"
                placeholderTextColor={colors.textMuted + '80'}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Additional notes</Text>
              <TextInput
                style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                value={form.notes}
                onChangeText={(value) => updateField('notes', value)}
                placeholder="Share your training history, key goals, and what support you need most."
                placeholderTextColor={colors.textMuted + '80'}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: isSubmitting ? 0.7 : 1 }]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Ionicons name="mail" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>{isSubmitting ? 'Opening mail app…' : 'Send enquiry'}</Text>
          </TouchableOpacity>
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
    scrollContent: {
      padding: spacing.md,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: spacing.xs,
      width: 'auto',
    },
    backText: {
      fontSize: 15,
      fontWeight: '600',
    },
    headerBlock: {
      gap: 6,
    },
    title: {
      fontSize: 30,
      fontWeight: '800',
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
    },
    formCard: {
      borderRadius: radii.lg,
      borderWidth: 1,
      padding: spacing.md,
      gap: spacing.md,
    },
    fieldGroup: {
      gap: 6,
    },
    label: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    input: {
      minHeight: 48,
      borderWidth: 1,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: Platform.OS === 'ios' ? 12 : 10,
      fontSize: 15,
      fontWeight: '500',
    },
    textArea: {
      minHeight: 120,
      borderWidth: 1,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      fontSize: 15,
      fontWeight: '500',
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      marginTop: spacing.xs,
    },
    primaryButtonText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    successWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xl,
      gap: spacing.md,
      backgroundColor: colors.background,
    },
    successBadge: {
      width: 120,
      height: 120,
      borderRadius: 60,
      alignItems: 'center',
      justifyContent: 'center',
    },
    successTitle: {
      fontSize: 28,
      fontWeight: '800',
      textAlign: 'center',
    },
    successText: {
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      maxWidth: 360,
    },
    successCard: {
      width: '100%',
      maxWidth: 360,
      borderRadius: radii.lg,
      borderWidth: 1,
      padding: spacing.md,
      alignItems: 'center',
      gap: 4,
    },
    successLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    successEmail: {
      fontSize: 18,
      fontWeight: '700',
      textAlign: 'center',
    },
  });
}
