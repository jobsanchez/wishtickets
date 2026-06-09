export default async function AssignSeatsPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await props.params;
  const AssignSeatsClient = (await import("./assign-seats-client")).default;
  return <AssignSeatsClient eventId={eventId} />;
}
