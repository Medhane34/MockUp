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
        console.log("1. [Diagnostic] Button clicked. Starting flow...");

        if (!("Notification" in window)) {
            console.log("2. [Diagnostic] Notifications not supported on this browser.");
            return;
        }

        console.log("2. [Diagnostic] Permission status BEFORE request:", Notification.permission);

        try {
            // This is where the browser instantly returns "denied" if you've blocked it previously
            const result = await Notification.requestPermission();
            console.log("3. [Diagnostic] Permission result returned from browser:", result);

            setPermission(result);

            if (result === "granted") {
                console.log("4. [Diagnostic] Permission GRANTED. Checking Service Worker...");

                if ("serviceWorker" in navigator) {
                    const registration = await navigator.serviceWorker.ready;
                    console.log("5. [Diagnostic] Service Worker ready. Subscribing...");

                    const subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
                    });

                    console.log("6. [Diagnostic] Subscription object received:", subscription);

                    await fetch("/api/push/subscribe", {
                        method: "POST",
                        body: JSON.stringify(subscription),
                        headers: { "Content-Type": "application/json" }
                    });
                    console.log("7. [Diagnostic] Subscription sent to API successfully!");
                }
            } else {
                console.log("4. [Diagnostic] Permission was NOT GRANTED (Result was: " + result + ")");
            }
        } catch (error) {
            console.error("4. [Diagnostic] Critical error in subscription flow:", error);
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
