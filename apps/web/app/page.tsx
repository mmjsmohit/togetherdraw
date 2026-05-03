import type { Metadata } from "next";
import LobbyClient from "./LobbyClient";

export const metadata: Metadata = {
  title: "TogetherDraw",
  description: "Create or join a realtime collaborative whiteboard.",
};

export default function Home() {
  return <LobbyClient />;
}
