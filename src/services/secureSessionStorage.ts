import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

async function readSecureItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.warn('[auth-storage] secure read failed:', error);
    return null;
  }
}

async function migrateLegacyItem(key: string): Promise<string | null> {
  const legacyValue = await AsyncStorage.getItem(key);
  if (legacyValue == null) {
    return null;
  }

  try {
    await SecureStore.setItemAsync(key, legacyValue);
    await AsyncStorage.removeItem(key);
    return legacyValue;
  } catch (error) {
    console.warn('[auth-storage] secure migration failed:', error);
    return null;
  }
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const secureValue = await readSecureItem(key);
    if (secureValue != null) {
      return secureValue;
    }

    return migrateLegacyItem(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
    await AsyncStorage.removeItem(key);
  },

  async removeItem(key: string): Promise<void> {
    await Promise.allSettled([
      SecureStore.deleteItemAsync(key),
      AsyncStorage.removeItem(key),
    ]);
  },
};
