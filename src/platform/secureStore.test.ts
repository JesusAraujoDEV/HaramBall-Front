/**
 * Property 9: No secret at rest on Web — verifies the web SecureStoreAdapter
 * never writes anywhere persistent, and that the native adapter correctly
 * delegates to `expo-secure-store`.
 */
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => undefined),
  getItemAsync: jest.fn(async () => 'stored-value'),
  deleteItemAsync: jest.fn(async () => undefined),
}));

import * as SecureStore from 'expo-secure-store';
import { secureStoreAdapter as webAdapter } from './secureStore.web';
import { secureStoreAdapter as nativeAdapter } from './secureStore.native';

describe('secureStore.web (Property 9: no secret at rest on Web)', () => {
  it('save() throws rather than persisting anything', async () => {
    await expect(webAdapter.save('masterKey', 'secret-value')).rejects.toThrow();
  });

  it('read() always returns null (nothing is ever stored)', async () => {
    await expect(webAdapter.read('masterKey')).resolves.toBeNull();
  });

  it('remove() no-ops without throwing', async () => {
    await expect(webAdapter.remove('masterKey')).resolves.toBeUndefined();
  });

  it('isAvailable() reports false', () => {
    expect(webAdapter.isAvailable()).toBe(false);
  });
});

describe('secureStore.native', () => {
  it('save() delegates to expo-secure-store setItemAsync', async () => {
    await nativeAdapter.save('masterKey', 'secret-value');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('masterKey', 'secret-value');
  });

  it('read() delegates to expo-secure-store getItemAsync', async () => {
    const value = await nativeAdapter.read('masterKey');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('masterKey');
    expect(value).toBe('stored-value');
  });

  it('remove() delegates to expo-secure-store deleteItemAsync', async () => {
    await nativeAdapter.remove('masterKey');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('masterKey');
  });

  it('isAvailable() reports true', () => {
    expect(nativeAdapter.isAvailable()).toBe(true);
  });
});
