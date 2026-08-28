// ---------------------------------------------------------------------------
// THE VOCABULARY.
//
// The building is generated; the rooms it is generated from are not. A room
// type says how big it can be, what it is made of, how it is lit, and what
// tends to be in it and where. The generator (15-generate.js) picks types,
// sizes, connections and contents; nothing here is a floor plan.
//
// where:
//   'wall'    against a wall, back to it, facing in
//   'corner'  in a corner, turned roughly diagonally
//   'floor'   anywhere there is room
//   'centre'  near the middle
//   'hang'    on a wall at height (pictures, hooks)
//   'on'      on top of the last surface placed (tables, benches)
// ---------------------------------------------------------------------------

// footprint [w, d] and whether it can be walked over, for the occupancy grid
const PROP_INFO = {
  table: [1.5, 0.9], chair: [0.5, 0.5], sideboard: [1.6, 0.5], armchair: [0.9, 0.85],
  wardrobe: [1.15, 0.62], tv: [0.7, 0.6], standardLamp: [0.45, 0.45], radiator: [0.95, 0.15],
  workbench: [2.45, 0.75], shelfRun: [0.7, 5.2], crateStack: [0.6, 0.6], pallet: [1.2, 1.1],
  drum: [0.6, 0.6], tarp: [3.3, 2.7], rug: [3.2, 2.4], bucket: [0.32, 0.32],
  sink: [1.0, 0.6], units: [2.0, 0.62], boiler: [0.7, 0.45], pipes: [0.3, 0.3],
  box: [0.32, 0.32], bottle: [0.1, 0.1], tin: [0.1, 0.1], book: [0.22, 0.22],
  mug: [0.1, 0.1], brick: [0.22, 0.12], jar: [0.12, 0.12], plank: [0.9, 0.15],
  ball: [0.16, 0.16], folder: [0.25, 0.33], telephone: [0.23, 0.2],
  picture: [0, 0], coatHooks: [0, 0], mirror: [0, 0]
};

const SMALL = ['box', 'bottle', 'tin', 'book', 'mug', 'brick', 'jar', 'plank', 'ball', 'folder'];

const ROOM_TYPES = {

  front_room: {
    label: ['the front room', 'the sitting room', 'the room at the front'],
    w: [4.4, 7.2], d: [3.6, 6.0], h: [2.5, 2.95],
    floor: 'carpet', wall: 'wallpaper', ceiling: 'plaster',
    skirting: true, picture_rail: true, fog: [0.05, 0.075],
    lights: 'domestic', decals: [0, 2],
    dress: [
      { p: 'rug', n: [0, 1], where: 'centre' },
      { p: 'table', n: [0, 1], where: 'floor', on: [['mug', 0, 3], ['bottle', 0, 2], ['book', 0, 2], ['telephone', 0, 1]] },
      { p: 'chair', n: [1, 3], where: 'floor' },
      { p: 'sideboard', n: [0, 1], where: 'wall', on: [['book', 0, 2], ['tin', 0, 2], ['telephone', 0, 1]] },
      { p: 'armchair', n: [0, 2], where: 'wall' },
      { p: 'standardLamp', n: [0, 1], where: 'corner' },
      { p: 'tv', n: [0, 1], where: 'wall' },
      { p: 'wardrobe', n: [0, 1], where: 'wall' },
      { p: 'picture', n: [1, 3], where: 'hang' },
      { p: 'scatter', n: [4, 11], where: 'floor' }
    ]
  },

  back_room: {
    label: ['the back room', 'the other room', 'the room behind'],
    w: [3.2, 5.4], d: [3.0, 4.8], h: [2.4, 2.8],
    floor: 'carpet', wall: 'wallpaper', ceiling: 'plaster',
    skirting: true, fog: [0.05, 0.08],
    lights: 'domestic', decals: [1, 3],
    dress: [
      { p: 'table', n: [0, 1], where: 'floor', on: [['jar', 0, 3], ['folder', 0, 2]] },
      { p: 'chair', n: [0, 2], where: 'floor' },
      { p: 'wardrobe', n: [0, 1], where: 'wall' },
      { p: 'sideboard', n: [0, 1], where: 'wall' },
      { p: 'crateStack', n: [0, 2], where: 'corner' },
      { p: 'picture', n: [0, 2], where: 'hang' },
      { p: 'scatter', n: [4, 10], where: 'floor' }
    ]
  },

  box_room: {
    label: ['the box room', 'the small room', 'a room with nothing in it'],
    w: [2.1, 3.2], d: [2.0, 3.0], h: [2.3, 2.6],
    floor: 'carpet', wall: 'wallpaper', ceiling: 'plaster',
    skirting: true, fog: [0.06, 0.1],
    lights: 'bare', decals: [2, 4],
    dress: [
      { p: 'crateStack', n: [0, 3], where: 'wall' },
      { p: 'chair', n: [0, 1], where: 'corner' },
      { p: 'picture', n: [0, 1], where: 'hang' },
      { p: 'scatter', n: [2, 8], where: 'floor' }
    ]
  },

  kitchen: {
    label: ['the kitchen', 'the scullery'],
    w: [2.8, 4.6], d: [2.6, 4.2], h: [2.4, 2.75],
    floor: 'tile', wall: 'cream', ceiling: 'plaster',
    skirting: true, fog: [0.05, 0.08],
    lights: 'strip', decals: [1, 3],
    dress: [
      { p: 'units', n: [1, 2], where: 'wall', on: [['jar', 1, 4], ['tin', 0, 3], ['mug', 0, 3], ['bottle', 0, 2]] },
      { p: 'sink', n: [0, 1], where: 'wall' },
      { p: 'table', n: [0, 1], where: 'centre', on: [['mug', 0, 2], ['jar', 0, 2]] },
      { p: 'chair', n: [0, 2], where: 'floor' },
      { p: 'bucket', n: [0, 2], where: 'floor' },
      { p: 'boiler', n: [0, 1], where: 'wall' },
      { p: 'scatter', n: [4, 10], where: 'floor' }
    ]
  },

  // A stairwell. Tall, because the whole point of it is the climb, and the
  // opening at the top sits three metres up. What is through that opening is
  // another portal: you go up, and you come out on the ground floor.
  stairwell: {
    label: ['the stairs', 'the stairwell', 'the back stairs'],
    w: [2.5, 3.2], d: [6.4, 7.6], h: [5.6, 6.2],
    floor: 'tile', wall: 'green', ceiling: 'plaster',
    skirting: true, dado: false, fog: [0.05, 0.08],
    lights: 'corridor', decals: [2, 4],
    dress: [
      { p: 'bucket', n: [0, 1], where: 'floor' },
      { p: 'crateStack', n: [0, 1], where: 'wall' }
    ]
  },

  passage: {
    label: ['the passage', 'the corridor', 'the way through'],
    corridor: true,
    w: [1.2, 1.9], d: [6, 22], h: [2.4, 2.8],
    floor: 'tile', wall: 'green', ceiling: 'plaster',
    skirting: true, dado: true, fog: [0.07, 0.11],
    lights: 'corridor', decals: [2, 5],
    dress: [
      { p: 'radiator', n: [0, 1], where: 'wall' },
      { p: 'chair', n: [0, 1], where: 'wall' },
      { p: 'coatHooks', n: [0, 1], where: 'hang' },
      { p: 'picture', n: [1, 4], where: 'hang' },
      { p: 'bucket', n: [0, 1], where: 'wall' },
      { p: 'scatter', n: [2, 7], where: 'floor' }
    ]
  },

  landing: {
    label: ['the landing', 'the half-landing'],
    w: [2.2, 3.4], d: [2.2, 3.4], h: [2.4, 2.8],
    floor: 'carpet', wall: 'green', ceiling: 'plaster',
    skirting: true, dado: true, fog: [0.06, 0.09],
    lights: 'bare', decals: [1, 3],
    dress: [
      { p: 'chair', n: [0, 1], where: 'corner' },
      { p: 'picture', n: [1, 3], where: 'hang' },
      { p: 'scatter', n: [1, 5], where: 'floor' }
    ]
  },

  storeroom: {
    label: ['the store', 'the back store'],
    w: [4.0, 8.0], d: [4.0, 8.0], h: [2.6, 3.4],
    floor: 'concrete', wall: 'blue', ceiling: 'concrete', lining: 'metal',
    fog: [0.05, 0.08], lights: 'strip', decals: [2, 5],
    dress: [
      { p: 'shelfRun', n: [1, 2], where: 'wall' },
      { p: 'crateStack', n: [1, 4], where: 'floor' },
      { p: 'drum', n: [0, 3], where: 'corner' },
      { p: 'pallet', n: [0, 2], where: 'floor' },
      { p: 'workbench', n: [0, 1], where: 'wall', on: [['tin', 0, 3], ['jar', 0, 2], ['folder', 0, 2]] },
      { p: 'scatter', n: [6, 16], where: 'floor' }
    ]
  },

  plant_room: {
    label: ['—'],
    w: [3.0, 5.0], d: [3.0, 5.0], h: [2.6, 3.6],
    floor: 'concrete', wall: 'concrete', ceiling: 'concrete', lining: 'metal',
    fog: [0.06, 0.1], lights: 'bare', decals: [3, 6],
    dress: [
      { p: 'boiler', n: [1, 2], where: 'wall' },
      { p: 'pipes', n: [2, 5], where: 'wall' },
      { p: 'drum', n: [0, 2], where: 'corner' },
      { p: 'bucket', n: [0, 2], where: 'floor' },
      { p: 'scatter', n: [3, 8], where: 'floor' }
    ]
  },

  // The room that cannot be there. Reached through a normal door in a normal
  // house, or through something worse.
  warehouse: {
    label: ['—'],
    impossible: true,
    w: [16, 30], d: [12, 22], h: [5.0, 8.0],
    floor: 'concrete', wall: 'concrete', ceiling: 'concrete', lining: 'metal',
    fog: [0.035, 0.055], lights: 'hangar', decals: [4, 9],
    dress: [
      { p: 'shelfRun', n: [2, 5], where: 'floor' },
      { p: 'crateStack', n: [3, 8], where: 'floor' },
      { p: 'pallet', n: [1, 4], where: 'floor' },
      { p: 'drum', n: [2, 6], where: 'floor' },
      { p: 'workbench', n: [0, 2], where: 'wall' },
      { p: 'tarp', n: [0, 2], where: 'floor' },
      { p: 'chair', n: [1, 1], where: 'centre' },        // one chair, facing nothing
      { p: 'wardrobe', n: [0, 1], where: 'wall' },        // and one thing from a house
      { p: 'scatter', n: [14, 30], where: 'floor' }
    ]
  }
};

// What tends to follow what. The building has manners, up to a point.
const FOLLOWS = {
  front_room: ['passage', 'passage', 'back_room', 'kitchen', 'box_room'],
  back_room:  ['passage', 'box_room', 'kitchen', 'back_room', 'storeroom'],
  box_room:   ['passage', 'back_room'],
  kitchen:    ['passage', 'back_room', 'storeroom'],
  passage:    ['back_room', 'box_room', 'kitchen', 'landing', 'storeroom', 'front_room', 'passage'],
  landing:    ['passage', 'box_room', 'back_room'],
  storeroom:  ['passage', 'plant_room', 'storeroom'],
  plant_room: ['passage', 'storeroom'],
  warehouse:  ['passage', 'storeroom']
};

const LIGHT_KINDS = {
  domestic: { colors: [0xffa956, 0xffc98a], intensity: [5, 9], dist: [7, 10], flicker: [0, 0.02], height: 'ceiling' },
  bare:     { colors: [0xffd8a0], intensity: [4, 7], dist: [6, 9], flicker: [0, 0.05], height: 'ceiling' },
  strip:    { colors: [0xcfe0ff, 0xdfeaff], intensity: [7, 13], dist: [9, 14], flicker: [0, 0.3], tube: true, height: 'ceiling' },
  corridor: { colors: [0xcfe0ff, 0xffb06a], intensity: [6, 12], dist: [8, 13], flicker: [0, 0.36], tube: 0.6, height: 'ceiling' },
  hangar:   { colors: [0xffb877, 0xff9a55], intensity: [90, 190], dist: [26, 36], flicker: [0, 0.25], height: 'high' }
};
