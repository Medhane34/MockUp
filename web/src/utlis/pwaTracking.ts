

// utils/pwaTracking.ts

const getAnonymousId = () => {
    if (typeof window === 'undefined') return 'unknown';
    let id = localStorage.getItem('aligoo_user_id');
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('aligoo_user_id', id);
    }
    return id;
};

export const trackPwaInteraction = async (
    action: 'installed' | 'prompt_shown' | 'prompt_accepted' | 'prompt_dismissed',
    source: 'homepage' | 'blog'
) => {
    const payload = {
        userId: getAnonymousId(),
        action,
        source,
        device: navigator.userAgent,
        timestamp: new Date().toISOString(),
    };

    try {
        await fetch('/api/track-pwa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } catch (error) {
        console.error("Failed to track PWA interaction:", error);
    }
};