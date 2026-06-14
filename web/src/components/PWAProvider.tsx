// components/PWAProvider.tsx
'use client';
import { useEffect } from 'react';

export default function PWAProvider() {
    useEffect(() => {
        if ('serviceWorker' in navigator && typeof window !== 'undefined') {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').then(
                    (reg) => console.log('SW registered:', reg),
                    (err) => console.log('SW registration failed:', err)
                );
            });
        }
    }, []);
    return null;
}