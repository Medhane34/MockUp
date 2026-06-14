"use client";

import { useState, useEffect } from "react";

export default function NotificationToggle() {
    const [permission, setPermission] = useState<string>('loading');

    useEffect(() => {
        if (!("Notification" in window)) {
            setPermission('unsupported');
            return;
        }

        const currentPermission = Notification.permission;
        setPermission(currentPermission);

        // AUTO-POPUP ON FIRST VISIT: 
        // If the user has never been asked before, prompt them immediately
        if (currentPermission === 'default') {
            requestPermission();
        }
    }, []);

    const requestPermission = async () => {
        const result = await Notification.requestPermission();
        setPermission(result);

        if (result === 'granted') {
            // Give the browser a split second to save state before reload
            setTimeout(() => {
                window.location.reload();
            }, 100);
        }
    };

    if (permission === 'loading') return null;
    if (permission === 'unsupported') return <p>Notifications not supported.</p>;
    if (permission === 'granted') return <p>Notifications are enabled!</p>;

    // Shows if they manually blocked it ('denied') or closed the auto-popup
    return (
        <button
            onClick={requestPermission}
            className="bg-blue-600 text-white px-4 py-2 rounded"
        >
            Enable Notifications
        </button>
    );
}
