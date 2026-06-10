import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, useWindowDimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';

const OtpScreen = ({ navigation, route }) => {
    let registrationData = null;
    try {
        registrationData = typeof route.params?.registrationData === 'string' 
            ? JSON.parse(route.params.registrationData) 
            : route.params?.registrationData;
    } catch (e) {
        console.error("Failed to parse registration data", e);
    }
    const email = registrationData?.email || '';
    const debugDurationMs = registrationData?.debugDurationMs;

    const { width } = useWindowDimensions();
    const isMobile = width < 768;

    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(true);  // true = waiting for OTP email to arrive
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [timer, setTimer] = useState(30);

    const { register } = useContext(AuthContext);

    // Countdown timer for resend
    useEffect(() => {
        if (timer <= 0) return;
        const interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
        return () => clearInterval(interval);
    }, [timer]);

    // Guard: if no registration data, go back
    useEffect(() => {
        if (!registrationData) {
            navigation.replace('Register');
            return;
        }
        // Email is already sent by RegisterScreen successfully.
        setSending(false);
    }, []);

    const handleResend = async () => {
        if (timer > 0 || sending) return;
        setError('');
        setSuccess('');
        setSending(true);
        try {
            await api.post('/otp/send-otp', { email });
            setTimer(30);
            setSuccess('A new verification code has been sent to your email.');
        } catch (err) {
            const serverMsg = err.response?.data?.msg || 'Could not send email. Check your connection and try again.';
            const serverDebug = err.response?.data?.debug;
            setError(serverMsg + (serverDebug && __DEV__ ? ` (Debug: ${serverDebug})` : ''));
        } finally {
            setSending(false);
        }
    };

    const handleVerify = useCallback(async (otpValue) => {
        const code = otpValue || otp;
        if (!code || code.length !== 6 || loading) return;
        setError('');
        setLoading(true);
        try {
            // Send OTP along with registration data — the register endpoint
            // verifies the OTP and creates the account in one atomic step.
            const { name, employeeId, email: regEmail, password, role } = registrationData;
            await register(name, employeeId, regEmail, password, role, code);
            // AuthContext sets user → AppNavigator will redirect to Dashboard automatically
        } catch (err) {
              const serverMsg = err.response?.data?.msg || 'Verification failed. Please try again.';
              const serverDebug = err.response?.data?.debug;
              setError(serverMsg + (serverDebug && __DEV__ ? ` (Debug: ${serverDebug})` : ''));
            setLoading(false);
        }
    }, [otp, email, loading, registrationData, register]);

    // Auto-verify as soon as 6 digits are entered — no button tap needed
    useEffect(() => {
        if (otp.length === 6) {
            handleVerify(otp);
        }
    }, [otp]);

    const maskedEmail = email
        ? email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + '*'.repeat(b.length) + c)
        : '';

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
        >
            <View style={[styles.container, Platform.OS === 'web' ? { height: '100vh' } : { flex: 1 }]}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={[styles.row, Platform.OS === 'web' ? (isMobile ? styles.rowMobile : styles.rowWeb) : styles.rowMobile]}>
                        {/* Branding Panel */}
                        {Platform.OS === 'web' && !isMobile && (
                            <View style={[styles.branding, styles.panelWeb]}>
                                <Text allowFontScaling={false} style={styles.brandingLabel}>ACCOUNT VERIFICATION</Text>
                                <Text allowFontScaling={false} style={styles.brandingTitle}>Almost There</Text>
                                <View style={styles.divider} />
                                <Text allowFontScaling={false} style={styles.brandingDesc}>
                                    We sent a 6-digit code to your email to confirm your identity and activate your account.
                                </Text>
                            </View>
                        )}

                        {/* OTP Form */}
                        <View style={[styles.formSection, Platform.OS === 'web' ? (isMobile ? styles.panelMobile : styles.panelWeb) : styles.panelMobile]}>
                            <View style={styles.formContent}>
                                {/* Header */}
                                <View style={styles.headerBox}>
                                    <View style={styles.iconWrapper}>
                                        <Ionicons name="mail" size={32} color="#1b264a" />
                                    </View>
                                    <Text allowFontScaling={false} style={styles.headerTitle}>Verify Your Email</Text>
                                    <Text allowFontScaling={false} style={styles.headerSubtitle}>
                                        A 6-digit code was sent to
                                    </Text>
                                    <Text allowFontScaling={false} style={styles.emailBadge}>{maskedEmail}</Text>
                                </View>

                                {/* Sending spinner */}
                                {sending && (
                                    <View style={styles.sendingBox}>
                                        <ActivityIndicator color="#1b264a" size="small" />
                                        <Text allowFontScaling={false} style={styles.sendingText}>
                                            Sending your code…
                                        </Text>
                                    </View>
                                )}

                                {/* OTP Input */}
                                <View style={styles.inputGroup}>
                                    <Text allowFontScaling={false} style={styles.inputLabel}>VERIFICATION CODE</Text>
                                    <TextInput
                                        style={[styles.otpInput, error ? styles.inputError : null]}
                                        placeholder="0  0  0  0  0  0"
                                        placeholderTextColor="#94a3b8"
                                        value={otp}
                                        onChangeText={(val) => { setOtp(val); setError(''); }}
                                        keyboardType="number-pad"
                                        maxLength={6}
                                        textAlign="center"
                                        editable={!sending}
                                    />
                                    {error ? <Text style={styles.errorText}>{error}</Text> : null}
                                    {success ? <Text style={styles.successText}>{success}</Text> : null}

                                </View>

                                {/* Verify Button */}
                                <TouchableOpacity
                                    style={[styles.submitBtn, loading && { opacity: 0.7 }]}
                                    onPress={handleVerify}
                                    disabled={loading}
                                    activeOpacity={0.8}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#ffffff" />
                                    ) : (
                                        <Text allowFontScaling={false} style={styles.submitBtnText}>VERIFY & CREATE ACCOUNT</Text>
                                    )}
                                </TouchableOpacity>


                                {/* Resend */}
                                <TouchableOpacity
                                    style={styles.resendBtn}
                                    onPress={handleResend}
                                    disabled={timer > 0 || loading || sending}
                                    activeOpacity={0.7}
                                >
                                    <Text allowFontScaling={false} style={[styles.resendText, (timer > 0 || sending) && styles.resendDisabled]}>
                                        {sending
                                            ? 'Sending…'
                                            : timer > 0
                                                ? `Resend code in ${timer}s`
                                                : 'Resend Code'}
                                    </Text>
                                </TouchableOpacity>

                                {/* Cancel */}
                                <TouchableOpacity
                                    style={styles.cancelBtn}
                                    onPress={() => navigation.navigate('Register')}
                                >
                                    <Text allowFontScaling={false} style={styles.cancelText}>
                                        ← Back to Registration
                                    </Text>
                                </TouchableOpacity>

                            </View>
                        </View>
                    </View>
                </ScrollView>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#f8fafc',
    },
    scrollContent: {
        flexGrow: 1,
    },
    row: {
        flex: 1,
        minHeight: Platform.OS === 'web' ? '100vh' : 'auto',
    },
    rowWeb: {
        flexDirection: 'row',
    },
    rowMobile: {
        flexDirection: 'column',
    },
    panelWeb: {
        width: '50%',
        minHeight: '100%',
    },
    panelMobile: {
        width: '100%',
    },
    branding: {
        backgroundColor: '#1b264a',
        padding: 48,
        justifyContent: 'center',
        minHeight: Platform.OS === 'web' ? '100vh' : 250,
    },
    brandingLabel: {
        color: '#ffc61c',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 2,
        marginBottom: 8,
    },
    brandingTitle: {
        color: '#ffffff',
        fontSize: 36,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    divider: {
        height: 4,
        width: 60,
        backgroundColor: '#ffc61c',
        borderRadius: 2,
        marginBottom: 24,
    },
    brandingDesc: {
        color: '#94a3b8',
        fontSize: 16,
        lineHeight: 26,
        fontWeight: '500',
    },
    formSection: {
        backgroundColor: '#ffffff',
        justifyContent: 'center',
        padding: 32,
        minHeight: Platform.OS === 'web' ? '100vh' : 'auto',
    },
    formContent: {
        maxWidth: 400,
        width: '100%',
        alignSelf: 'center',
    },
    headerBox: {
        marginBottom: 32,
        alignItems: 'center',
    },
    iconWrapper: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#eff6ff',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        borderWidth: 2,
        borderColor: '#dbeafe',
    },
    iconText: {
        fontSize: 32,
    },
    headerTitle: {
        fontSize: 26,
        fontWeight: 'bold',
        color: '#0f172a',
        marginBottom: 10,
        textAlign: 'center',
    },
    headerSubtitle: {
        fontSize: 14,
        color: '#64748b',
        textAlign: 'center',
        marginBottom: 4,
    },
    emailBadge: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1b264a',
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        overflow: 'hidden',
        marginTop: 4,
        textAlign: 'center',
    },
    inputGroup: {
        marginBottom: 24,
    },
    inputLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: '#1e293b',
        marginBottom: 8,
        marginLeft: 4,
        letterSpacing: 1,
    },
    otpInput: {
        backgroundColor: '#f8fafc',
        borderWidth: 2,
        borderColor: '#e2e8f0',
        borderRadius: 14,
        padding: 18,
        fontSize: 26,
        fontWeight: '800',
        color: '#0f172a',
        letterSpacing: 12,
        textAlign: 'center',
    },
    inputError: {
        borderColor: '#ef4444',
        backgroundColor: '#fff1f2',
    },
    errorText: {
        color: '#ef4444',
        fontSize: 11,
        fontWeight: '700',
        marginTop: 8,
        marginLeft: 4,
    },
    successText: {
        color: '#16a34a',
        fontSize: 11,
        fontWeight: '700',
        marginTop: 8,
        marginLeft: 4,
    },
    submitBtn: {
        backgroundColor: '#1b264a',
        borderRadius: 14,
        padding: 18,
        alignItems: 'center',
        borderBottomWidth: 4,
        borderBottomColor: '#ffc61c',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
        ...(Platform.OS === 'web' ? { boxShadow: '0 4px 8px rgba(0,0,0,0.1)' } : {}),
    },
    submitBtnText: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 1,
    },
    resendBtn: {
        marginTop: 20,
        alignItems: 'center',
        padding: 10,
    },
    resendText: {
        color: '#4f46e5',
        fontWeight: '700',
        fontSize: 14,
    },
    resendDisabled: {
        color: '#94a3b8',
    },
    cancelBtn: {
        marginTop: 12,
        alignItems: 'center',
        padding: 8,
    },
    cancelText: {
        color: '#94a3b8',
        fontWeight: '600',
        fontSize: 13,
    },
    sendingBox: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#eff6ff',
        borderRadius: 10,
        padding: 12,
        marginBottom: 20,
        gap: 10,
    },
    sendingText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#1b264a',
        marginLeft: 8,
    },
    debugText: {
        fontSize: 11,
        color: '#475569',
        marginLeft: 8,
        marginTop: 6,
        fontWeight: '600',
    },
    devOtpContainer: {
        backgroundColor: '#fffbeb',
        borderWidth: 1,
        borderColor: '#fef3c7',
        borderRadius: 12,
        padding: 12,
        marginTop: 20,
        alignItems: 'center',
        width: '100%',
    },
    devOtpLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#92400e',
        marginBottom: 4,
    },
    devOtpValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#b45309',
        letterSpacing: 4,
    },
    devOtpHint: {
        fontSize: 11,
        color: '#92400e',
        textAlign: 'center',
        marginTop: 6,
        lineHeight: 16,
    },
});

export default OtpScreen;
