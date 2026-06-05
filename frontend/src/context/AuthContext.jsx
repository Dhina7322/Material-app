import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import Toast from 'react-native-toast-message';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    let interval;
    if (user && user.role === 'Employee') {
        const checkAndNotify = () => {
            const now = new Date();
            const hour = now.getHours();
            
            // Notify between 9 AM and 6 PM (18:00)
            if (hour >= 9 && hour < 18) {
                Toast.show({
                    type: 'info',
                    text1: '⏳ Hourly Reminder',
                    text2: 'Please remember to submit/return your materials before 6:00 PM today.',
                    visibilityTime: 10000,
                    autoHide: true,
                    topOffset: 60,
                });
            }
        };

        // Trigger every 1 hour
        interval = setInterval(checkAndNotify, 3600000); 
        
        // Also check immediately on login
        checkAndNotify();
    }
    
    return () => {
        if (interval) clearInterval(interval);
    };
  }, [user]);

  const loadUser = async () => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      try {
        const res = await api.get('/auth');
        setUser(res.data);
      } catch (err) {
        await AsyncStorage.removeItem('token');
      }
    }
    setLoading(false);
  };

  const refreshUser = async () => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      try {
        const res = await api.get('/auth');
        setUser(res.data);
      } catch (err) {
        console.log('[AUTH] Refresh failed');
      }
    }
  };

  const login = async (email, password, captcha) => {
    const res = await api.post('/auth/login', { email, password, captcha });
    await AsyncStorage.setItem('token', res.data.token);
    setUser(res.data.user);
  };

  const register = async (name, employeeId, email, password, role) => {
    const res = await api.post('/auth/register', { name, employeeId, email, password, role });
    await AsyncStorage.setItem('token', res.data.token);
    setUser(res.data.user);
  };

  const logout = async () => {
    await AsyncStorage.removeItem('token');
    setUser(null);
  };

  const updateUserState = (userData) => {
    setUser(userData);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUserState, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
