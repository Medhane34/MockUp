// src/app/checkout-sandbox/page.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function SandboxComponent() {
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Unpack the parameterized multi-tenant token data keys from the link
    const sessionToken = searchParams.get("sessionToken") || "";
    const tenantId = searchParams.get("tenantId") || "";
    const telegramId = searchParams.get("telegramId") || "";
    const productSlug = searchParams.get("product") || "macbook-pro";
    const productSku = searchParams.get("productSku") || ""; // 🟢 Matches your simplified URL parameter exactly!
    const productName = searchParams.get("productName") || productSku;
    async function handleSimulatePayment() {
        if (!sessionToken || !tenantId || !telegramId || !productSku) {
            setStatus("❌ Error: Missing critical URL parameters (sessionToken, tenantId, telegramId).");
            return;
        }

        setLoading(true);
        setStatus("Processing simulation payload...");

        try {
            // Fires an automated mock POST request directly to our platform's checkout webhook receiver
            const response = await fetch("/api/webhook/tenant-checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    // Pass a custom test header to act as our cryptographic secret validator signature
                    "X-Platform-Sandbox-Secret": "mock_secret_signature_982341"
                },
                body: JSON.stringify({
                    tx_ref: `tx_${Date.now()}`,
                    status: "success",
                    amount: 80000,
                    currency: "ETB",
                    gateway: "chapa_mock",
                    // Pass the embedded state trackers downstream
                    metadata: {
                        sessionToken: sessionToken.trim(),
                        tenantId: tenantId.trim(),
                        telegramId: telegramId.trim(),
                        productSku: productSku.trim(), // 🟢 Pass your clean warehouse SKU token string directly!
                        productName: productName.trim()
                    }
                })
            });

            if (response.ok) {
                setStatus("✅ SUCCESS! Mock Chapa settlement callback processed. Check your Sanity and Redis dashboards now! You can return to your Telegram bot and click 'Payment Confirmed'.");
            } else {
                const txt = await response.text();
                setStatus(`❌ Gateway Simulation Rejection: ${txt}`);
            }
        } catch (err: any) {
            setStatus(`❌ Critical Transport Failure: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{ padding: "40px", fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto" }}>
            <div style={{ border: "2px dashed #ff9900", padding: "30px", borderRadius: "12px", backgroundColor: "#fffdf5" }}>
                <h2 style={{ margin: "0 0 10px 0", color: "#cc6600" }}>🧪 Aligoo Commerce Sandbox Gateway</h2>
                <p style={{ color: "#555", fontSize: "14px" }}>
                    This layout mimics a multi-tenant web checkout storefront to verify transactional pipelines before banking compliance goes live.
                </p>

                <div style={{ backgroundColor: "#f5f5f5", padding: "15px", borderRadius: "8px", fontSize: "13px", margin: "20px 0" }}>
                    <strong>Active Sandbox Payload:</strong>
                    <ul style={{ margin: "5px 0 0 0", paddingLeft: "20px" }}>
                        <li><b>Target Tenant Store:</b> {tenantId || "null"}</li>
                        <li><b>Buyer Telegram ID:</b> {telegramId || "null"}</li>
                        <li><b>Selected Item:</b> {productSlug}</li>
                        <li><b>Session Security Token:</b> <code style={{ color: "blue" }}>{sessionToken || "null"}</code></li>
                    </ul>
                </div>

                <button
                    onClick={handleSimulatePayment}
                    disabled={loading}
                    style={{
                        backgroundColor: "#ff9900",
                        color: "white",
                        border: "none",
                        padding: "12px 24px",
                        fontSize: "16px",
                        fontWeight: "bold",
                        borderRadius: "6px",
                        cursor: loading ? "not-allowed" : "pointer",
                        width: "100%"
                    }}
                >
                    {loading ? "Settling Balances..." : "💳 Simulate Chapa Payment Success"}
                </button>

                {status && (
                    <div style={{ marginTop: "20px", padding: "12px", borderRadius: "6px", backgroundColor: "#eaeaea", fontSize: "14px", fontWeight: "500" }}>
                        {status}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function SandboxPage() {
    return (
        <Suspense fallback={<div>Loading sandbox parameters...</div>}>
            <SandboxComponent />
        </Suspense>
    );
}
