"use client";

import { trackPwaInteraction } from "@/utlis/pwaTracking";
import { useEffect, useState, useRef } from "react";

export default function InstallPrompt({ source = 'homepage' }: { source?: 'homepage' | 'blog' }) {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isShown, setIsShown] = useState(false);
    const hasTriggered = useRef(false);

    useEffect(() => {
        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };

        window.addEventListener("beforeinstallprompt", handler);

        // Tracking: Prompt Shown
        const timer = setTimeout(() => {
            if (deferredPrompt && !hasTriggered.current) {
                setIsShown(true);
                hasTriggered.current = true;
                trackPwaInteraction('prompt_shown', source);
            }
        }, 30000);

        return () => window.removeEventListener("beforeinstallprompt", handler);
    }, [deferredPrompt, source]);

    const handleInstall = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === "accepted") {
            trackPwaInteraction('prompt_accepted', source);
            trackPwaInteraction('installed', source);
            setIsShown(false);
        }
        setDeferredPrompt(null);
    };

    const handleDismiss = () => {
        trackPwaInteraction('prompt_dismissed', source);
        setIsShown(false);
    };

    if (!isShown) return null;

    return (
        <div className="fixed bottom-4 right-4 p-4 bg-white shadow-lg rounded-lg border z-50">
            <p>Enjoy our app on your device!</p>
            <button onClick={handleInstall} className="mt-2 bg-blue-600 text-white px-4 py-2 rounded">
                Install App
            </button>
            <button onClick={handleDismiss} className="ml-2">Maybe later</button>
        </div>
    );
}