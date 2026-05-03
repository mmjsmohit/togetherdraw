import type { BoardDocument, BoardElement } from "./board-types";

const EMPTY_DOCUMENT: BoardDocument = {
  version: 1,
  elements: [],
};

function isBoardDocument(value: unknown): value is BoardDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BoardDocument>;
  return candidate.version === 1 && Array.isArray(candidate.elements);
}

export function createBoardDocument(elements: BoardElement[]): BoardDocument {
  return {
    version: 1,
    elements,
  };
}

export function encodeBoardContent(elements: BoardElement[]): string {
  return btoa(JSON.stringify(createBoardDocument(elements)));
}

export function decodeBoardContent(content: string | null | undefined) {
  if (!content) return EMPTY_DOCUMENT;

  try {
    const decoded = JSON.parse(atob(content)) as unknown;
    if (isBoardDocument(decoded)) {
      return decoded;
    }
  } catch {
    return EMPTY_DOCUMENT;
  }

  return EMPTY_DOCUMENT;
}
