"use client";

import { ReactNode } from "react";
import {
  LiveblocksProvider,
  RoomProvider,
  ClientSideSuspense,
} from "@liveblocks/react/suspense";

export function Room({
  children,
  board,
}: {
  children: ReactNode;
  board: string;
}) {
  return (
    <LiveblocksProvider
      publicApiKey={
        "pk_dev_6ftr2EQKFhl97ya8lLs_jzTyEH21Eun_L9Lf8J1LJY4wb41QolsRvUhUHIZRXbMn"
      }
    >
      <RoomProvider id={board} initialPresence={{ cursor: null }}>
        <ClientSideSuspense fallback={<div>Loading…</div>}>
          {children}
        </ClientSideSuspense>
      </RoomProvider>
    </LiveblocksProvider>
  );
}
