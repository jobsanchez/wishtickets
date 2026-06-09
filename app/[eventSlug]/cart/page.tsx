import CartRedirect from "./cart-redirect";

export default async function CartPage(props: {
  params: Promise<{ eventSlug: string }>;
}) {
  const { eventSlug } = await props.params;
  return <CartRedirect eventSlug={eventSlug} />;
}
