import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Cloud deployment URL (Render)
const CLOUD_URL = "https://material-app-zhm4.onrender.com";

/**
 * Determine the base URL for the backend.
 * In development we try to reach the locally running server.
 *   • Web (expo web) – use cloud URL to avoid CORS / localhost issues.
 *   • Android emulator – localhost of the host machine is reachable via 10.0.2.2.
 *   • iOS simulator – can use http://localhost.
 *   • Physical device – try to infer LAN IP from Expo debuggerHost.
 * In production we always use the cloud URL.
 */
const getBaseUrl = () => {
  if (__DEV__) {
    // For mobile (Android / iOS) during development, use the cloud URL to avoid LAN connectivity issues.
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      return CLOUD_URL;
    }
    // Web – use localhost when developing in the browser.
    if (Platform.OS === 'web') {
      return 'http://localhost:5005';
    }
    // Fallback to LAN IP for other cases (e.g., physical device with debuggerHost).
    const debuggerHost =
      Constants?.expoConfig?.hostUri ||
      Constants?.manifest?.debuggerHost;
    if (debuggerHost) {
      const ip = debuggerHost.split(':')[0];
      return `http://${ip}:5005`;
    }
    // Emulator defaults
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:5005';
    }
    if (Platform.OS === 'ios') {
      return 'http://localhost:5005';
    }
    return 'http://192.168.0.102:5005';
  }
  // Production – use the deployed cloud URL
  return CLOUD_URL;
};

export const BASE_URL = getBaseUrl();
console.log('Mobile/Web is connecting to backend at:', BASE_URL);
export const SERVER_URL = `${BASE_URL}/api`;

const api = axios.create({
  baseURL: SERVER_URL,
});

// Attach auth token to every request if present
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers['x-auth-token'] = token;
  }
  // Bypass Microsoft Dev Tunnels anti‑phishing warning page (if applicable)
  config.headers['X-Tunnel-Skip-AntiPhishing-Page'] = 'true';
  return config;
});

// Log 401 responses for debugging purposes
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      console.log('[API] 401 Unauthorized detected');
    }
    return Promise.reject(error);
  }
);

export default api;
