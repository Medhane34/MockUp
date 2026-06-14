"use client";

import { useState, useEffect } from "react";

export default function NotificationToggle() {
    const [permission, setPermission] = useState<NotificationPermission | "loading" | "unsupported">("loading");

    useEffect(() => {
        if (!("Notification" in window)) {
            setPermission("unsupported");
            return;
        }
        // Safely look up real-time status on mount
        setPermission(Notification.permission);
    }, []);

    const handleEnableClick = async () => {
        if (!("Notification" in window)) return;

        try {
            // Must be inside a click handler to count as a browser "User Gesture"
            const result = await Notification.requestPermission();
            setPermission(result);

            if (result === "granted" && "serviceWorker" in navigator) {
                // Safe check to verify if next-pwa actually has a compiled worker active
                const registration = await navigator.serviceWorker.ready;
                console.log("Service Worker ready for push subscription:", registration);
            }
        } catch (error) {
            console.error("Error requesting notification permission:", error);
        }
    };

    if (permission === "loading") return <p className="text-gray-400 text-sm">Checking permissions...</p>;
    if (permission === "unsupported") return <p className="text-red-500">Notifications not supported on this browser.</p>;
    if (permission === "granted") return <p className="text-green-500 font-semibold">✓ Notifications are active!</p>;

    // Returns if state is 'default' or if they accidentally dismissed/denied it previously
    return (
        <div className="p-4 border rounded-xl bg-card max-w-sm flex flex-col gap-3">
            <p className="text-sm font-medium">Would you like to stay updated with push notifications?</p>
            <button
                onClick={handleEnableClick}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors active:scale-95"
            >
                Enable Notifications
            </button>
        </div>
    );
}
