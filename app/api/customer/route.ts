import { requireAgentSubject } from "@/lib/api/agent"
import { buildCustomerPayload, updateProfile } from "@/lib/api/customer"
import { assertDatabaseConfigured, handle, json, readJsonBody, readOptionalString } from "@/lib/api/http"

/**
 * What the agent still needs to ask the shopper for, before checkout.
 *
 * Always 200, including for a customer ref we have never seen — that is a normal state
 * on the happy path, and a 4xx would read to the model as a broken tool.
 */
export async function GET(request: Request) {
  return handle(request, async () => {
    assertDatabaseConfigured()
    const subject = await requireAgentSubject()
    return json({ customer: await buildCustomerPayload(subject.userId) })
  })
}

/** Records contact details the shopper has given. Never merges customers by email. */
export async function PATCH(request: Request) {
  return handle(request, async () => {
    assertDatabaseConfigured()
    const subject = await requireAgentSubject()
    const body = await readJsonBody(request)

    await updateProfile(subject.userId, {
      email: readOptionalString(body, "email"),
      name: readOptionalString(body, "name"),
    })

    return json({ customer: await buildCustomerPayload(subject.userId) })
  })
}
