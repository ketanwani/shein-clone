import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"
import { withApiLogging } from "@/lib/api/log"

const handlers = toNextJsHandler(auth.handler)

// Logged status-only: these bodies carry OTPs and session tokens.
export const GET = withApiLogging(handlers.GET)
export const POST = withApiLogging(handlers.POST)
