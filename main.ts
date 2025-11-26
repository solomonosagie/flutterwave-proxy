// proxy-server/index.ts
// Flutterwave Transfer API Proxy Server
// Routes requests from Supabase Edge Functions to Flutterwave API
// This allows IP whitelisting since proxy has static IP

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const FLW_SECRET = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
const PROXY_AUTH_TOKEN = Deno.env.get("PROXY_AUTH_TOKEN"); // Secret token for authentication
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || ["*"];

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("Origin") || "*";
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes("*")
          ? "*"
          : ALLOWED_ORIGINS.includes(origin)
          ? origin
          : ALLOWED_ORIGINS[0],
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

    // Handle health check for Deno Deploy warm-up
  if (req.method === "GET") {    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify authentication
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.error("❌ Missing or invalid authorization header");
    return new Response(
      JSON.stringify({ error: "Missing or invalid authorization header" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const providedToken = authHeader.substring(7); // Remove 'Bearer '
  if (providedToken !== PROXY_AUTH_TOKEN) {
    console.error("❌ Invalid authentication token");
    return new Response(
      JSON.stringify({ error: "Invalid authentication token" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log("✅ Authentication successful");

  // Get request body
  let body: string;
  try {
    body = await req.text();
    console.log("📥 Received request body:", body.substring(0, 200) + "...");
  } catch (error) {
    console.error("❌ Error reading request body:", error);
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate Flutterwave secret is configured
  if (!FLW_SECRET) {
    console.error("❌ Flutterwave secret key not configured");
    return new Response(
      JSON.stringify({ error: "Server misconfiguration: missing Flutterwave secret key" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Forward to Flutterwave
  try {
    console.log("🚀 Forwarding request to Flutterwave API...");
    const fwResponse = await fetch("https://api.flutterwave.com/v3/transfers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${FLW_SECRET}`,
      },
      body: body,
    });

    const fwData = await fwResponse.text();
    const origin = req.headers.get("Origin") || "*";

    console.log(`📥 Flutterwave response status: ${fwResponse.status}`);
    console.log(`📥 Flutterwave response: ${fwData.substring(0, 200)}...`);

    return new Response(fwData, {
      status: fwResponse.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes("*")
          ? "*"
          : ALLOWED_ORIGINS.includes(origin)
          ? origin
          : ALLOWED_ORIGINS[0],
      },
    });
  } catch (error) {
    console.error("❌ Proxy error:", error);
    return new Response(
      JSON.stringify({
        error: "Proxy server error",
        message: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

