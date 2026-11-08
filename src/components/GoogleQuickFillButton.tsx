import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface GoogleQuickFillButtonProps {
  clientId?: string;
  disabled?: boolean;
  onProfile?: (profile: { name: string; email: string }) => void;
  onCredential?: (credential: string) => void;
}

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdApi {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (
    element: HTMLElement,
    options: {
      type: 'standard';
      theme: 'outline';
      size: 'large';
      text: 'continue_with';
      shape: 'pill';
      width: number;
    },
  ) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleIdApi;
      };
    };
  }
}

let googleScriptPromise: Promise<void> | null = null;

export function GoogleQuickFillButton({
  clientId,
  disabled,
  onCredential,
  onProfile,
}: GoogleQuickFillButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!clientId || disabled) {
      return;
    }

    let cancelled = false;

    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled || !buttonRef.current || !window.google?.accounts?.id) {
          return;
        }

        buttonRef.current.innerHTML = '';
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            try {
              const credential = response.credential || '';
              if (!credential) {
                throw new Error('Missing Google credential');
              }
              onCredential?.(credential);
              if (onProfile) {
                const profile = decodeGoogleCredential(credential);
                onProfile(profile);
              }
              setError('');
            } catch {
              setError('Google could not fill your details.');
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: 360,
        });
      })
      .catch(() => setError('Google sign-in is unavailable right now.'));

    return () => {
      cancelled = true;
    };
  }, [clientId, disabled, onCredential, onProfile]);

  if (!clientId) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div
        ref={buttonRef}
        className={disabled ? 'pointer-events-none opacity-50' : undefined}
      />
      {error ? (
        <p className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (googleScriptPromise) {
    return googleScriptPromise;
  }

  googleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );

    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google script failed')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google script failed'));
    document.head.appendChild(script);
  });

  return googleScriptPromise;
}

function decodeGoogleCredential(credential: string) {
  const payload = credential.split('.')[1];
  if (!payload) {
    throw new Error('Missing Google credential payload');
  }

  const decoded = JSON.parse(decodeBase64Url(payload)) as Record<string, unknown>;
  const email = typeof decoded.email === 'string' ? decoded.email : '';
  const name = typeof decoded.name === 'string' ? decoded.name : '';

  if (!email || !name) {
    throw new Error('Google profile is incomplete');
  }

  return { name, email };
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
