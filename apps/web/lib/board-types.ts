export type Tool = "select" | "rect" | "circle" | "pen";

export type RectElement = {
  id: string;
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type CircleElement = {
  id: string;
  type: "circle";
  x: number;
  y: number;
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type LineElement = {
  id: string;
  type: "line";
  points: number[];
  stroke: string;
  strokeWidth: number;
};

export type BoardElement = RectElement | CircleElement | LineElement;

export type BoardDocument = {
  version: 1;
  elements: BoardElement[];
};

export type DrawEvent = {
  kind: "upsert";
  element: BoardElement;
  originClientId: string;
  originUserId: string;
  eventId: string;
};

export type Board = {
  id: string;
  slug: string;
  creatorId: string;
  content: string | null;
  createdAt: string;
};

export type Session = {
  token: string;
  user: {
    id: string;
    createdAt: string;
  };
};

export type PresenceMember = {
  userId: string;
};
