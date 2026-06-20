// utils/pwaUtils.ts

export const getPwaStatus = () => {
    if (typeof window === 'undefined') return { supported: false, isIOS: false, isStandalone: false };

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = ('standalone' in navigator && (navigator as any).standalone) ||
        window.matchMedia('(display-mode: standalone)').matches;

    const supported = (
        'Notification' in window &&
        'serviceWorker' in navigator &&
        'PushManager' in window
    );

    return { supported, isIOS, isStandalone };
};