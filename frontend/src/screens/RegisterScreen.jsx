import React, { useState, useContext, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, Platform, StyleSheet, KeyboardAvoidingView, Keyboard, ActivityIndicator, useWindowDimensions, Image, Linking } from 'react-native';

import tw from 'twrnc';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';

import { Ionicons } from '@expo/vector-icons';

const RegisterSvgIcon = ({ name, size = 20, color = '#94a3b8' }) => {
  const iconMap = {
    'eye': 'eye-outline',
    'eye-off': 'eye-off-outline',
    'cloud-download': 'cloud-download-outline',
  };
  return (
    <Ionicons 
      name={iconMap[name] || 'eye-outline'} 
      size={size} 
      color={color} 
    />
  );
};


const RegisterScreen = ({ navigation }) => {
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('Employee');
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const { register } = useContext(AuthContext);
  const { width } = useWindowDimensions();
  const isMobile = width < 768 || Platform.OS !== 'web';

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  const handleRegister = async () => {
    const isEmployee = role === 'Employee';
    const trimmedId = isEmployee ? employeeId.trim() : '';
    
    let newErrors = {};
    if (!name) newErrors.name = 'Full name is required';
    if (isEmployee && !trimmedId) newErrors.employeeId = 'Employee ID is required';
    if (!email) newErrors.email = 'Work email is required';
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {

      // Instead of direct registration, send OTP first
      const response = await api.post('/otp/send-otp', {
        email: email.trim(),
        employeeId: trimmedId
      });
      if (response.data?.emailDelivered === false) {
        throw {
          response: {
            data: {
              msg: response.data?.msg || 'OTP email was not delivered. Please check backend email configuration.',
              debug: response.data?.debug,
            },
          },
        };
      }
      const debugDurationMs = response.data?.debugDurationMs;

      // Navigate to OTP screen only after the email request succeeds.
      navigation.navigate('Otp', {
        registrationData: JSON.stringify({
          name: name.trim(),
          employeeId: trimmedId,
          email: email.trim(),
          password,
          role,
          debugDurationMs: debugDurationMs
        })
      });
    } catch (err) {
      if (!err.response) {
        setErrors({ auth: `Connection Error: Backend server is unreachable at ${api.defaults.baseURL || 'unknown'}. Check your IP/Network.` });
      } else {
        const msg = err.response.data?.msg || 'Could not send verification code. Please try again.';
        setErrors({ auth: msg });
      }
    } finally {
      setLoading(false);
    }
  };


  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
    <View style={[tw`bg-slate-50`, Platform.OS === 'web' ? { height: '100vh' } : tw`flex-1`]}>
        <ScrollView 
          style={{ flex: 1, ...(Platform.OS === 'web' ? { overflow: 'auto' } : {}) }}
          contentContainerStyle={[
            { flexGrow: 1 },
            !isMobile ? { paddingBottom: 0 } : { paddingBottom: 120 }
          ]}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
        >
          <View style={!isMobile ? styles.rowWeb : styles.colMobile}>
              {/* Visual Branding Section - Hidden on mobile when typing */}
              {(!isKeyboardVisible || !isMobile) && (
                <View style={[styles.branding, !isMobile ? styles.panelWeb : styles.panelMobile]}>
                    <Image source={require('../../assets/logo.png')} style={{width: 150, height: 80, marginBottom: 20}} resizeMode="contain" />
                    <Text allowFontScaling={false} style={styles.brandingLabel}>ONBOARDING PORTAL</Text>
                    <Text allowFontScaling={false} style={styles.brandingTitle}>Join the Network</Text>
                    <View style={styles.divider} />
                    <Text allowFontScaling={false} style={styles.brandingDesc}>
                        Create your corporate profile to start managing material requests and inventory.
                    </Text>
                    {Platform.OS === 'web' && (
                        <TouchableOpacity 
                            style={styles.downloadBadge} 
                            onPress={() => {
                                if (typeof window !== 'undefined') {
                                    const isIOS = /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
                                    const url = isIOS 
                                        ? `${window.location.origin}/ios-install.html`
                                        : `${window.location.origin}/MaterialManagingStore.apk`;
                                    Linking.openURL(url);
                                } else {
                                    Linking.openURL('/MaterialManagingStore.apk');
                                }
                            }}
                            activeOpacity={0.7}
                        >
                            <View style={styles.downloadIconWrapper}>
                                <RegisterSvgIcon name="cloud-download" size={18} color="#1b264a" />
                            </View>
                            <View>
                                <Text style={styles.downloadBadgeLabel}>AVAILABLE FOR MOBILE</Text>
                                <Text style={styles.downloadBadgeTitle}>Download App</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                </View>
              )}
  
              {/* Registration Form */}
              <View style={[styles.formSection, !isMobile ? styles.panelWeb : styles.panelMobile]}>
                  <View style={styles.formContent}>
                      <View style={styles.headerBox}>
                          <Text allowFontScaling={false} style={styles.headerTitle}>New Account</Text>
                          <Text allowFontScaling={false} style={styles.headerSubtitle}>Setup your credentials with Employee ID</Text>
                      </View>
                      
                      <View style={styles.inputGroup}>
                        <Text allowFontScaling={false} style={styles.inputLabel}>FULL NAME</Text>
                        <TextInput 
                          style={[styles.input, errors.name && styles.inputError]}
                          placeholder="John Doe" 
                          placeholderTextColor="#94a3b8"
                          value={name} 
                          onChangeText={(val) => { setName(val); setErrors({ ...errors, name: null, auth: null }); }} 
                        />
                        {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
                      </View>
  
                      {role === 'Employee' && (
                        <View style={styles.inputGroup}>
                          <Text allowFontScaling={false} style={styles.inputLabel}>EMPLOYEE ID</Text>
                          <TextInput 
                            style={[styles.input, errors.employeeId && styles.inputError]}
                            placeholder="EMP001" 
                            placeholderTextColor="#94a3b8"
                            value={employeeId} 
                            onChangeText={(val) => { setEmployeeId(val); setErrors({ ...errors, employeeId: null, auth: null }); }} 
                            autoCapitalize="characters"
                          />
                          {errors.employeeId ? <Text style={styles.errorText}>{errors.employeeId}</Text> : null}
                        </View>
                      )}
                      
                      <View style={styles.inputGroup}>
                        <Text allowFontScaling={false} style={styles.inputLabel}>WORK EMAIL</Text>
                        <TextInput 
                          style={[styles.input, errors.email && styles.inputError]}
                          placeholder="john@company.com" 
                          placeholderTextColor="#94a3b8"
                          value={email} 
                          onChangeText={(val) => { setEmail(val); setErrors({ ...errors, email: null, auth: null }); }} 
                          autoCapitalize="none"
                          keyboardType="email-address"
                        />
                        {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
                      </View>
                      
                      <View style={styles.inputGroup}>
                        <Text allowFontScaling={false} style={styles.inputLabel}>SECURE PASSWORD</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TextInput 
                            style={[styles.input, { flex: 1 }, errors.password && styles.inputError]}
                            placeholder="••••••••" 
                            placeholderTextColor="#94a3b8"
                            secureTextEntry={!showPassword} 
                            value={password} 
                            onChangeText={(val) => { setPassword(val); setErrors({ ...errors, password: null, auth: null }); }} 
                          />
                          <TouchableOpacity 
                            style={{ position: 'absolute', right: 16, height: '100%', justifyContent: 'center' }}
                            onPress={() => setShowPassword(!showPassword)}
                          >
                            <RegisterSvgIcon name={showPassword ? "eye-off" : "eye"} size={20} color="#94a3b8" />
                          </TouchableOpacity>
                        </View>
                        {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
                        {errors.auth ? <Text style={styles.authErrorText}>{errors.auth}</Text> : null}
                      </View>
  
                      <View style={styles.inputGroup}>
                          <Text allowFontScaling={false} style={styles.inputLabel}>ACCOUNT ROLE</Text>
                          <View style={styles.roleRow}>
                              {['Employee', 'Admin'].map((r) => (
                                  <TouchableOpacity 
                                      key={r}
                                      onPress={() => { setRole(r); setErrors({ ...errors, employeeId: null, auth: null }); }}
                                      style={[
                                          styles.roleBtn,
                                          role === r ? styles.roleBtnActive : styles.roleBtnInactive
                                      ]}
                                  >
                                      <Text allowFontScaling={false} style={[styles.roleBtnText, role === r ? { color: '#ffffff' } : { color: '#64748b' }]}>
                                          {r}
                                      </Text>
                                  </TouchableOpacity>
                              ))}
                          </View>
                      </View>
                      
                      <TouchableOpacity 
                        style={[styles.submitBtn, loading && tw`opacity-70`]} 
                        onPress={handleRegister} 
                        activeOpacity={0.8}
                        disabled={loading}
                      >
                          {loading ? (
                            <ActivityIndicator color="#ffffff" />
                          ) : (
                            <Text allowFontScaling={false} style={styles.submitBtnText}>CREATE ACCOUNT</Text>
                          )}
                      </TouchableOpacity>

  
                      <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.linkBtn}>
                          <Text allowFontScaling={false} style={styles.linkText}>
                              Already have an account? <Text style={{ color: '#4f46e5' }}>Sign In</Text>
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
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: Platform.OS === 'web' ? 0 : 40,
  },
  scrollView: {
    flex: 1,
    ...(Platform.OS === 'web' ? { overflow: 'auto' } : {}),
  },
  scrollContent: {
    flexGrow: 1,
  },
  rowWeb: {
    flex: 1,
    flexDirection: 'row',
  },
  colMobile: {
    flex: 1,
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
    padding: 40,
    justifyContent: 'center',
    minHeight: 250,
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
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 16,
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
    lineHeight: 24,
  },
  formSection: {
    backgroundColor: '#ffffff',
    padding: 30,
    justifyContent: 'center',
  },
  formContent: {
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  headerBox: {
    marginBottom: 30,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6,
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#0f172a',
  },
  roleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  roleBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  roleBtnActive: {
    backgroundColor: '#1b264a',
    borderColor: '#1b264a',
  },
  roleBtnInactive: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  roleBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#1b264a',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 20,
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
    fontSize: 15,
    fontWeight: '700',
  },
  linkBtn: {
    marginTop: 20,
  },
  linkText: {
    textAlign: 'center',
    color: '#64748b',
    fontWeight: '600',
  },
  inputError: {
    borderColor: '#ef4444',
    backgroundColor: '#fff1f2',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
    marginLeft: 4,
  },
  authErrorText: {
    color: '#ffffff',
    backgroundColor: '#ef4444',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    textAlign: 'center',
    overflow: 'hidden',
  },
  downloadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginTop: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#ffc61c',
  },
  downloadIconWrapper: {
    backgroundColor: '#ffc61c',
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  downloadBadgeLabel: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  downloadBadgeTitle: {
    color: '#1b264a',
    fontSize: 15,
    fontWeight: 'bold',
  }
});

export default RegisterScreen;
