// src/feedback/particles.ts
// Where particles start and which way they fly. They spawn anywhere on the centre line of
// a group of cells (the polygon through the centres of its outer cells: the links between
// neighbouring cells that lie on its outline) and fly away from it, so a burst comes off
// the whole piece rather than from its middle. Pure: randomness is passed in.
// Coordinates are in board cells; (x + 0.5, y + 0.5) is the centre of cell (x, y).

export interface Spawn {
  x: number;
  y: number;
  /** Unit direction of travel. */
  dx: number;
  dy: number;
}

/** A link between two neighbouring cell centres, with the outward normal(s) of its open side(s). */
export interface CentreEdge {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  normals: readonly (readonly [nx: number, ny: number])[];
}

/** Largest angle (radians) a direction strays from its edge's outward normal (< 90°). */
export const SPAWN_SPREAD = Math.PI / 5;

/**
 * The centre-line polygon of a group of cells, as edges. A link between two neighbours is
 * inside the group (and left out) when the cells on both sides of it are filled too; a
 * side is open when either cell next to the link on that side is empty.
 */
export function centreLine(cells: readonly (readonly [number, number])[]): CentreEdge[] {
  const filled = new Set(cells.map(([x, y]) => `${x},${y}`));
  const has = (x: number, y: number) => filled.has(`${x},${y}`);
  const edges: CentreEdge[] = [];
  for (const [x, y] of cells) {
    if (has(x + 1, y)) {
      const normals: [number, number][] = [];
      if (!(has(x, y - 1) && has(x + 1, y - 1))) normals.push([0, -1]);
      if (!(has(x, y + 1) && has(x + 1, y + 1))) normals.push([0, 1]);
      if (normals.length)
        edges.push({ ax: x + 0.5, ay: y + 0.5, bx: x + 1.5, by: y + 0.5, normals });
    }
    if (has(x, y + 1)) {
      const normals: [number, number][] = [];
      if (!(has(x - 1, y) && has(x - 1, y + 1))) normals.push([-1, 0]);
      if (!(has(x + 1, y) && has(x + 1, y + 1))) normals.push([1, 0]);
      if (normals.length)
        edges.push({ ax: x + 0.5, ay: y + 0.5, bx: x + 0.5, by: y + 1.5, normals });
    }
  }
  return edges;
}

/**
 * `count` spawns on the cells' centre line, each flying away from it: along an open
 * side's normal, turned by up to ±SPAWN_SPREAD. A lone cell (no links) bursts from its
 * centre in every direction.
 */
export function spawnsOnCentreLine(
  cells: readonly (readonly [number, number])[],
  count: number,
  rand: () => number,
): Spawn[] {
  const edges = centreLine(cells);
  const spawns: Spawn[] = [];
  for (let i = 0; i < count; i++) {
    const e = edges[Math.floor(rand() * edges.length)];
    if (!e) {
      const [x, y] = cells[i % cells.length]!;
      const a = rand() * Math.PI * 2;
      spawns.push({ x: x + 0.5, y: y + 0.5, dx: Math.cos(a), dy: Math.sin(a) });
      continue;
    }
    const t = rand();
    const [nx, ny] = e.normals[Math.floor(rand() * e.normals.length)]!;
    const a = Math.atan2(ny, nx) + (rand() * 2 - 1) * SPAWN_SPREAD;
    spawns.push({
      x: e.ax + (e.bx - e.ax) * t,
      y: e.ay + (e.by - e.ay) * t,
      dx: Math.cos(a),
      dy: Math.sin(a),
    });
  }
  return spawns;
}

/** `count` spawns at one point, in every direction (the board-clear celebration). */
export function radialSpawns(x: number, y: number, count: number, rand: () => number): Spawn[] {
  return Array.from({ length: count }, () => {
    const a = rand() * Math.PI * 2;
    return { x, y, dx: Math.cos(a), dy: Math.sin(a) };
  });
}
