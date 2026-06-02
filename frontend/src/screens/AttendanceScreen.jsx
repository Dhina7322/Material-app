import React, { useState, useContext, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Linking, Image } from 'react-native';
import {
    View, Text, TouchableOpacity, ScrollView, Platform, StyleSheet,
    ActivityIndicator, Animated, useWindowDimensions, TextInput, Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { BASE_URL } from '../services/api';
import { AuthContext } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import Toast from 'react-native-toast-message';
import io from 'socket.io-client';

const LEAVE_OPTIONS = [
    { key: 'Medical', icon: 'medkit', color: '#ef4444' },
    { key: 'Personal', icon: 'person', color: '#8b5cf6' },
    { key: 'Family Emergency', icon: 'people', color: '#f59e0b' },
    { key: 'Travel', icon: 'airplane', color: '#06b6d4' },
    { key: 'Other', icon: 'ellipsis-horizontal', color: '#64748b' },
];

const AttendanceScreen = ({ navigation }) => {
    const { user } = useContext(AuthContext);
    const [attendance, setAttendance] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('attendance'); // 'attendance' | 'leave'
    const [selectedLeaveType, setSelectedLeaveType] = useState('');
    const [customReason, setCustomReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [checkingOut, setCheckingOut] = useState(null);
    const [customLeaveType, setCustomLeaveType] = useState('');
    const [leaveDate, setLeaveDate] = useState(new Date().toLocaleDateString('en-CA')); // YYYY-MM-DD
    const [viewDate, setViewDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const socketRef = useRef(null);
    // Hidden file input ref for web — bypasses Expo camera polyfill issues
    const webFileInputRef = useRef(null);
    const webFileResolverRef = useRef(null); // Stores the resolve/reject for the pending photo promise
    const { width } = useWindowDimensions();
    const isMobile = width < 768;
    const sidebarWidth = Platform.OS === 'web' ? Math.min(280, width * 0.85) : 280;
    const sidebarAnim = useRef(new Animated.Value(-sidebarWidth)).current;

    const toggleSidebar = () => {
        const toValue = isSidebarOpen ? -sidebarWidth : 0;
        Animated.timing(sidebarAnim, { toValue, duration: 300, useNativeDriver: true }).start();
        setIsSidebarOpen(!isSidebarOpen);
    };

    const fetchAttendance = async () => {
        setLoading(true);
        try {
            const res = await api.get('/attendance/my-attendance');
            setAttendance(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Failed to fetch attendance', err.message, err.response?.data);
            Toast.show({ type: 'error', text1: 'Error', text2: err.message || 'Failed to load attendance' });
        } finally {
            setLoading(false);
        }
    };

    // Bell notification sound
    const playBell = async () => {
        try {
            if (Platform.OS === 'web') {
                if (typeof window !== 'undefined') {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    if (AudioContext) {
                        const ctx = new AudioContext();
                        const oscillator = ctx.createOscillator();
                        const gainNode = ctx.createGain();
                        oscillator.connect(gainNode);
                        gainNode.connect(ctx.destination);
                        oscillator.type = 'sine';
                        oscillator.frequency.setValueAtTime(880, ctx.currentTime);
                        oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5);
                        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
                        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
                        oscillator.start(ctx.currentTime);
                        oscillator.stop(ctx.currentTime + 0.5);
                    }
                }
            } else {
                const uri = 'https://raw.githubusercontent.com/zmxv/react-native-sound-demo/master/bell.mp3';
                const { sound } = await Audio.Sound.createAsync(
                    { uri },
                    { shouldPlay: true, volume: 1.0 }
                );
                setTimeout(() => {
                    sound.unloadAsync().catch(() => {});
                }, 5000);
            }
        } catch (e) {
            console.log('Bell sound error:', e);
        }
    };

    useEffect(() => {
        fetchAttendance();

        // Socket for real-time notifications
        socketRef.current = io(BASE_URL, { transports: ['polling', 'websocket'] });

        socketRef.current.on('attendanceUpdated', (data) => {
            if (data && (String(data.userId) === String(user?._id) || String(data.userId) === String(user?.id))) {
                playBell();
                const a = data.attendance;
                const isClose = a?.checkOutStatus === 'ClosedApproved';
                Toast.show({
                    type: isClose ? 'success' : a?.status === 'Approved' ? 'success' : 'error',
                    text1: `🔔 ${isClose ? 'Day Closed!' : `Attendance ${a?.status}`}`,
                    text2: isClose ? `Your attendance for ${a?.date} is fully closed.` : `Your ${a?.type} request for ${a?.date} was ${a?.status}.`,
                    visibilityTime: 6000
                });
                fetchAttendance();
            }
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [user]);

    const markAttendance = async (type = 'Present', leaveType = '', reason = '', dateStr = '') => {
        const todayStr = new Date().toLocaleDateString('en-CA');
        const checkDate = dateStr || todayStr;

        if (checkDate === todayStr && todayRecord && todayRecord.status !== 'Rejected' && todayRecord.checkOutStatus === 'ClosedApproved' && type !== 'Leave') {
            Toast.show({
                type: 'info',
                text1: 'Attendance Closed',
                text2: 'Your attendance for today is already marked and closed. You cannot mark present.',
                visibilityTime: 4000
            });
            return;
        }
        setSubmitting(true);
        try {
            let locationLat = null;
            let locationLng = null;
            let photoUri = null;
            let photoFile = null;

            if (type === 'Present') {
                // Request Location
                let { status: locStatus } = await Location.requestForegroundPermissionsAsync();
                if (locStatus !== 'granted') {
                    Toast.show({ type: 'error', text1: 'Permission Denied', text2: 'Location permission is required to log your attendance.' });
                    setSubmitting(false);
                    return;
                }
                // Request Location with fallback for speed
                let location = null;
                try {
                    location = await Location.getCurrentPositionAsync({
                        accuracy: Location.Accuracy.Balanced,
                    });
                } catch (locErr) {
                    console.log('[GPS] Accuracy fetch failed, trying last known:', locErr.message);
                    location = await Location.getLastKnownPositionAsync({});
                }

                if (location) {
                    locationLat = location.coords.latitude;
                    locationLng = location.coords.longitude;
                }

                // --- Photo Capture ---
                if (Platform.OS === 'web') {
                    // WEB: Use native HTML file input — 100% reliable, no polyfill issues
                    try {
                        photoFile = await new Promise((resolve) => {
                            webFileResolverRef.current = resolve;
                            if (webFileInputRef.current) {
                                webFileInputRef.current.value = '';
                                webFileInputRef.current.click();
                            } else {
                                resolve(null);
                            }
                        });
                        if (photoFile) {
                            console.log('[ATTENDANCE-WEB] ✅ Got photo from file input:', photoFile.name, photoFile.size);
                        } else {
                            Toast.show({ type: 'info', text1: 'No Photo', text2: 'Attendance will need Admin approval.' });
                        }
                    } catch (e) {
                        console.error('[ATTENDANCE-WEB] File input error:', e);
                    }
                } else {
                    // NATIVE: Use Expo ImagePicker camera
                    let { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
                    if (camStatus === 'granted') {
                        const result = await ImagePicker.launchCameraAsync({
                            mediaTypes: ['images'],
                            allowsEditing: false,
                            aspect: [4, 3],
                            quality: 0.5,
                        });
                        if (!result.canceled && result.assets && result.assets.length > 0) {
                            photoUri = result.assets[0].uri;
                        } else {
                            Toast.show({ type: 'info', text1: 'No Photo', text2: 'Attendance will need Admin approval.' });
                        }
                    } else {
                        Toast.show({ type: 'info', text1: 'No Camera Access', text2: 'Attendance marked as Waiting for Admin approval.' });
                    }
                }
            }

            // --- CONSTRUCT FORM DATA ---
            const formData = new FormData();
            
            // 1. Core Fields (Explicitly strings)
            formData.append('attendType', String(type || 'Present'));
            formData.append('leaveType', String(leaveType || ''));
            formData.append('reason', String(reason || ''));
            formData.append('date', String(dateStr || todayStr));
            
            // 2. Location Fields
            if (locationLat) formData.append('locationLat', String(locationLat));
            if (locationLng) formData.append('locationLng', String(locationLng));
            
            // 3. Photo Evidence
            if (Platform.OS === 'web') {
                // Web: native browser File object from hidden input — perfect FormData support
                if (photoFile) {
                    const filename = photoFile.name || 'attendance.jpg';
                    formData.append('photo', photoFile, filename);
                    console.log('[ATTENDANCE-WEB] ✅ Photo appended. Name:', filename, 'Size:', photoFile.size);
                } else {
                    console.warn('[ATTENDANCE-WEB] ⚠️ No photo file — will be Waiting status.');
                }
            } else if (photoUri) {
                // Native: { uri, name, type } format required by React Native FormData
                formData.append('photo', { uri: photoUri, name: 'attendance.jpg', type: 'image/jpeg' });
                console.log('[ATTENDANCE-NATIVE] Photo appended. URI:', photoUri);
            }

            console.log('[ATTENDANCE] Native Fetch initiated...');

            console.log('[ATTENDANCE] Submitting via native fetch to:', `${BASE_URL}/api/attendance/mark-v2`);
            try {
                // Using native fetch instead of axios for multipart to rule out library bugs
                const token = await AsyncStorage.getItem('token');
                const response = await fetch(`${BASE_URL}/api/attendance/mark-v2`, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Accept': 'application/json',
                        'x-auth-token': token || ''
                    },
                });

                const data = await response.json();
                console.log('[ATTENDANCE] Fetch Response Status:', response.status);

                if (!response.ok) {
                    throw new Error(data.msg || `Upload failed with status ${response.status}`);
                }
                
                console.log('[ATTENDANCE] Success:', response.status);
            } catch (apiErr) {
                console.error('[ATTENDANCE-FETCH-ERROR]', apiErr.message);
                throw apiErr;
            }

            Toast.show({
                type: 'success',
                text1: type === 'Leave' ? '✅ Leave Requested' : '✅ Request Sent',
                text2: type === 'Leave' ? `Leave requested for ${checkDate}` : 'Attendance sent to Admin for approval.'
            });
            fetchAttendance();
        } catch (err) {
            console.error('[ATTENDANCE-FLOW-ERROR]', err.message);
            Toast.show({
                type: 'error',
                text1: 'Error',
                text2: err.message || 'Could not mark attendance'
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleCheckout = async (id) => {
        setCheckingOut(id);
        try {
            let locationLat = null;
            let locationLng = null;

            let { status: locStatus } = await Location.requestForegroundPermissionsAsync();
            if (locStatus === 'granted') {
                let location = null;
                try {
                    location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                } catch (e) {
                    location = await Location.getLastKnownPositionAsync({});
                }
                
                if (location) {
                    locationLat = location.coords.latitude;
                    locationLng = location.coords.longitude;
                }
            }

            await api.put(`/attendance/${id}/checkout`, { locationLat, locationLng });
            Toast.show({ type: 'success', text1: '✅ Checked Out', text2: 'Work completed. Waiting for Admin to close your attendance.' });
            fetchAttendance();
        } catch (err) {
            Toast.show({ type: 'error', text1: 'Error', text2: err.response?.data?.msg || 'Could not check out' });
        } finally { setCheckingOut(null); }
    };

    const handleLeaveSubmit = () => {
        // ✅ Block if an active attendance record already exists for that date
        const conflictRecord = Array.isArray(attendance)
            ? attendance.find(a => a.date === leaveDate && ['Approved', 'Pending', 'Waiting'].includes(a.status))
            : null;
        if (conflictRecord) {
            Toast.show({
                type: 'error',
                text1: '⚠️ Already Marked',
                text2: `You already have a "${conflictRecord.type}" marked as "${conflictRecord.status}" for ${leaveDate}. Cannot apply leave.`,
                visibilityTime: 5000
            });
            return;
        }

        let finalLeaveType = selectedLeaveType || 'Leave';
        if (selectedLeaveType === 'Other') {
            if (!customLeaveType.trim()) {
                Toast.show({ type: 'error', text1: 'Required', text2: 'Please specify your custom leave type.' });
                return;
            }
            finalLeaveType = customLeaveType.trim();
        }
        if (selectedLeaveType === 'Other' && !customReason.trim()) {
            Toast.show({ type: 'error', text1: 'Required', text2: 'Please provide a reason for leave.' });
            return;
        }
        markAttendance('Leave', finalLeaveType, customReason.trim(), leaveDate);
        setSelectedLeaveType('');
        setCustomLeaveType('');
        setCustomReason('');
        setLeaveDate(new Date().toLocaleDateString('en-CA'));
    };

    const getTodayString = () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const todayString = getTodayString();
    const todayRecord = Array.isArray(attendance) ? attendance.find(a => a.date === todayString) : null;

    const formatTime = (time) => {
        if (!time) return 'N/A';
        const d = new Date(time);
        return isNaN(d.getTime()) ? 'N/A' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getFullImageUrl = (path) => {
        if (!path) return null;
        let cleanPath = path.toString().trim().replace(/\\/g, '/');
        const uploadsIndex = cleanPath.indexOf('uploads/');
        if (uploadsIndex !== -1) {
            cleanPath = cleanPath.substring(uploadsIndex);
        } else {
            const filename = cleanPath.split('/').pop();
            cleanPath = `uploads/${filename}`;
        }
        const encodedPath = cleanPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
        return `${BASE_URL}/${encodedPath}`;
    };

    const getCheckoutLabel = (record) => {
        if (record.checkOutStatus === 'ClosedApproved') return { label: 'Day Closed ✓', color: '#10b981', canCheckout: false };
        if (record.checkOutStatus === 'PendingClose') return { label: 'Awaiting Close Approval', color: '#f59e0b', canCheckout: false };
        if (record.status === 'Approved' && record.type === 'Present') return { label: 'MARK WORK COMPLETE', color: '#1b264a', canCheckout: true };
        return null;
    };

    return (
        <View style={[styles.container, Platform.OS === 'web' ? { flexDirection: isMobile ? 'column' : 'row', height: '100vh', overflow: 'hidden' } : { flex: 1 }]}>
            <Sidebar user={user} navigation={navigation} logout={() => {}} sidebarAnim={sidebarAnim} toggleSidebar={toggleSidebar} activeScreen="Attendance" />
            {isSidebarOpen && (Platform.OS !== 'web' || isMobile) && (
                <TouchableOpacity activeOpacity={1} onPress={toggleSidebar} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 90 }]} />
            )}

            {/* Hidden file input for web photo capture — bypasses Expo ImagePicker polyfill bugs */}
            {Platform.OS === 'web' && (
                <input
                    ref={webFileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        const file = e.target.files && e.target.files[0];
                        if (webFileResolverRef.current) {
                            webFileResolverRef.current(file || null);
                            webFileResolverRef.current = null;
                        }
                    }}
                />
            )}

            <View style={{ flex: 1, backgroundColor: '#f8fafc', height: Platform.OS === 'web' ? '100vh' : 'auto' }}>
                <ScrollView
                    style={[{ flex: 1 }, Platform.OS === 'web' ? { height: '100vh' } : {}]}
                    contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                >
                    <View style={styles.header}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            {(Platform.OS !== 'web' || isMobile) && (
                                <TouchableOpacity onPress={toggleSidebar} style={styles.mobileMenuBtn}>
                                    <Ionicons name="menu" size={24} color="#1b264a" />
                                </TouchableOpacity>
                            )}
                            <View>
                                <Text allowFontScaling={false} style={styles.headerLabel}>MODULE</Text>
                                <Text allowFontScaling={false} style={styles.headerTitle}>Attendance Panel</Text>
                            </View>
                        </View>
                    </View>

                    {/* Tab Switcher */}
                    <View style={styles.tabContainer}>
                        <TouchableOpacity
                            style={[styles.tabButton, activeTab === 'attendance' && styles.tabButtonActive]}
                            onPress={() => setActiveTab('attendance')}
                        >
                            <Ionicons name="calendar-outline" size={18} color={activeTab === 'attendance' ? '#ffc61c' : '#64748b'} />
                            <Text style={[styles.tabButtonText, activeTab === 'attendance' && styles.tabButtonTextActive]}>
                                Daily Attendance
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tabButton, activeTab === 'leave' && styles.tabButtonActive]}
                            onPress={() => setActiveTab('leave')}
                        >
                            <Ionicons name="document-text-outline" size={18} color={activeTab === 'leave' ? '#ffc61c' : '#64748b'} />
                            <Text style={[styles.tabButtonText, activeTab === 'leave' && styles.tabButtonTextActive]}>
                                Apply Leave
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Active Tab Content */}
                    {activeTab === 'attendance' ? (
                        /* Today Card (Attendance) */
                        <View style={styles.todayCard}>
                            <Ionicons name="calendar" size={32} color="#1b264a" style={{ marginBottom: 8 }} />
                            <Text style={styles.todayLabel}>TODAY</Text>
                            <Text style={styles.todayDate}>{new Date().toDateString()}</Text>

                            {todayRecord && (
                                <View style={{ width: '100%', gap: 6, marginBottom: 15 }}>
                                    <View style={[styles.markedBadge, (todayRecord.status === 'Waiting' || todayRecord.status === 'Pending') ? { backgroundColor: '#f59e0b' } : todayRecord.type === 'Leave' ? styles.leaveBadge : styles.presentBadge]}>
                                        <Ionicons name={(todayRecord.status === 'Waiting' || todayRecord.status === 'Pending') ? "time" : "checkmark-circle"} size={16} color="#fff" />
                                        <Text style={styles.markedBadgeText}>
                                            {(todayRecord.status === 'Waiting' || todayRecord.status === 'Pending') ? 'Sent for Admin Approval' : `${todayRecord.leaveType || todayRecord.type} — ${todayRecord.status}`}
                                        </Text>
                                    </View>

                                    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                                        {todayRecord.locationLat && todayRecord.locationLng && (
                                            <TouchableOpacity 
                                                onPress={() => Linking.openURL(`https://www.google.com/maps?q=${todayRecord.locationLat},${todayRecord.locationLng}`)}
                                                style={styles.todayLocationBadge}
                                            >
                                                <Ionicons name="location" size={12} color="#3b82f6" />
                                                <Text style={styles.todayLocationBadgeText}>Check-In Map</Text>
                                            </TouchableOpacity>
                                        )}
                                        {todayRecord.checkOutLat && todayRecord.checkOutLng && (
                                            <TouchableOpacity 
                                                onPress={() => Linking.openURL(`https://www.google.com/maps?q=${todayRecord.checkOutLat},${todayRecord.checkOutLng}`)}
                                                style={[styles.todayLocationBadge, { backgroundColor: '#fdf2f8', borderColor: '#fbcfe8' } ]}
                                            >
                                                <Ionicons name="log-out" size={12} color="#db2777" />
                                                <Text style={[styles.todayLocationBadgeText, { color: '#db2777' }]}>Check-Out Map</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                            )}

                            {todayRecord && todayRecord.status !== 'Rejected' && todayRecord.checkOutStatus !== 'ClosedApproved' ? (
                                <View style={{ alignItems: 'center', width: '100%' }}>
                                    {/* Check-out button (only if not rejected) */}
                                    {(() => {
                                        const co = getCheckoutLabel(todayRecord);
                                        if (!co) return null;
                                        if (co.canCheckout) return (
                                            <TouchableOpacity style={[styles.checkoutBtn, { backgroundColor: co.color }]} onPress={() => handleCheckout(todayRecord._id)} disabled={checkingOut === todayRecord._id}>
                                                {checkingOut === todayRecord._id ? <ActivityIndicator color="#fff" /> : (
                                                    <>
                                                        <Ionicons name="log-out" size={16} color="#fff" style={{ marginRight: 6 }} />
                                                        <Text style={styles.checkoutBtnText}>{co.label}</Text>
                                                    </>
                                                )}
                                            </TouchableOpacity>
                                        );
                                        return (
                                            <View style={[styles.checkoutInfo, { borderColor: co.color }]}>
                                                <Text style={[styles.checkoutInfoText, { color: co.color }]}>{co.label}</Text>
                                            </View>
                                        );
                                    })()}
                                </View>
                            ) : (
                                <View style={styles.actionButtons}>
                                    <TouchableOpacity style={styles.presentBtn} onPress={() => markAttendance('Present')} disabled={submitting}>
                                        {submitting ? <ActivityIndicator color="#fff" /> : (
                                            <>
                                                <Ionicons name="person-circle" size={18} color="#fff" style={{ marginRight: 6 }} />
                                                <Text style={styles.presentBtnText}>MARK PRESENT</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.leaveBtn} onPress={() => setActiveTab('leave')} disabled={submitting}>
                                        <Ionicons name="document-text" size={18} color="#1b264a" style={{ marginRight: 6 }} />
                                        <Text style={styles.leaveBtnText}>REQUEST LEAVE</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    ) : (
                        /* Leave Application Tab Content — always show form */
                        (() => {
                            const conflictRecord = Array.isArray(attendance)
                                ? attendance.find(a => a.date === leaveDate && ['Approved', 'Pending', 'Waiting'].includes(a.status))
                                : null;
                            return (
                            <View style={styles.leaveFormCard}>
                                <Text style={styles.formTitle}>Apply for Leave</Text>
                                <Text style={styles.formSubtitle}>Select a reason for your leave:</Text>

                                {/* ⚠️ Inline conflict warning */}
                                {conflictRecord && (
                                    <View style={styles.conflictBanner}>
                                        <Ionicons name="warning" size={16} color="#b45309" />
                                        <Text style={styles.conflictBannerText}>
                                            {`"${conflictRecord.type}" already ${conflictRecord.status} for ${leaveDate}. Pick a different date.`}
                                        </Text>
                                    </View>
                                )}

                                <View style={styles.leaveOptionsGrid}>
                                    {LEAVE_OPTIONS.map(opt => (
                                        <TouchableOpacity
                                            key={opt.key}
                                            style={[styles.leaveOption, selectedLeaveType === opt.key && { borderColor: opt.color, borderWidth: 2, backgroundColor: `${opt.color}15` }]}
                                            onPress={() => {
                                                setSelectedLeaveType(opt.key);
                                                if (opt.key !== 'Other') setCustomLeaveType('');
                                            }}
                                        >
                                            <View style={[styles.leaveOptionIcon, { backgroundColor: opt.color }]}>
                                                <Ionicons name={opt.icon} size={18} color="#fff" />
                                            </View>
                                            <Text style={[styles.leaveOptionText, selectedLeaveType === opt.key && { color: opt.color, fontWeight: '800' }]}>{opt.key}</Text>
                                            {selectedLeaveType === opt.key && <Ionicons name="checkmark-circle" size={16} color={opt.color} style={styles.leaveOptionCheck} />}
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {selectedLeaveType === 'Other' && (
                                    <View>
                                        <Text style={styles.formSubtitle}>Specify Custom Leave Type:</Text>
                                        <TextInput
                                            style={styles.customTypeInput}
                                            placeholder="E.g. Marriage, Exam, Religious..."
                                            placeholderTextColor="#94a3b8"
                                            value={customLeaveType}
                                            onChangeText={setCustomLeaveType}
                                        />
                                    </View>
                                )}

                                <Text style={styles.formSubtitle}>Select Leave Date:</Text>
                                <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
                                    <Ionicons name="calendar" size={20} color="#1b264a" />
                                    <Text style={styles.datePickerBtnText}>
                                        {new Date(leaveDate).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                    </Text>
                                </TouchableOpacity>

                                <Text style={styles.formSubtitle}>Additional details (optional):</Text>
                                <TextInput
                                    style={styles.reasonInput}
                                    placeholder={selectedLeaveType === 'Other' ? 'Required: Describe your reason...' : 'Add any extra notes (optional)...'}
                                    placeholderTextColor="#94a3b8"
                                    value={customReason}
                                    onChangeText={setCustomReason}
                                    multiline
                                    numberOfLines={4}
                                    textAlignVertical="top"
                                />
                                    <View style={styles.formActions}>
                                        <TouchableOpacity style={styles.clearBtn} onPress={() => { setSelectedLeaveType(''); setCustomLeaveType(''); setCustomReason(''); }}>
                                            <Text style={styles.clearBtnText}>Clear Form</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.submitLeaveBtn, conflictRecord && { opacity: 0.4 }]}
                                            onPress={handleLeaveSubmit}
                                            disabled={submitting || !!conflictRecord}
                                        >
                                            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitLeaveBtnText}>Submit Leave</Text>}
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            );
                        })()
                    )}


                    {/* History */}
                    <Text style={styles.sectionTitle}>Attendance History</Text>
                    {loading ? (
                        <ActivityIndicator size="large" color="#1b264a" style={{ marginTop: 20 }} />
                    ) : (!Array.isArray(attendance) || attendance.length === 0) ? (
                        <Text style={styles.emptyText}>No records yet. Mark your first attendance above!</Text>
                    ) : (
                        (Array.isArray(attendance) ? attendance : []).map((record) => {
                            const co = getCheckoutLabel(record);
                            const hasLocation = record.locationLat && record.locationLng;
                            const mapsUrl = hasLocation
                                ? `https://www.google.com/maps?q=${record.locationLat},${record.locationLng}`
                                : null;
                            return (
                                <View key={record._id} style={styles.recordItem}>
                                    <View style={[styles.typeIcon, record.type === 'Leave' ? styles.leaveIcon : styles.presentIcon]}>
                                        <Ionicons name={record.type === 'Leave' ? 'document-text' : 'person-circle'} size={20} color="#fff" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.recordDate}>{record.date}</Text>
                                        <Text style={styles.recordType}>{record.leaveType || record.type}{record.reason ? ` — ${record.reason}` : ''}</Text>
                                        {record.checkOutTime && (
                                            <Text style={styles.checkoutTime}>Check-out: {formatTime(record.checkOutTime)}</Text>
                                        )}
                                        {record.type !== 'Leave' && hasLocation && (
                                            Platform.OS === 'web' ? (
                                                <View style={styles.mapEmbedSmallWrap}>
                                                    <iframe
                                                        title={`map-${record._id}`}
                                                        width="100%"
                                                        height="140"
                                                        frameBorder="0"
                                                        scrolling="no"
                                                        style={{ border: 0, borderRadius: 10, display: 'block' }}
                                                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${record.locationLng - 0.005},${record.locationLat - 0.005},${record.locationLng + 0.005},${record.locationLat + 0.005}&layer=mapnik&marker=${record.locationLat},${record.locationLng}`}
                                                    />
                                                    <TouchableOpacity onPress={() => mapsUrl && Linking.openURL(mapsUrl)} style={styles.mapOpenBtnSmall}>
                                                        <Ionicons name="location" size={12} color="#3b82f6" />
                                                        <Text style={styles.mapOpenBtnTextSmall}>View on Map</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            ) : (
                                                <TouchableOpacity
                                                    onPress={() => mapsUrl && Linking.openURL(mapsUrl)}
                                                    style={styles.locationBadge}
                                                >
                                                    <Ionicons name="location" size={11} color="#3b82f6" />
                                                    <Text style={styles.locationBadgeText}>
                                                        Check-In Location Map
                                                    </Text>
                                                </TouchableOpacity>
                                            )
                                        )}
                                        {record.type !== 'Leave' && record.checkOutLat && record.checkOutLng && (
                                            <TouchableOpacity
                                                onPress={() => Linking.openURL(`https://www.google.com/maps?q=${record.checkOutLat},${record.checkOutLng}`)}
                                                style={[styles.locationBadge, { backgroundColor: '#fdf2f8' }]}
                                            >
                                                <Ionicons name="log-out" size={11} color="#db2777" />
                                                <Text style={[styles.locationBadgeText, { color: '#db2777' }]}>Check-Out Location Map</Text>
                                            </TouchableOpacity>
                                        )}
                                        {record.photoUrl ? (
                                            <TouchableOpacity
                                                onPress={() => {
                                                    const url = getFullImageUrl(record.photoUrl) || record.photoUrl;
                                                    if (url) Linking.openURL(url);
                                                }}
                                                style={styles.smallPhotoWrap}
                                            >
                                                <Image source={{ uri: getFullImageUrl(record.photoUrl) || record.photoUrl }} style={styles.smallPhoto} resizeMode="cover" />
                                                <View style={styles.smallPhotoOverlay}>
                                                    <Ionicons name="eye" size={12} color="#fff" />
                                                    <Text style={styles.smallPhotoOverlayText}>Click to expand</Text>
                                                </View>
                                            </TouchableOpacity>
                                        ) : null}
                                        {record.status === 'Waiting' && (
                                            <View style={styles.waitingBadge}>
                                                <Ionicons name="time" size={11} color="#f59e0b" />
                                                <Text style={styles.waitingBadgeText}>Waiting for Admin (No Photo)</Text>
                                            </View>
                                        )}
                                    </View>
                                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                                        <View style={[styles.statusBadge, record.status === 'Approved' ? styles.badgeApproved : record.status === 'Rejected' ? styles.badgeRejected : record.status === 'Waiting' ? styles.badgeWaiting : styles.badgePending]}>
                                            <Text style={
                                                record.status === 'Approved' ? styles.statusTextApproved :
                                                record.status === 'Rejected' ? styles.statusTextRejected :
                                                record.status === 'Waiting' ? styles.statusTextWaiting :
                                                styles.statusTextPending
                                            }>
                                                {record.status}
                                            </Text>
                                        </View>
                                        {co && !co.canCheckout && record.date !== todayString && (
                                            <View style={[styles.statusBadge, { backgroundColor: co.color + '20' }]}>
                                                <Text style={[styles.statusText, { color: co.color }]}>
                                                    {record.checkOutStatus === 'ClosedApproved' ? 'Closed' : 'Closing'}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            );
                        })
                    )}
                </ScrollView>
            </View>

            {/* Custom Calendar Modal */}
            <Modal
                visible={showDatePicker}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowDatePicker(false)}
            >
                <View style={styles.calendarModalOverlay}>
                    <View style={styles.calendarModalContent}>
                        {/* Header */}
                        <View style={styles.calendarHeader}>
                            <TouchableOpacity onPress={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}>
                                <Ionicons name="chevron-back" size={24} color="#1b264a" />
                            </TouchableOpacity>
                            <Text style={styles.calendarHeaderTitle}>
                                {viewDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                            </Text>
                            <TouchableOpacity onPress={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}>
                                <Ionicons name="chevron-forward" size={24} color="#1b264a" />
                            </TouchableOpacity>
                        </View>

                        {/* Weekday Names */}
                        <View style={styles.weekdayRow}>
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                <Text key={day} style={styles.weekdayText}>{day}</Text>
                            ))}
                        </View>

                        {/* Days Grid */}
                        <View style={styles.daysGrid}>
                            {(() => {
                                const year = viewDate.getFullYear();
                                const month = viewDate.getMonth();
                                const startDay = new Date(year, month, 1).getDay();
                                const totalDays = new Date(year, month + 1, 0).getDate();
                                
                                const dayElements = [];
                                // Empty slots for previous month
                                for (let i = 0; i < startDay; i++) {
                                    dayElements.push(<View key={`empty-${i}`} style={styles.dayCellEmpty} />);
                                }
                                // Days in month
                                for (let i = 1; i <= totalDays; i++) {
                                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                                    const isSelected = leaveDate === dateStr;
                                    dayElements.push(
                                        <TouchableOpacity
                                            key={`day-${i}`}
                                            style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                                            onPress={() => {
                                                setLeaveDate(dateStr);
                                                setShowDatePicker(false);
                                            }}
                                        >
                                            <Text style={[styles.dayCellText, isSelected && styles.dayCellTextSelected]}>
                                                {i}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                }
                                return dayElements;
                            })()}
                        </View>

                        {/* Footer / Cancel */}
                        <TouchableOpacity style={styles.calendarCancelBtn} onPress={() => setShowDatePicker(false)}>
                            <Text style={styles.calendarCancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    headerLabel: { fontSize: 10, fontWeight: '800', color: '#94a3b8', letterSpacing: 1 },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#0f172a' },
    mobileMenuBtn: { backgroundColor: '#ffffff', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    todayCard: { backgroundColor: '#ffffff', borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
    todayLabel: { fontSize: 10, fontWeight: '800', color: '#94a3b8', letterSpacing: 2, marginBottom: 4 },
    todayDate: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginBottom: 20 },
    todayLocationBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#dbeafe', gap: 6 },
    todayLocationBadgeText: { fontSize: 12, color: '#3b82f6', fontWeight: '700' },
    markedBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, gap: 8, marginBottom: 16 },
    presentBadge: { backgroundColor: '#10b981' },
    leaveBadge: { backgroundColor: '#f59e0b' },
    markedBadgeText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    checkoutBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, borderBottomWidth: 3, borderBottomColor: '#ffc61c' },
    checkoutBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    checkoutInfo: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, marginTop: 4 },
    checkoutInfoText: { fontWeight: '700', fontSize: 12 },
    actionButtons: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
    presentBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1b264a', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, borderBottomWidth: 3, borderBottomColor: '#ffc61c' },
    presentBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
    leaveBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef3c7', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: '#fcd34d' },
    leaveBtnText: { color: '#1b264a', fontWeight: 'bold', fontSize: 13 },
    policyCard: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#e2e8f0' },
    policyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    policyTitle: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
    policyContent: { paddingLeft: 4, gap: 6 },
    policyItem: { fontSize: 12, color: '#475569', lineHeight: 18 },
    policyBold: { fontWeight: '700', color: '#1e293b' },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 16 },
    emptyText: { color: '#64748b', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },
    recordItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', padding: 18, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', gap: 12 },
    typeIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    presentIcon: { backgroundColor: '#10b981' },
    leaveIcon: { backgroundColor: '#f59e0b' },
    recordDate: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
    recordType: { fontSize: 13, color: '#475569', marginTop: 4 },
    checkoutTime: { fontSize: 11, color: '#10b981', marginTop: 2, fontWeight: '600' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    badgeApproved: { backgroundColor: '#dcfce7' },
    badgeRejected: { backgroundColor: '#fee2e2' },
    badgePending: { backgroundColor: '#fef3c7' },
    badgeWaiting: { backgroundColor: '#fef3c7' },
    statusTextApproved: { fontSize: 11, fontWeight: 'bold', color: '#15803d' },
    statusTextRejected: { fontSize: 11, fontWeight: 'bold', color: '#b91c1c' },
    statusTextWaiting: { fontSize: 11, fontWeight: 'bold', color: '#b45309' },
    statusTextPending: { fontSize: 11, fontWeight: 'bold', color: '#b45309' },
    locationBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4, backgroundColor: '#eff6ff', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
    locationBadgeText: { fontSize: 10, color: '#3b82f6', fontWeight: '600' },
    mapEmbedSmallWrap: { marginTop: 8, borderRadius: 10, overflow: 'hidden' },
    mapOpenBtnSmall: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#eff6ff', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#dbeafe', marginTop: 8 },
    mapOpenBtnTextSmall: { fontSize: 11, fontWeight: '700', color: '#1e40af', flex: 1 },
    photoBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3, backgroundColor: '#f0fdf4', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
    photoBadgeText: { fontSize: 10, color: '#10b981', fontWeight: '600' },
    smallPhotoWrap: { width: '100%', height: 110, borderRadius: 10, overflow: 'hidden', marginTop: 8, backgroundColor: '#e2e8f0' },
    smallPhoto: { width: '100%', height: '100%' },
    smallPhotoOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    smallPhotoOverlayText: { color: '#fff', fontSize: 11, fontWeight: '600' },
    waitingBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3, backgroundColor: '#fffbeb', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
    waitingBadgeText: { fontSize: 10, color: '#f59e0b', fontWeight: '600' },
    // Tab Switcher
    tabContainer: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 14, padding: 4, marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0' },
    tabButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, gap: 8 },
    tabButtonActive: { backgroundColor: '#1b264a', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
    tabButtonText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
    tabButtonTextActive: { color: '#ffffff', fontWeight: '700' },
    // Leave Form Tab
    leaveFormCard: { backgroundColor: '#ffffff', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
    formTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
    formSubtitle: { fontSize: 13, color: '#64748b', marginBottom: 12, marginTop: 12 },
    leaveOptionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    leaveOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', gap: 8, position: 'relative' },
    leaveOptionIcon: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    leaveOptionText: { fontSize: 13, fontWeight: '600', color: '#475569' },
    leaveOptionCheck: { position: 'absolute', top: -6, right: -6 },
    customTypeInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, fontSize: 14, color: '#0f172a', height: 44, marginBottom: 16 },
    reasonInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, fontSize: 14, color: '#0f172a', height: 80, marginBottom: 16 },
    formActions: { flexDirection: 'row', gap: 10 },
    clearBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', backgroundColor: '#f8fafc' },
    clearBtnText: { fontWeight: '700', color: '#64748b' },
    submitLeaveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#1b264a', alignItems: 'center', borderBottomWidth: 3, borderBottomColor: '#ffc61c' },
    submitLeaveBtnText: { color: '#fff', fontWeight: 'bold' },
    // Leave Applied Screen
    leaveAppliedCard: { backgroundColor: '#ffffff', borderRadius: 20, padding: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
    leaveAppliedTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginBottom: 6 },
    leaveAppliedSubtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 18 },
    // Conflict Warning Banner
    conflictBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fcd34d', borderRadius: 10, padding: 12, marginBottom: 12 },
    conflictBannerText: { flex: 1, fontSize: 12, color: '#92400e', fontWeight: '600', lineHeight: 18 },
    // Calendar Picker Button & Modal Styles
    datePickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16, gap: 12 },
    datePickerBtnText: { fontSize: 14, color: '#0f172a', fontWeight: '600' },
    calendarModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    calendarModalContent: { backgroundColor: '#ffffff', borderRadius: 20, padding: 20, width: '100%', maxWidth: 340, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
    calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    calendarHeaderTitle: { fontSize: 16, fontWeight: 'bold', color: '#1b264a' },
    weekdayRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    weekdayText: { width: '14.28%', textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#64748b' },
    daysGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', marginBottom: 16 },
    dayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8, marginVertical: 2 },
    dayCellSelected: { backgroundColor: '#1b264a' },
    dayCellEmpty: { width: '14.28%', aspectRatio: 1 },
    dayCellText: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
    dayCellTextSelected: { color: '#ffffff', fontWeight: 'bold' },
    calendarCancelBtn: { paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderColor: '#f1f5f9' },
    calendarCancelBtnText: { fontSize: 14, fontWeight: 'bold', color: '#ef4444' }
});

export default AttendanceScreen;
