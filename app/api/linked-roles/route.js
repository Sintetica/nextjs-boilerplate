// app/api/linked-roles/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function html(body) {
    return new Response(
        `<!doctype html><meta charset="utf-8">
     <style>
       body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial;
            background:#0b0b0f;color:#e5e7eb;display:grid;place-items:center;height:100vh}
       .card{max-width:720px;background:#111827;padding:28px 32px;border-radius:16px;
             box-shadow:0 10px 40px rgba(0,0,0,.35)}
       h1{margin:0 0 8px;font-size:22px}
       p{margin:6px 0 0;line-height:1.5;color:#cbd5e1}
       .ok{color:#34d399}
       .err{color:#f87171}
       a{color:#93c5fd}
       code{background:#0f172a;padding:2px 6px;border-radius:6px}
     </style>
     <div class="card">${body}</div>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
}

export async function GET(req) {
    try {
        const url = new URL(req.url);
        const code = url.searchParams.get("code");

        // 1) No code yet -> redirect to Discord OAuth2
        if (!code) {
            const params = new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                redirect_uri: process.env.REDIRECT_URI, // must EXACTLY match Discord Portal redirect
                response_type: "code",
                scope: "identify role_connections.write",
            });
            return NextResponse.redirect(
                `https://discord.com/api/oauth2/authorize?${params.toString()}`
            );
        }

        // 2) Exchange the code for an access token
        const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: "authorization_code",
                code,
                redirect_uri: process.env.REDIRECT_URI,
            }),
        });

        if (!tokenRes.ok) {
            const t = await tokenRes.text();
            console.error("Token exchange failed:", tokenRes.status, t);
            return html(
                `<h1 class="err">Authorization failed</h1>
         <p>Could not exchange authorization code for a token.</p>
         <p><code>${tokenRes.status}</code></p>`
            );
        }

        const token = await tokenRes.json();

        // 3) Get the user identity
        const meRes = await fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${token.access_token}` },
        });

        if (!meRes.ok) {
            const t = await meRes.text();
            console.error("Fetch user failed:", meRes.status, t);
            return html(
                `<h1 class="err">Could not fetch your Discord profile</h1>
         <p><code>${meRes.status}</code></p>`
            );
        }

        const user = await meRes.json();

        // 4) Push Linked Roles metadata
        // Make sure you created a metadata key "verified" (Integer) in Discord Portal.
        const putRes = await fetch(
            `https://discord.com/api/users/@me/applications/${process.env.CLIENT_ID}/role-connection`,
            {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token.access_token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    platform_name: "MyApp",
                    platform_username: user.username,
                    metadata: {
                        verified: 1, // adjust if you added more keys/types in the Portal
                    },
                }),
            }
        );

        if (!putRes.ok) {
            const t = await putRes.text();
            console.error("Update role-connection failed:", putRes.status, t);
            return html(
                `<h1 class="err">Linked Role update failed</h1>
         <p>Check that your metadata schema includes a key <code>verified</code>
         (Integer) and the value type matches.</p>
         <p><code>${putRes.status}</code></p>`
            );
        }

        // 5) Success page
        return html(
            `<h1 class="ok">✅ Linked Role connected</h1>
       <p>User: <strong>${user.username}#${user.discriminator ?? "0"}</strong></p>
       <p>You can close this tab. If your server role has a rule like
       <code>verified ≥ 1</code>, Discord will grant it.</p>`
        );
    } catch (err) {
        console.error("Unhandled error in /api/linked-roles:", err);
        return html(
            `<h1 class="err">Unexpected error</h1>
       <p>${(err && err.message) || "Something went wrong."}</p>`
        );
    }
}
