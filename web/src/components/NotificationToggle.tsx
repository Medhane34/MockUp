
"use client";

import { useState, useEffect } from "react";

export default function NotificationToggle() {
    const [permission, setPermission] = useState<NotificationPermission | null>(null);

    useEffect(() => {
        // Check initial permission status
        if ("Notification" in window) {
            setPermission(Notification.permission);
        }
    }, []);

    const requestPermission = async () => {
        if (!("Notification" in window)) {
            alert("This browser does not support desktop notifications.");
            return;
        }

        const result = await Notification.requestPermission();
        setPermission(result);

        if (result === "granted") {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
            });

            // Send to your new API route
            await fetch("/api/push/subscribe", {
                method: "POST",
                body: JSON.stringify(subscription),
                headers: { "Content-Type": "application/json" }
            });

            console.log("Subscription saved to Sanity!");
        }
    };

    if (permission === "granted") return <p>Notifications enabled! ✅</p>;
    if (permission === "denied") return <p>Notifications blocked. ❌</p>;

    return (
        <button
            onClick={requestPermission}
            className="bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 transition"
        >
            Enable Notifications
        </button>
    );
}