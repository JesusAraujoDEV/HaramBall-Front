import * as webauthnApi from '../api/webauthn';
import type { WebAuthnAdapter } from './webauthn';

/**
 * Web WebAuthn adapter: full registration + assertion ceremonies against the
 * backend, converting between the server's JSON (base64url) representation
 * and the browser's ArrayBuffer-based `navigator.credentials` API.
 */

function base64UrlToBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface CredentialDescriptorJson {
  id: string;
  type?: string;
  transports?: string[];
}

function toCredentialDescriptors(list: unknown): PublicKeyCredentialDescriptor[] | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return (list as CredentialDescriptorJson[]).map((c) => ({
    id: base64UrlToBuffer(c.id),
    type: 'public-key' as const,
    transports: c.transports as AuthenticatorTransport[] | undefined,
  }));
}

const webauthnWebAdapter: WebAuthnAdapter = {
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.PublicKeyCredential !== 'undefined' &&
      typeof navigator.credentials?.create === 'function'
    );
  },

  async registerPasskey(): Promise<boolean> {
    if (!this.isSupported()) return false;

    const options = await webauthnApi.registrationOptions();
    const user = options.user as { id: string; name: string; displayName?: string };

    const credential = (await navigator.credentials.create({
      publicKey: {
        ...options,
        challenge: base64UrlToBuffer(options.challenge as string),
        user: {
          id: base64UrlToBuffer(user.id),
          name: user.name,
          displayName: user.displayName ?? user.name,
        },
        excludeCredentials: toCredentialDescriptors(options.excludeCredentials),
      } as PublicKeyCredentialCreationOptions,
    })) as PublicKeyCredential | null;

    if (!credential) return false;
    const response = credential.response as AuthenticatorAttestationResponse;

    const result = await webauthnApi.verifyRegistration({
      id: credential.id,
      rawId: bufferToBase64Url(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: {
        clientDataJSON: bufferToBase64Url(response.clientDataJSON),
        attestationObject: bufferToBase64Url(response.attestationObject),
        transports: typeof response.getTransports === 'function' ? response.getTransports() : undefined,
      },
    });
    return result.verified;
  },

  async verifyPasskey(): Promise<boolean> {
    if (!this.isSupported()) return false;

    const options = await webauthnApi.authenticationOptions();

    const credential = (await navigator.credentials.get({
      publicKey: {
        ...options,
        challenge: base64UrlToBuffer(options.challenge as string),
        allowCredentials: toCredentialDescriptors(options.allowCredentials),
      } as PublicKeyCredentialRequestOptions,
    })) as PublicKeyCredential | null;

    if (!credential) return false;
    const response = credential.response as AuthenticatorAssertionResponse;

    const result = await webauthnApi.verifyAuthentication({
      id: credential.id,
      rawId: bufferToBase64Url(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: {
        clientDataJSON: bufferToBase64Url(response.clientDataJSON),
        authenticatorData: bufferToBase64Url(response.authenticatorData),
        signature: bufferToBase64Url(response.signature),
        userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : undefined,
      },
    });
    return result.verified;
  },
};

export default webauthnWebAdapter;
