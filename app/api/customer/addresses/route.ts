import { requireAgentSubject } from "@/lib/api/agent"
import { listAddresses, saveAddress } from "@/lib/api/customer"
import {
  assertDatabaseConfigured,
  badRequest,
  handle,
  json,
  readJsonBody,
  readOptionalString,
  readString,
} from "@/lib/api/http"

export async function GET(request: Request) {
  return handle(request, async () => {
    assertDatabaseConfigured()
    const subject = await requireAgentSubject()
    const addresses = await listAddresses(subject.userId)
    return json({ count: addresses.length, addresses })
  })
}

/** Saves an address and returns it with the stable id the agent quotes back later. */
export async function POST(request: Request) {
  return handle(request, async () => {
    assertDatabaseConfigured()
    const subject = await requireAgentSubject()
    const body = await readJsonBody(request)

    const isDefault = body.is_default
    if (isDefault !== undefined && typeof isDefault !== "boolean") {
      throw badRequest('"is_default" must be a boolean when present.')
    }

    const address = await saveAddress(subject.userId, {
      line1: readString(body, "line1"),
      city: readString(body, "city"),
      zip: readString(body, "zip"),
      country: readString(body, "country"),
      label: readOptionalString(body, "label"),
      ...(isDefault === undefined ? {} : { isDefault }),
    })

    return json({ address }, 201)
  })
}
