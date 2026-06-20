"use client";

import { getPwaStatus } from "@/utlis/pwaUtils";
import { useState, useEffect } from "react";

export default function NotificationToggle() {
    const [permission, setPermission] = useState<NotificationPermission | "loading" | "unsupported">("loading");
    const [pwaStatus, setPwaStatus] = useState({ supported: false, isIOS: false, isStandalone: false });

    useEffect(() => {
        const status = getPwaStatus();
        setPwaStatus(status);

        if (!status.supported) {
            setPermission("unsupported");
            return;
        }

        setPermission(Notification.permission);
    }, []);

    const handleEnableClick = async () => {
        // Double check support before executing flow
        if (!("Notification" in window)) return;

        try {
            const result = await Notification.requestPermission();
            setPermission(result);

            if (result === "granted" && "serviceWorker" in navigator) {
                const registration = await navigator.serviceWorker.ready;
                console.log("Service Worker ready for push subscription:", registration);

                // Create the subscription
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
                });

                // Send to API
                const response = await fetch("/api/push/subscribe", {
                    method: "POST",
                    body: JSON.stringify(subscription.toJSON()),
                    headers: { "Content-Type": "application/json" }
                });

                const data = await response.json();
                console.log("API Response:", data);
            }
        } catch (error) {
            console.error("Error in subscription flow:", error);
        }
    };

    // 1. Loading State
    if (permission === "loading") return <p className="text-gray-400 text-sm">Checking permissions...</p>;

    // 2. CASE: iOS / Safari - Guide to Home Screen
    // We explicitly block the button and show instructions instead
    if (pwaStatus.isIOS && !pwaStatus.isStandalone) {
        return (
            <div className="p-4 border rounded-xl bg-blue-50 border-blue-200 max-w-sm">
                <p className="text-sm font-bold text-blue-800">Install to get alerts</p>
                <p className="text-sm text-blue-600 mt-1">
                    Tap the <b>Share</b> button and select <b>"Add to Home Screen"</b> to enable notifications.
                </p>
            </div>
        );
    }

    // 3. CASE: Unsupported Browser
    if (permission === "unsupported") {
        return <p className="text-red-500 text-sm">Notifications are not supported on this browser.</p>;
    }

    // 4. CASE: Already Granted
    if (permission === "granted") return <p className="text-green-500 font-semibold text-sm">✓ Notifications are active!</p>;

    // 5. Default: Enable Button (Only shows if supported and not already granted)
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