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
import { radii, spacing } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function SignInScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { status, notice, signIn, signOut, retry } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const message = await signIn(email, password);
    setSubmitting(false);
    if (message) setError(message);
  };

  // Signed in, but the account couldn't be loaded (usually a connection problem).
  if (status === 'error') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn't load your account</Text>
            <Text style={styles.body}>Check your connection and try again.</Text>
            <TouchableOpacity style={styles.button} onPress={retry} activeOpacity={0.8}>
              <Text style={styles.buttonText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={signOut} activeOpacity={0.8}>
              <Text style={styles.link}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Hyathlon Performance</Text>

          <View style={styles.card}>
            {notice && <Text style={styles.notice}>{notice}</Text>}

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textOnSurfaceFaint}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="username"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={colors.textOnSurfaceFaint}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                onSubmitEditing={handleSignIn}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={handleSignIn}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Sign in</Text>
              )}
            </TouchableOpacity>

            {error && <Text style={styles.errorText}>{error}</Text>}
          </View>

          <Text style={styles.footnote}>
            Accounts are created by your coach. Forgot your password? Ask your coach to reset it.
          </Text>
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
      flexGrow: 1,
      justifyContent: 'center',
      padding: spacing.md,
      paddingBottom: spacing.xl,
      gap: spacing.lg,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      padding: spacing.md,
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
    cardTitle: {
      color: colors.textOnSurface,
      fontSize: 16,
      fontWeight: '700',
    },
    body: {
      color: colors.textOnSurfaceMuted,
      fontSize: 14,
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
    button: {
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      paddingVertical: spacing.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    link: {
      color: colors.textOnSurfaceMuted,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    notice: {
      color: colors.textOnSurface,
      backgroundColor: colors.warningMuted,
      borderRadius: radii.sm,
      padding: spacing.sm,
      fontSize: 13,
    },
    errorText: {
      color: '#EF4444',
      fontSize: 13,
    },
    footnote: {
      color: colors.textMuted,
      fontSize: 12,
      textAlign: 'center',
    },
  });
}
