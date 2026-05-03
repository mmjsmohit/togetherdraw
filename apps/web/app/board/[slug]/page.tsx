import BoardPageClient from "./BoardPageClient";
import { Room } from "../../Room";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <Room board={slug}>
      <BoardPageClient slug={decodeURIComponent(slug)} />
    </Room>
  );
}
