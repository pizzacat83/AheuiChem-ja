var parser = require('./parser');
var TileMap = require('./tilemap');
var Direction = require('./direction');
var Interpreter = require('./interpreter');

function Cursor(cursor) {
  this.id = cursor.id;
  this.segment = cursor.segment;
  this.x = cursor.x;
  this.y = cursor.y;
  this.direction = {};
  this.direction.x = cursor.direction.x;
  this.direction.y = cursor.direction.y;
  this.selected = cursor.selected;
  this.memory = cursor.memory.slice(); // Copy machine state.
  this.seek = cursor.seek || false;
  this.merge = true;
  this.visit = 0;
}

// Returns initial machine cursor
Cursor.init = function() {
  var initialMemory = [];
  for(var i = 0; i < 28; ++i) initialMemory.push(0);
  return new Cursor({
    id: 0,
    segment: 0,
    x: 0,
    y: 0,
    direction: {
      x: 0,
      y: 1
    },
    selected: 0,
    memory: initialMemory
  });
}

// Calculates memory diff
Cursor.prototype.diff = function(other) {
  return this.memory.map(function(value, key) {
    return value - other.memory[key];
  });
}

// Predicts the path of the code

function Predictor(code) {
  if (typeof code == 'string') {
    this.map = parser.parse(code);
  } else {
    this.map = code;
  }
  // Create segment heading map
  this.reset();
  this.updated = [];
}

Predictor.prototype.reset = function() {
  this.segments = [];
  this.mergeCandidates = [];
  this.stack = [];
  this.headingMap = new TileMap(this.map.width, this.map.height);
  var cursor = Cursor.init();
  var segment = [];
  segment.push(cursor);
  this.segments.push(segment);
  this.stack.push(cursor);
}

Predictor.prototype.postCheck = function() {
  // Merge candidates if possible
  while(this.mergeCandidates.length) {
    var candidate = this.mergeCandidates.shift();
    // Continue if cannot merge
    if(!candidate.merge) continue;
    var segment = this.segments[candidate.segment];
    while(candidate.otherwiseSet.length) {
      var target = candidate.otherwiseSet.shift();
      var targetSeg = this.segments[target.segment];
      // Set 'previous' direction
      var direction = candidate.direction;
      var preDir = Direction.convertToBits(-direction.x, -direction.y);
      // Process only if candidate's segment is lower
      if(candidate.segment >= target.segment) continue;
      // We have to process target...
      if(targetSeg.length == 0) {
        targetSeg.push(target);
      }
      // Pop segment
      var cursor;
      while(targetSeg.length) {
        cursor = targetSeg.shift();
        // Reset segment and id
        cursor.segment = candidate.segment;
        cursor.id = segment.length;
        segment.push(cursor);
        // Go back, and redraw
        if(cursor.before) {
          Direction.process({
            x: cursor.before.x,
            y: cursor.before.y
            }, this.map, cursor.direction, preDir, this.updated,
            cursor.segment);
        }
        // Set 'previous' direction
        direction = cursor.direction;
        preDir = Direction.convertToBits(-direction.x, -direction.y);
      }
    }
    if(cursor && cursor.then) {
      Direction.process({
        x: cursor.x,
        y: cursor.y
        }, this.map, cursor.then.direction, preDir, this.updated,
        cursor.segment);
    }
    // Mark it as cannot merge as it has already processed
    candidate.merge = false;
  }
}

Predictor.prototype.next = function() {
  if (this.stack.length === 0) return false;
  // Store previous cursor.. I doubt it'll be used actually.
  var oldCursor = this.stack.pop();
  var cursor = new Cursor(oldCursor);
  cursor.before = oldCursor;
  if(!cursor.seek) oldCursor.then = cursor;
  // Fetch current segment
  var segment = this.segments[cursor.segment];
  var direction = cursor.direction;
  // Store previous reversed direction
  var preDir = Direction.convertToBits(-direction.x, -direction.y);
  var tile = this.map.get(cursor.x, cursor.y);
  var headingTile = this.headingMap.get(cursor.x, cursor.y);
  // Create headingTile if not exists.
  if (headingTile == null) {
    headingTile = {};
    this.headingMap.set(cursor.x, cursor.y, headingTile);
  }
  // Continues execution in new segment if this is set.
  var newSegment = false;
  // Stop execution if this is set.
  var stop = false;
  if (tile != null) {
    // Fetch x, y value from tile's direction
    var tileDir = Direction.map[tile.direction];
    // Calculate the direction where the cursor will go
    direction.x = Direction.calculate(direction.x, tileDir.x);
    direction.y = Direction.calculate(direction.y, tileDir.y);
    // Fetch command
    var command = Interpreter.CommandMap[tile.command];
    // Just skip if command is null
    if(command != null) {
      if(cursor.memory[cursor.selected] >= command.data) {
        cursor.memory[cursor.selected] -= command.data; // Data we lose
        cursor.memory[cursor.selected] += command.output; // Data we get
        if (tile.command == 'select') {
          cursor.selected = tile.data;
        }
        if (tile.command == 'move') {
          cursor.memory[tile.data] ++;
        }
        if (tile.command == 'end') {
          // End of segment; Stop processing.
          // Techincally 'end' operator requires one data to stop,
          // But most programs won't work with that.
          stop = true;
        }
        if (tile.command == 'condition') {
          // Condition; Always create new segment.
          // Simply create new cursor with new segment, flip direction,
          // move position and save it.
          var newCursor = new Cursor(cursor);
          newCursor.direction.x = -direction.x;
          newCursor.direction.y = -direction.y;
          oldCursor.otherwise = newCursor;
          this.processCursor(newCursor, segment, tile, headingTile,
            stop, true, preDir);
        }
        // It can't be mergeable since original path has not stopped
        oldCursor.merge = false;
      } else {
        // Underflow has occurred; Go to opposite direction.
        direction.x = -direction.x;
        direction.y = -direction.y;
        // For consistency, this should create a new segment;
        // But it can probably be merged.
        newSegment = true;
        // Saving this for good measure
        if(!oldCursor.seek) {
          if(!oldCursor.otherwiseSet) {
            oldCursor.otherwiseSet = [];
            this.mergeCandidates.push(oldCursor);
          }
          oldCursor.otherwiseSet.push(cursor);
        }
      }
    }
  }
  this.processCursor(cursor, segment, tile, headingTile,
    stop, newSegment, preDir);
  return this.stack.length > 0;
};

Predictor.prototype.processCursor = function(cursor, segment, tile, headingTile,
  stop, newSegment, preDir) {
  // Don't save current cursor and increment it if this is set.
  var seek = false;
  var direction = cursor.direction;
  var directionBits = Direction.convertToBits(direction.x, direction.y, true);
  var before;
  if (headingTile[directionBits]) {
    before = headingTile[directionBits];
    before.visit ++;
    // Continue cursor in seek mode if memory has less data than before.
    var hasLess = !cursor.memory.every(function(value, key) {
      var diff = before.memory[key] - value;
      // Maximum memory space
      if(diff <= 0 && value >= 8) cursor.memory[key] = 8;
      // Check 16 times, then just check if it has less data.
      if(before.visit > 16) return diff <= 0;
      else return diff == 0;
    });
    before.memory = cursor.memory.slice();
    seek = hasLess;
    if(!hasLess) stop = true;
  }
  // 'newSegment' should set their ID before drawing path.
  if(before && newSegment) {
    cursor.id = before.id;
    cursor.segment = before.segment;
  }
  if (!stop) {
    if(!seek) {
      if (newSegment) {
        cursor.id = -1;
        cursor.segment = this.segments.length;
        segment = [];
        this.segments.push(segment);
      }
      // Increment cursor id to avoid confliction
      cursor.id ++;
      // Insert segment into segment.
      segment.push(cursor);
      // Write current cursor;
      headingTile[directionBits] = cursor;
    }
    // Push current cursor to stack.
    this.stack.push(cursor);
  }
  // Since this is the copy of original object, we can safely modify it.
  // This communicates with the 'old' data protocol, for now.
  Direction.process(cursor, this.map, direction, preDir, this.updated,
    cursor.segment, false);
  // Copy segment and ID to honor condition
  // But 'merging' cursor shouldn't.
  // It may cause conflicts because it doesn't add itself to segments,
  // But it's prevented because it's not added to segment if seek is true
  if(before && seek) {
    cursor.id = before.id;
    cursor.segment = before.segment;
  }
  cursor.seek = seek;
}

// Assembly command map to support ashembly
var AssemblyMap = {
  'end': 'halt',
  'add': 'add',
  'multiply': 'mul',
  'subtract': 'sub',
  'divide': 'div',
  'mod': 'mod',
  'pop': 'pop',
  'pop-number': 'popnum',
  'pop-unicode': 'popchar',
  'push': 'push',
  'push-number': 'pushnum',
  'push-unicode': 'pushchar',
  'copy': 'dup',
  'flip': 'swap',
  'select': 'sel',
  'move': 'mov',
  'compare': 'cmp',
  'condition': 'brz'
};

// Converts code to Assembly. Just for fun! :D
Predictor.prototype.assembly = function() {
  var resolves = [];
  var labels = [];
  var codes = [];
  // Start reading code from segment 0, id 0
  for(var segmentId = 0; segmentId < this.segments.length; ++segmentId) {
    var segment = this.segments[segmentId];
    for(var id = 0; id < segment.length; ++id) {
      var cursor = segment[id];
      cursor.index = codes.length;
      var headingTile = this.headingMap.get(cursor.x, cursor.y);
      var tile = this.map.get(cursor.x, cursor.y);
      if(tile == null) continue;
      if(tile.command != 'none') {
        var command = Interpreter.CommandMap[tile.command];
        var flipBit = Direction.convertToBits(-cursor.direction.x,
          -cursor.direction.y, true);
        if(headingTile[flipBit]) {
          if(command.data > 0) {
            var code = ['brpop'+command.data, headingTile[flipBit]];
            codes.push(code);
            resolves.push(code);
          }
        }
        var code = [AssemblyMap[tile.command]];
        if(tile.command == 'push') code[1] = tile.data;
        if(tile.command == 'select') code[1] = tile.data;
        if(tile.command == 'move') code[1] = tile.data;
        if(tile.command == 'condition') {
          code[1] = cursor.otherwise;
          resolves.push(code);
        }
        codes.push(code);
      } else {
        if(id == segment.length - 1) {
          // Fetch x, y value from tile's direction
          var tileDir = Direction.map[tile.direction];
          // Calculate the direction where the cursor will go
          var dirX = Direction.calculate(cursor.direction.x, tileDir.x);
          var dirY = Direction.calculate(cursor.direction.y, tileDir.y);
          var dirBit = Direction.convertToBits(dirX, dirY, true);
          var targetTile = headingTile[dirBit];
          if(!targetTile) continue;
          var code = ['jmp', targetTile];
          codes.push(code);
          resolves.push(code);
        }
      }
    }
  }
  for(var i = 0; i < resolves.length; ++i) {
    var idx = resolves[i][1].index;
    if(labels.indexOf(idx) == -1) labels.push(idx);
    resolves[i][1] = 'p'+labels.indexOf(idx);
  }
  var returned = [];
  codes.forEach(function(v, k) {
    var label = labels.indexOf(k);
    if(label != -1) {
      returned.push(":p"+label);
    }
    returned.push(v.join(' '));
  });
  console.log(returned.join("\n"));
}

module.exports = Predictor;
