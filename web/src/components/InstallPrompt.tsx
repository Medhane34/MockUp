"use client";

import { useEffect, useState, useRef } from "react";

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isShown, setIsShown] = useState(false);
    const hasTriggered = useRef(false); // Track if we already showed it

    useEffect(() => {
        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };

        window.addEventListener("beforeinstallprompt", handler);

        // Logic: Show after 30 seconds OR scroll
        const timer = setTimeout(() => {
            if (deferredPrompt && !hasTriggered.current) {
                setIsShown(true);
                hasTriggered.current = true;
            }
        }, 30000);

        return () => window.removeEventListener("beforeinstallprompt", handler);
    }, [deferredPrompt]);

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
            setIsShown(false);
        }
        setDeferredPrompt(null);
    };

    if (!isShown) return null;

    return (
        <div className="fixed bottom-4 right-4 p-4 bg-white shadow-lg rounded-lg border z-50">
            <p>Enjoy our app on your device!</p>
            <button onClick={handleInstall} className="mt-2 bg-blue-600 text-white px-4 py-2 rounded">
                Install App
            </button>
        </div>
    );
}