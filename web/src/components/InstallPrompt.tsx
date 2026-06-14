"use client";

import { useEffect, useState } from "react";

export default function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isShown, setIsShown] = useState(false);

    useEffect(() => {
        // 1. Listen for the install prompts
        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };

        window.addEventListener("beforeinstallprompt", handler);

        // 2. Check if already installed
        if (window.matchMedia("(display-mode: standalone)").matches) {
            return;
        }

        // 3. Trigger logic: Wait 30 seconds or 50% scroll
        const timer = setTimeout(() => {
            if (deferredPrompt) setIsShown(true);
        }, 30000);

        return () => {
            window.removeEventListener("beforeinstallprompt", handler);
            clearTimeout(timer);
        };
    }, [deferredPrompt]);

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
            setIsShown(false);
            localStorage.setItem("pwa_installed", "true");
        }
    };

    if (!isShown) return null;

    return (
        <div className="fixed bottom-4 right-4 p-4 bg-white shadow-lg rounded-lg border z-50">
            <p>Enjoy our app on your device!</p>
            <button onClick={handleInstall} className="mt-2 bg-blue-600 text-white px-4 py-2 rounded">
                Install App
            </button>
            <button onClick={() => setIsShown(false)} className="ml-2">Maybe later</button>
        </div>
    );
}