export function formatPrice(amount: string | number, currencyCode = "USD") {
  const value = typeof amount === "string" ? Number.parseFloat(amount) : amount
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(value)
}

export function formatMoney(money: { amount: string; currencyCode: string }) {
  return formatPrice(money.amount, money.currencyCode)
}

export function discountPercent(price: string | number, compareAt: string | number) {
  const p = typeof price === "string" ? Number.parseFloat(price) : price
  const c = typeof compareAt === "string" ? Number.parseFloat(compareAt) : compareAt
  if (!c || c <= p) return 0
  return Math.round(((c - p) / c) * 100)
}
