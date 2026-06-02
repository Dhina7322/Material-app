import React, { useState, useContext, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import {
    View, Text, TouchableOpacity, ScrollView, Platform, StyleSheet,
    ActivityIndicator, Animated, useWindowDimensions, Linking, Image, Modal
} from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import api, { BASE_URL } from '../services/api';
import { AuthContext } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import Toast from 'react-native-toast-message';
import io from 'socket.io-client';

const AdminSvgIcon = ({ name, size = 18, color = '#64748b', style }) => {
    const strokeProps = {
        stroke: color,
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        fill: 'none',
    };

    const icons = {
        menu: (
            <>
                <Line x1="4" y1="7" x2="20" y2="7" {...strokeProps} />
                <Line x1="4" y1="12" x2="20" y2="12" {...strokeProps} />
                <Line x1="4" y1="17" x2="20" y2="17" {...strokeProps} />
            </>
        ),
        notifications: (
            <>
                <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" {...strokeProps} />
                <Path d="M10 21h4" {...strokeProps} />
            </>
        ),
        time: (
            <>
                <Circle cx="12" cy="12" r="9" {...strokeProps} />
                <Polyline points="12 7 12 12 15 14" {...strokeProps} />
            </>
        ),
        'log-out': (
            <>
                <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" {...strokeProps} />
                <Line x1="16" y1="17" x2="21" y2="12" {...strokeProps} />
                <Line x1="21" y1="12" x2="16" y2="7" {...strokeProps} />
                <Line x1="21" y1="12" x2="9" y2="12" {...strokeProps} />
            </>
        ),
        'calendar-outline': (
            <>
                <Rect x="3" y="5" width="18" height="16" rx="2" {...strokeProps} />
                <Line x1="8" y1="3" x2="8" y2="7" {...strokeProps} />
                <Line x1="16" y1="3" x2="16" y2="7" {...strokeProps} />
                <Line x1="3" y1="10" x2="21" y2="10" {...strokeProps} />
            </>
        ),
        'document-text-outline': (
            <>
                <Path d="M7 3h7l5 5v13H7z" {...strokeProps} />
                <Path d="M14 3v5h5" {...strokeProps} />
                <Line x1="10" y1="13" x2="16" y2="13" {...strokeProps} />
                <Line x1="10" y1="17" x2="16" y2="17" {...strokeProps} />
            </>
        ),
        'documents-outline': (
            <>
                <Path d="M7 7V3h10l4 4v12h-4" {...strokeProps} />
                <Path d="M3 7h10l4 4v10H3z" {...strokeProps} />
                <Path d="M13 7v4h4" {...strokeProps} />
            </>
        ),
        'document-text': (
            <>
                <Path d="M6 3h9l3 3v15H6z" {...strokeProps} />
                <Line x1="9" y1="12" x2="15" y2="12" {...strokeProps} />
                <Line x1="9" y1="16" x2="15" y2="16" {...strokeProps} />
            </>
        ),
        person: (
            <>
                <Circle cx="12" cy="8" r="4" {...strokeProps} />
                <Path d="M4 21c1.5-4 4.2-6 8-6s6.5 2 8 6" {...strokeProps} />
            </>
        ),
        eye: (
            <>
                <Path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" {...strokeProps} />
                <Circle cx="12" cy="12" r="3" {...strokeProps} />
            </>
        ),
        'image-outline': (
            <>
                <Rect x="3" y="5" width="18" height="14" rx="2" {...strokeProps} />
                <Circle cx="8" cy="10" r="1.5" {...strokeProps} />
                <Polyline points="5 17 10 12 13 15 15 13 19 17" {...strokeProps} />
            </>
        ),
        location: (
            <>
                <Path d="M12 21s7-5.6 7-12A7 7 0 0 0 5 9c0 6.4 7 12 7 12Z" {...strokeProps} />
                <Circle cx="12" cy="9" r="2.5" {...strokeProps} />
            </>
        ),
        'chevron-forward': <Polyline points="9 18 15 12 9 6" {...strokeProps} />,
        'checkmark-circle': (
            <>
                <Circle cx="12" cy="12" r="9" {...strokeProps} />
                <Polyline points="8 12.5 11 15.5 16.5 9" {...strokeProps} />
            </>
        ),
        'close-circle': (
            <>
                <Circle cx="12" cy="12" r="9" {...strokeProps} />
                <Line x1="9" y1="9" x2="15" y2="15" {...strokeProps} />
                <Line x1="15" y1="9" x2="9" y2="15" {...strokeProps} />
            </>
        ),
        'arrow-forward': (
            <>
                <Line x1="5" y1="12" x2="19" y2="12" {...strokeProps} />
                <Polyline points="13 6 19 12 13 18" {...strokeProps} />
            </>
        ),
        'shield-checkmark': (
            <>
                <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" {...strokeProps} />
                <Polyline points="8.5 12 11 14.5 16 9.5" {...strokeProps} />
            </>
        ),
    };

    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
            {icons[name] || icons.person}
        </Svg>
    );
};

const AdminAttendanceScreen = ({ navigation }) => {
    const { user } = useContext(AuthContext);
    const [attendance, setAttendance] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [filter, setFilter] = useState('All'); // All | Pending | Approved | Rejected
    const [activeTab, setActiveTab] = useState('recent'); // recent | history | leave
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const socketRef = useRef(null);

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
            const res = await api.get('/attendance/all');
            setAttendance(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Failed to fetch attendance', err.message, err.response?.data);
            Toast.show({ type: 'error', text1: 'Error', text2: err.message || 'Failed to load' });
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
        } catch (e) { console.log('Bell sound error', e); }
    };

    useEffect(() => {
        fetchAttendance();

        if (BASE_URL) { socketRef.current = io(BASE_URL, { transports: ['polling', 'websocket'] }); } else { console.warn('BASE_URL undefined, skipping socket connection'); }

        socketRef.current.on('attendanceNew', (data) => {
            if (data && data.attendance) {
                playBell();
                const name = data.attendance?.user?.name || 'An employee';
                const type = data.attendance?.type || 'Present';
                const reqDate = data.attendance?.date;
                const dateObj = reqDate ? new Date(reqDate + 'T00:00:00') : new Date();
                const formattedDate = dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                
                const reasonStr = data.attendance?.reason ? `\nReason: ${data.attendance.reason}` : '';
                const leaveTypeStr = data.attendance?.leaveType ? ` (${data.attendance.leaveType})` : '';
                Toast.show({
                    type: 'info',
                    text1: `🔔 New ${type} Request${leaveTypeStr}`,
                    text2: `${name} requested ${type.toLowerCase()} for ${formattedDate} at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${reasonStr}`,
                    visibilityTime: 10000
                });
                fetchAttendance();
            }
        });

        socketRef.current.on('attendanceCheckout', (data) => {
            if (data && data.attendance) {
                playBell();
                const name = data.attendance?.user?.name || 'An employee';
                Toast.show({
                    type: 'info',
                    text1: `🔔 Checkout Completed`,
                    text2: `${name} has completed their work and is waiting for you to close the day.`,
                    visibilityTime: 6000
                });
                fetchAttendance();
            }
        });

        socketRef.current.on('attendanceUpdated', () => {
            fetchAttendance();
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [user]);

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

    const handleAction = async (id, status) => {
        // No optimistic UI – wait for server response before updating UI
        try {
            await api.put(`/attendance/${id}/action`, { status });
            Toast.show({ type: 'success', text1: `✅ ${status}`, text2: `Attendance has been ${status.toLowerCase()}.` });
            fetchAttendance(); // Refresh list after successful update
        } catch (err) {
            Toast.show({ type: 'error', text1: 'Error', text2: 'Could not update status' });
            fetchAttendance(); // Ensure UI reflects actual server state
        }
    };

    const handleCloseDay = async (id) => {
        // Optimistic update — instantly reflect in UI
        setAttendance(prev => prev.map(a => a._id === id ? { ...a, checkOutStatus: 'ClosedApproved' } : a));
        try {
            await api.put(`/attendance/${id}/close`);
            Toast.show({ type: 'success', text1: '✅ Closed', text2: 'Daily attendance has been closed and approved.' });
            fetchAttendance();
        } catch (err) {
            Toast.show({ type: 'error', text1: 'Error', text2: 'Could not close day' });
            fetchAttendance();
        }
    };

    const filters = ['All', 'Waiting', 'PendingClose', 'Approved', 'Rejected'];
    const pendingCount = Array.isArray(attendance) ? attendance.filter(a => a.status === 'Waiting').length : 0;
    const pendingCloseCount = Array.isArray(attendance) ? attendance.filter(a => a.checkOutStatus === 'PendingClose').length : 0;
    const waitingCount = pendingCount; // alias for UI
    const leaveCount = Array.isArray(attendance) ? attendance.filter(a => a.type === 'Leave' && a.status === 'Waiting').length : 0;

    const getTodayString = () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    const todayString = getTodayString();

    const isRecent = (a) => {
        if (a.checkOutStatus === 'ClosedApproved') return false;
        return a.date === todayString || a.status === 'Pending' || a.status === 'Waiting' || a.checkOutStatus === 'PendingClose';
    };

    const tabFiltered = Array.isArray(attendance) ? 
                        (activeTab === 'recent' 
                            ? attendance.filter(a => a.type !== 'Leave' && isRecent(a)) 
                            : attendance.filter(a => a.type === 'Leave')) 
                        : [];

    const filtered = !Array.isArray(attendance) ? [] :
                     filter === 'All' ? tabFiltered : 
                     filter === 'PendingClose' ? tabFiltered.filter(a => a.checkOutStatus === 'PendingClose') :
                     filter === 'Waiting' ? tabFiltered.filter(a => a.status === 'Waiting') :
                     tabFiltered.filter(a => a.status === filter);

    return (
        <View style={[styles.container, Platform.OS === 'web' ? { flexDirection: isMobile ? 'column' : 'row', height: '100vh', overflow: 'hidden' } : { flex: 1 }]}>
            <Sidebar user={user} navigation={navigation} logout={() => {}} sidebarAnim={sidebarAnim} toggleSidebar={toggleSidebar} activeScreen="AdminAttendance" />
            {isSidebarOpen && (Platform.OS !== 'web' || isMobile) && (
                <TouchableOpacity activeOpacity={1} onPress={toggleSidebar} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 90 }]} />
            )}

            <View style={{ flex: 1, backgroundColor: '#f8fafc', height: Platform.OS === 'web' ? '100vh' : 'auto' }}>
                <ScrollView
                    style={[{ flex: 1 }, Platform.OS === 'web' ? { height: '100vh' } : {}]}
                    contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            {(Platform.OS !== 'web' || isMobile) && (
                                <TouchableOpacity onPress={toggleSidebar} style={styles.mobileMenuBtn}>
                                    <AdminSvgIcon name="menu" size={24} color="#1b264a" />
                                </TouchableOpacity>
                            )}
                            {/* logo removed from Admin header */}
                            <View>
                                <Text allowFontScaling={false} style={styles.headerLabel}>ADMIN</Text>
                                <Text allowFontScaling={false} style={styles.headerTitle}>Attendance Review</Text>
                            </View>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                            {pendingCount > 0 && (
                                <View style={styles.pendingBell}>
                                    <AdminSvgIcon name="notifications" size={16} color="#ffc61c" />
                                    <Text style={styles.pendingBellText}>{pendingCount} Pending</Text>
                                </View>
                            )}
                            {waitingCount > 0 && (
                                <View style={[styles.pendingBell, { backgroundColor: '#f59e0b20', borderWidth: 1, borderColor: '#f59e0b' }]}>
                                    <AdminSvgIcon name="time" size={16} color="#f59e0b" />
                                    <Text style={[styles.pendingBellText, { color: '#f59e0b' }]}>{waitingCount} Waiting</Text>
                                </View>
                            )}
                            {pendingCloseCount > 0 && (
                                <View style={[styles.pendingBell, { backgroundColor: '#f59e0b' }]}>
                                    <AdminSvgIcon name="log-out" size={16} color="#fff" />
                                    <Text style={[styles.pendingBellText, { color: '#fff' }]}>{pendingCloseCount} Closing</Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Stats Header */}
                    <View style={styles.statsRow}>
                        <TouchableOpacity onPress={() => setFilter('All')} style={[styles.statCard, filter === 'All' && styles.statCardActive]}>
                            <Text style={styles.statLabel}>TOTAL</Text>
                            <Text style={styles.statValue}>{attendance.length}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setFilter('Waiting')} style={[styles.statCard, filter === 'Waiting' && styles.statCardActive]}>
                            <Text style={[styles.statLabel, { color: '#f59e0b' }]}>WAITING</Text>
                            <Text style={[styles.statValue, { color: '#f59e0b' }]}>{waitingCount}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setFilter('Approved')} style={[styles.statCard, filter === 'Approved' && styles.statCardActive]}>
                            <Text style={[styles.statLabel, { color: '#10b981' }]}>APPROVED</Text>
                            <Text style={[styles.statValue, { color: '#10b981' }]}>{attendance.filter(a => a.status === 'Approved').length}</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Tab Switcher: Recent / History / Leave */}
                    <View style={styles.tabContainer}>
                        <TouchableOpacity
                            style={[styles.tabButton, activeTab === 'recent' && styles.tabButtonActive]}
                            onPress={() => setActiveTab('recent')}
                        >
                            <AdminSvgIcon name="time" size={18} color={activeTab === 'recent' ? '#ffc61c' : '#64748b'} />
                            <Text style={[styles.tabButtonText, activeTab === 'recent' && styles.tabButtonTextActive]}>
                                Action Required
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.tabButton, activeTab === 'leave' && styles.tabButtonActive]}
                            onPress={() => setActiveTab('leave')}
                        >
                            <AdminSvgIcon name="document-text-outline" size={18} color={activeTab === 'leave' ? '#ffc61c' : '#64748b'} />
                            <Text style={[styles.tabButtonText, activeTab === 'leave' && styles.tabButtonTextActive]}>
                                Leave
                            </Text>
                            {leaveCount > 0 && (
                                <View style={styles.leaveBadgeCount}>
                                    <Text style={styles.leaveBadgeCountText}>{leaveCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Filter Pills */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }} contentContainerStyle={{ gap: 8 }}>
                        {filters.map(f => (
                            <TouchableOpacity
                                key={f}
                                onPress={() => setFilter(f)}
                                style={[styles.filterPill, filter === f && styles.filterPillActive]}
                            >
                                <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>{f}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* Records */}
                    {loading ? (
                        <ActivityIndicator size="large" color="#1b264a" />
                    ) : filtered.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <AdminSvgIcon name="documents-outline" size={48} color="#e2e8f0" />
                            <Text style={styles.emptyText}>No {filter !== 'All' ? filter.toLowerCase() : ''} records found.</Text>
                        </View>
                    ) : (
                        filtered.map((record) => {
                            const hasLocation = record.locationLat && record.locationLng;
                            const mapsUrl = hasLocation
                                ? `https://www.google.com/maps?q=${record.locationLat},${record.locationLng}`
                                : null;
                            const isWaiting = record.status === 'Waiting';
                            const photoUrl = record.photoUrl ? getFullImageUrl(record.photoUrl) : null;
                            const checkInTimeStr = formatTime(record.timestamp || record.checkInTime);

                            return (
                                <View key={record._id} style={[styles.recordItem, isWaiting && styles.recordItemWaiting]}>
                                    {/* ── Card Header ── */}
                                    <View style={styles.recordHeader}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <View style={[styles.typeBadge, record.type === 'Leave' ? styles.badgeLeave : styles.badgePresent]}>
                                                <AdminSvgIcon name={record.type === 'Leave' ? 'document-text' : 'person'} size={12} color="#fff" />
                                                <Text style={styles.badgeText}>{record.type}</Text>
                                            </View>
                                            {isWaiting && (
                                                <View style={styles.waitingTagBadge}>
                                                    <Text style={styles.waitingTagText}>⏳ CHECK-IN PENDING</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.recordDateText}>{record.date}</Text>
                                    </View>

                                    {/* ── Employee Info Row ── */}
                                    <View style={styles.recordContent}>
                                        <View style={styles.userInfoRow}>
                                            <View style={styles.avatarPlaceholder}>
                                                <Text style={styles.avatarInitials}>{record.user?.name?.charAt(0)?.toUpperCase() || 'E'}</Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.recordName}>{record.user?.name}</Text>
                                                <Text style={styles.recordEmployeeId}>Employee ID: {record.user?.employeeId}</Text>
                                            </View>
                                            <View style={styles.timeInfo}>
                                                <Text style={styles.timeLabel}>CHECK-IN</Text>
                                                <Text style={styles.timeValue}>{checkInTimeStr}</Text>
                                                {record.checkOutTime && (
                                                    <>
                                                        <Text style={[styles.timeLabel, { marginTop: 6 }]}>CHECK-OUT</Text>
                                                        <Text style={[styles.timeValue, { color: '#10b981' }]}>{formatTime(record.checkOutTime)}</Text>
                                                    </>
                                                )}
                                            </View>
                                        </View>

                                        {record.reason ? (
                                            <View style={styles.reasonBlock}>
                                                <Text style={styles.reasonLabel}>{record.leaveType || 'Reason'}:</Text>
                                                <Text style={styles.reasonValue}>{record.reason}</Text>
                                            </View>
                                        ) : null}

                                        {/* ── Evidence Grid: Photo + Map ── */}
                                        <View style={[styles.evidenceGrid, Platform.OS === 'web' && { flexDirection: 'row', gap: 12 }]}>
                                            {/* Photo Panel */}
                                            <View style={[styles.evidencePanelBox, Platform.OS === 'web' && { flex: 1 }]}>
                                                <Text style={styles.evidencePanelLabel}>📷 PHOTO EVIDENCE</Text>
                                                {photoUrl ? (
                                                    <TouchableOpacity
                                                        onPress={() => setSelectedPhoto(photoUrl)}
                                                        style={styles.photoThumbnailWrap}
                                                        activeOpacity={0.85}
                                                    >
                                                        <Image
                                                            source={{ uri: photoUrl }}
                                                            style={styles.photoThumbnail}
                                                            resizeMode="cover"
                                                        />
                                                        <View style={styles.photoOverlay}>
                                                            <AdminSvgIcon name="eye" size={20} color="#fff" />
                                                            <Text style={styles.photoOverlayText}>Click to expand</Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                ) : (
                                                    <View style={styles.noPhotoBox}>
                                                        <AdminSvgIcon name="image-outline" size={32} color="#cbd5e1" />
                                                        <Text style={styles.noPhotoText}>No Photo Submitted</Text>
                                                        <Text style={styles.noPhotoSub}>Waiting for Admin review</Text>
                                                    </View>
                                                )}
                                            </View>

                                            {/* Map Panel */}
                                            {hasLocation && (
                                                <View style={[styles.evidencePanelBox, Platform.OS === 'web' && { flex: 1 }]}>
                                                    <Text style={styles.evidencePanelLabel}>📍 CHECK-IN LOCATION</Text>
                                                    {Platform.OS === 'web' ? (
                                                        <View style={styles.mapEmbedWrap}>
                                                            <iframe
                                                                title={`map-${record._id}`}
                                                                width="100%"
                                                                height="160"
                                                                frameBorder="0"
                                                                scrolling="no"
                                                                style={{ border: 0, borderRadius: 10, display: 'block' }}
                                                                src={`https://www.openstreetmap.org/export/embed.html?bbox=${record.locationLng - 0.005},${record.locationLat - 0.005},${record.locationLng + 0.005},${record.locationLat + 0.005}&layer=mapnik&marker=${record.locationLat},${record.locationLng}`}
                                                            />
                                                            <TouchableOpacity
                                                                onPress={() => mapsUrl && Linking.openURL(mapsUrl)}
                                                                style={styles.mapOpenBtn}
                                                            >
                                                                <AdminSvgIcon name="location" size={13} color="#3b82f6" />
                                                                <Text style={styles.mapOpenBtnText}>Open in Google Maps</Text>
                                                                <AdminSvgIcon name="chevron-forward" size={12} color="#3b82f6" />
                                                            </TouchableOpacity>
                                                            {record.checkOutLat && record.checkOutLng && (
                                                                <TouchableOpacity
                                                                    onPress={() => Linking.openURL(`https://www.google.com/maps?q=${record.checkOutLat},${record.checkOutLng}`)}
                                                                    style={[styles.mapOpenBtn, { borderColor: '#fbcfe8', backgroundColor: '#fdf2f8', marginTop: 4 }]}
                                                                >
                                                                    <AdminSvgIcon name="log-out" size={13} color="#db2777" />
                                                                    <Text style={[styles.mapOpenBtnText, { color: '#db2777' }]}>Check-Out Location</Text>
                                                                    <AdminSvgIcon name="chevron-forward" size={12} color="#db2777" />
                                                                </TouchableOpacity>
                                                            )}
                                                        </View>
                                                    ) : (
                                                        <TouchableOpacity
                                                            onPress={() => mapsUrl && Linking.openURL(mapsUrl)}
                                                            style={styles.locationLink}
                                                        >
                                                            <AdminSvgIcon name="location" size={14} color="#3b82f6" />
                                                            <Text style={styles.locationLinkText}>View on Map</Text>
                                                            <AdminSvgIcon name="chevron-forward" size={12} color="#3b82f6" />
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                            )}
                                        </View>
                                    </View>

                                    {/* ── Footer Actions ── */}
                                    <View style={styles.recordFooter}>
                                        {(record.status === 'Pending' || isWaiting) ? (
                                            <View style={styles.actionGroup}>
                                                <TouchableOpacity
                                                    style={[styles.footerActionBtn, styles.footerRejectBtn]}
                                                    onPress={() => handleAction(record._id, 'Rejected')}
                                                >
                                                    <AdminSvgIcon name="close-circle" size={14} color="#ef4444" />
                                                    <Text style={[styles.footerActionText, styles.footerActionTextReject]}>REJECT</Text>
                                                </TouchableOpacity>

                                                {isWaiting && (
                                                    <TouchableOpacity
                                                        style={[styles.footerActionBtn, styles.footerHoldBtn]}
                                                        onPress={() => handleAction(record._id, 'Waiting')}
                                                    >
                                                        <AdminSvgIcon name="time" size={14} color="#f59e0b" />
                                                        <Text style={[styles.footerActionText, styles.footerActionTextHold]}>HOLD</Text>
                                                    </TouchableOpacity>
                                                )}

                                                <TouchableOpacity
                                                    style={[styles.footerActionBtn, styles.footerApproveBtn]}
                                                    onPress={() => handleAction(record._id, 'Approved')}
                                                >
                                                    <AdminSvgIcon name="checkmark-circle" size={14} color="#ffc61c" />
                                                    <Text style={[styles.footerActionText, styles.footerActionTextApprove]}>APPROVE</Text>
                                                </TouchableOpacity>
                                            </View>
                                        ) : (
                                            <View style={styles.statusFooter}>
                                                <View style={[styles.finalStatusBadge, record.status === 'Approved' ? styles.finalApproved : styles.finalRejected]}>
                                                    <AdminSvgIcon name={record.status === 'Approved' ? 'checkmark-circle' : 'close-circle'} size={14} color={record.status === 'Approved' ? '#10b981' : '#ef4444'} />
                                                    <Text style={[styles.finalStatusText, { color: record.status === 'Approved' ? '#10b981' : '#ef4444' }]}>{record.status.toUpperCase()}</Text>
                                                </View>

                                                {record.status === 'Approved' && record.checkOutStatus === 'PendingClose' && (
                                                    <TouchableOpacity style={styles.finalCloseBtn} onPress={() => handleCloseDay(record._id)}>
                                                        <Text style={styles.finalCloseBtnText}>CONFIRM CLOSE DAY</Text>
                                                        <AdminSvgIcon name="arrow-forward" size={14} color="#fff" />
                                                    </TouchableOpacity>
                                                )}

                                                {record.checkOutStatus === 'ClosedApproved' && (
                                                    <View style={styles.completeBadge}>
                                                        <AdminSvgIcon name="shield-checkmark" size={14} color="#64748b" />
                                                        <Text style={styles.completeBadgeText}>VISIT COMPLETED</Text>
                                                    </View>
                                                )}
                                            </View>
                                        )}
                                    </View>
                                </View>
                            );

                        })
                    )}
                </ScrollView>
            </View>

            {/* Photo Preview Modal */}
            <Modal
                visible={!!selectedPhoto}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setSelectedPhoto(null)}
            >
                <TouchableOpacity 
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setSelectedPhoto(null)}
                >
                    <View style={styles.modalContent}>
                        <TouchableOpacity style={styles.closeModal} onPress={() => setSelectedPhoto(null)}>
                            <AdminSvgIcon name="close-circle" size={40} color="#fff" />
                        </TouchableOpacity>
                        {selectedPhoto && (
                            <Image 
                                source={{ uri: selectedPhoto }} 
                                style={styles.fullPhoto} 
                                resizeMode="contain" 
                            />
                        )}
                        <Text style={styles.modalHint}>Tap anywhere to close</Text>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    headerLabel: { fontSize: 10, fontWeight: '800', color: '#94a3b8', letterSpacing: 1 },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#0f172a' },
    dashLogo: {
        width: 60,
        height: 30,
        borderRadius: 6,
        backgroundColor: '#ffffff',
        padding: 2,
    },
    mobileMenuBtn: { backgroundColor: '#ffffff', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    pendingBell: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1b264a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, gap: 6 },
    pendingBellText: { color: '#ffc61c', fontWeight: 'bold', fontSize: 12 },
    
    // Stats Header
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    statCard: { flex: 1, backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
    statCardActive: { borderColor: '#1b264a', backgroundColor: '#1b264a10' },
    statLabel: { fontSize: 9, fontWeight: 'bold', color: '#64748b', marginBottom: 4 },
    statValue: { fontSize: 18, fontWeight: 'bold', color: '#1b264a' },

    // Filters
    filterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
    filterPillActive: { backgroundColor: '#1b264a', borderColor: '#1b264a' },
    filterPillText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
    filterPillTextActive: { color: '#ffc61c' },

    // Card Records
    recordItem: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#f1f5f9', overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10 },
    recordItemWaiting: { borderColor: '#f59e0b', borderLeftWidth: 4, backgroundColor: '#fffbeb' },
    recordHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', paddingHorizontal: 15, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    badgePresent: { backgroundColor: '#10b981' },
    badgeLeave: { backgroundColor: '#f59e0b' },
    badgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
    recordDateText: { fontSize: 11, fontWeight: 'bold', color: '#64748b' },
    
    recordContent: { padding: 15 },
    userInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15 },
    avatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1b264a10', justifyContent: 'center', alignItems: 'center' },
    avatarInitials: { fontSize: 16, fontWeight: 'bold', color: '#1b264a' },
    recordName: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
    recordEmployeeId: { fontSize: 13, color: '#475569' },
    timeInfo: { alignItems: 'flex-end' },
    timeLabel: { fontSize: 8, fontWeight: 'bold', color: '#94a3b8' },
    timeValue: { fontSize: 15, fontWeight: '700', color: '#0f172a' },

    reasonBlock: { backgroundColor: '#f8fafc', padding: 10, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#f1f5f9' },
    reasonLabel: { fontSize: 10, fontWeight: 'bold', color: '#1b264a', marginBottom: 2 },
    reasonValue: { fontSize: 12, color: '#475569', lineHeight: 16 },

    evidenceGrid: { gap: 12, marginTop: 4 },
    evidencePanelBox: {
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        padding: 10,
        overflow: 'hidden',
    },
    evidencePanelLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#64748b',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    photoThumbnailWrap: {
        width: '100%',
        height: 110,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: '#e2e8f0',
    },
    photoThumbnail: {
        width: '100%',
        height: '100%',
    },
    photoOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.45)',
        paddingVertical: 6,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    photoOverlayText: { color: '#fff', fontSize: 11, fontWeight: '600' },
    noPhotoBox: {
        width: '100%',
        height: 160,
        borderRadius: 10,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: '#cbd5e1',
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
    },
    noPhotoText: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
    noPhotoSub: { fontSize: 10, color: '#cbd5e1' },
    mapEmbedWrap: { borderRadius: 10, overflow: 'hidden', height: 120 },
    mapOpenBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#eff6ff',
        padding: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#dbeafe',
        marginTop: 8,
    },
    mapOpenBtnText: { fontSize: 11, fontWeight: '700', color: '#1e40af', flex: 1 },
    waitingTagBadge: {
        backgroundColor: '#fef3c7',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#fcd34d',
    },
    waitingTagText: { fontSize: 9, fontWeight: '800', color: '#d97706' },

    locationCol: { flex: 1, gap: 8 },
    locationLink: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#eff6ff', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#dbeafe' },
    locationLinkText: { fontSize: 11, fontWeight: '700', color: '#1e40af', flex: 1 },

    recordFooter: { padding: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fafafa' },
    actionGroup: { flexDirection: 'row', gap: 10 },
    footerActionBtn: { paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flex: 1, flexDirection: 'row', borderWidth: 1 },
    footerApproveBtn: { backgroundColor: '#1b264a', borderColor: '#1b264a' },
    footerRejectBtn: { backgroundColor: '#ffffff', borderColor: '#ef4444' },
    footerHoldBtn: { backgroundColor: '#ffffff', borderColor: '#f59e0b' },
    footerActionText: { fontSize: 12, fontWeight: 'bold', marginLeft: 6 },
    footerActionTextApprove: { color: '#ffc61c' },
    footerActionTextReject: { color: '#ef4444' },
    footerActionTextHold: { color: '#f59e0b' },
    
    statusFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    finalStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    finalApproved: { backgroundColor: '#dcfce7' },
    finalRejected: { backgroundColor: '#fee2e2' },
    finalStatusText: { fontSize: 11, fontWeight: 'bold' },
    
    finalCloseBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1b264a', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
    finalCloseBtnText: { color: '#ffc61c', fontSize: 10, fontWeight: 'bold' },
    completeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, opacity: 0.7 },
    completeBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#64748b' },

    emptyContainer: { alignItems: 'center', marginTop: 60, gap: 15 },
    emptyText: { color: '#94a3b8', fontSize: 14, fontWeight: '500' },

    // Tab Switcher
    tabContainer: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 14, padding: 4, marginBottom: 20 },
    tabButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, gap: 8 },
    tabButtonActive: { backgroundColor: '#1b264a' },
    tabButtonText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
    tabButtonTextActive: { color: '#ffffff' },
    leaveBadgeCount: { backgroundColor: '#ef4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
    leaveBadgeCountText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '95%', height: '85%' },
    fullPhoto: { width: '100%', height: '100%' },
    closeModal: { position: 'absolute', top: -50, right: 0, zIndex: 10 },
    modalHint: { color: '#94a3b8', textAlign: 'center', marginTop: 20, fontSize: 12 }
});

export default AdminAttendanceScreen;
