// app/api/interactions/route.js
import { NextResponse } from "next/server";
import { verifyKey } from "discord-interactions";

export const runtime = "nodejs";

// TEMP: prove the route exists in a browser
export async function GET() {
    return NextResponse.json({ ok: true, route: "/api/interactions" });
}

// --- keep your existing POST handler below ---

async function getRawBody(req) {
    const chunks = [];
    const reader = req.body.getReader();
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
    }
    return Buffer.concat(chunks);
}

export async function POST(req) {
    const signature = req.headers.get("x-signature-ed25519");
    const timestamp = req.headers.get("x-signature-timestamp");
    const rawBody = await getRawBody(req);

    try {
        const valid = verifyKey(rawBody, signature, timestamp, process.env.PUBLIC_KEY);
        if (!valid) return new NextResponse("Bad request signature", { status: 401 });
    } catch {
        return new NextResponse("Bad request signature", { status: 401 });
    }

    const body = JSON.parse(rawBody.toString("utf8"));

    if (body.type === 1) {
        return NextResponse.json({ type: 1 }); // PONG
    }

    return NextResponse.json({
        type: 4,
        data: { content: "Hello from Next.js App Router endpoint!" },
    });
}
