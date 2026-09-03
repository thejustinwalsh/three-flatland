import type { ObjectLayerData, TileLayerData, TileMapData, TileMapObject } from 'three-flatland'

const ROOM_COLUMNS = 3
const ROOM_ROWS = 3
const OVERLAP = 1

type Cell = { x: number; y: number }

function doorCells(sourceWidth: number, sourceHeight: number): Cell[] {
  const roomStepX = sourceWidth - OVERLAP
  const roomStepY = sourceHeight - OVERLAP
  const cells: Cell[] = []

  for (let roomY = 0; roomY < ROOM_ROWS; roomY++) {
    for (let seamX = 1; seamX < ROOM_COLUMNS; seamX++) {
      const x = seamX * roomStepX
      const y = roomY * roomStepY + ((roomY + seamX) % 2 === 0 ? 3 : sourceHeight - 5)
      cells.push({ x, y }, { x, y: y + 1 })
    }
  }
  for (let seamY = 1; seamY < ROOM_ROWS; seamY++) {
    for (let roomX = 0; roomX < ROOM_COLUMNS; roomX++) {
      const y = seamY * roomStepY
      const x = roomX * roomStepX + ((roomX + seamY) % 2 === 0 ? 5 : sourceWidth - 8)
      cells.push({ x, y }, { x: x + 1, y })
    }
  }
  return cells
}

function cloneObject(object: TileMapObject, xOffset: number, yOffset: number, idOffset: number): TileMapObject {
  return {
    ...object,
    id: object.id + idOffset,
    x: object.x + xOffset,
    y: object.y + yOffset,
    polygon: object.polygon?.map((point) => ({ ...point })),
    polyline: object.polyline?.map((point) => ({ ...point })),
    properties: object.properties ? { ...object.properties } : undefined,
  }
}

function expandTileLayer(
  layer: TileLayerData,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  doors: readonly Cell[]
): TileLayerData {
  const target = new Uint32Array(targetWidth * targetHeight)
  const roomStepX = sourceWidth - OVERLAP
  const roomStepY = sourceHeight - OVERLAP
  for (let roomY = 0; roomY < ROOM_ROWS; roomY++) {
    for (let roomX = 0; roomX < ROOM_COLUMNS; roomX++) {
      const offsetX = roomX * roomStepX
      const offsetY = roomY * roomStepY
      for (let y = 0; y < sourceHeight; y++) {
        for (let x = 0; x < sourceWidth; x++) {
          target[(offsetY + y) * targetWidth + offsetX + x] = layer.data[y * layer.width + x] ?? 0
        }
      }
    }
  }

  const interiorTile = layer.data[Math.floor(sourceHeight / 2) * layer.width + Math.floor(sourceWidth / 2)] ?? 0
  for (const door of doors) target[door.y * targetWidth + door.x] = interiorTile
  return { ...layer, width: targetWidth, height: targetHeight, data: target }
}

function expandObjectLayer(
  layer: ObjectLayerData,
  sourceWidth: number,
  sourceHeight: number,
  tileWidth: number,
  tileHeight: number,
  doors: readonly Cell[]
): ObjectLayerData {
  const roomStepX = (sourceWidth - OVERLAP) * tileWidth
  const roomStepY = (sourceHeight - OVERLAP) * tileHeight
  const doorKeys = new Set(doors.map(({ x, y }) => `${x}:${y}`))
  const objects: TileMapObject[] = []
  for (let roomY = 0; roomY < ROOM_ROWS; roomY++) {
    for (let roomX = 0; roomX < ROOM_COLUMNS; roomX++) {
      const ordinal = roomY * ROOM_COLUMNS + roomX
      for (const object of layer.objects) {
        objects.push(cloneObject(object, roomX * roomStepX, roomY * roomStepY, ordinal * 100_000))
      }
    }
  }

  const seen = new Set<string>()
  return {
    ...layer,
    objects: objects.filter((object) => {
      const cellX = Math.floor((object.x + object.width * 0.5) / tileWidth)
      const cellY = Math.floor((object.y + object.height * 0.5) / tileHeight)
      if (object.type === 'collision' && doorKeys.has(`${cellX}:${cellY}`)) return false
      const key = `${object.type}:${object.x}:${object.y}:${object.width}:${object.height}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
  }
}

/** Build a scrolling 3x3 dungeon with solid internal walls and offset doors. */
export function expandDungeonMap(source: TileMapData): TileMapData {
  const width = ROOM_COLUMNS * (source.width - OVERLAP) + OVERLAP
  const height = ROOM_ROWS * (source.height - OVERLAP) + OVERLAP
  const doors = doorCells(source.width, source.height)
  return {
    ...source,
    width,
    height,
    tileLayers: source.tileLayers.map((layer) =>
      expandTileLayer(layer, source.width, source.height, width, height, doors)
    ),
    objectLayers: source.objectLayers.map((layer) =>
      expandObjectLayer(layer, source.width, source.height, source.tileWidth, source.tileHeight, doors)
    ),
  }
}
