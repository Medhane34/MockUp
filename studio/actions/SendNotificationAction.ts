
// sanity/actions/SendNotificationAction.ts
import { DocumentActionComponent, DocumentActionProps } from 'sanity';

export const SendNotificationAction: DocumentActionComponent = (props: DocumentActionProps) => {
    return {
        label: 'Send Notification',
        onHandle: async () => {
            // 1. Ask for confirmation before sending
            const confirmed = window.confirm("Are you sure you want to send this notification to all subscribers?");
            if (!confirmed) return;

            // 2. Trigger your API route
            // IMPORTANT: Add a secret key to prevent strangers from spamming your users!
            try {
                const response = await fetch('/api/push/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': 'xX0vkdQ0j9' // See Step 3 for security
                    }
                });

                if (response.ok) {
                    window.alert("Notifications sent successfully!");
                } else {
                    window.alert("Failed to send notifications.");
                }
            } catch (error) {
                console.error(error);
                window.alert("Error triggering notification.");
            }
        },
    };
};