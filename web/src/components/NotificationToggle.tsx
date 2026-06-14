"use client";

import { useState, useEffect } from "react";

export default function NotificationToggle() {
    const [permission, setPermission] = useState<string>('loading');

    useEffect(() => {
        // Determine initial state
        if (!("Notification" in window)) {
            setPermission('unsupported');
        } else {
            setPermission(Notification.permission);
        }
    }, []);

    const requestPermission = async () => {
        const result = await Notification.requestPermission();
        setPermission(result);

        if (result === 'granted') {
            // Logic to trigger registration
            window.location.reload(); // Quick way to ensure SW picks up permission change
        }
    };

    if (permission === 'loading') return null;
    if (permission === 'unsupported') return <p>Notifications not supported.</p>;
    if (permission === 'granted') return <p>Notifications are enabled!</p>;

    // This will always show if status is 'default' or 'denied'
    return (
        <button
            onClick={requestPermission}
            className="bg-blue-600 text-white px-4 py-2 rounded"
        >
            Enable Notifications
        </button>
    );
}