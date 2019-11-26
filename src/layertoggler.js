var TileMap = require('./tilemap');
var Table = require('./table');

var LayerToggleBinding = [
  [
    {
      name: '掃除',
      data: 'clean'
    },
    {
      name: '命令',
      data: 'command'
    },
    {
      name: '矢印',
      data: 'arrow'
    },
    {
      name: '経路',
      data: 'path',
    },
    {
      name: '文字',
      data: 'text'
    },
    {
      name: '背景',
      data: 'highlight'
    }
  ]
];

function LayerToggler(renderer, element) {
  this.renderer = renderer;
  this.element = element;
  this.init();
}

LayerToggler.prototype.init = function() {
  var self = this;
  var tilemap = TileMap.fromArray(LayerToggleBinding).transpose();
  console.log(tilemap);
  var table = new Table(this.element, tilemap, function(node, tile, x, y) {
    if(tile == null) {
      node.parentNode.removeChild(node);
      return;
    }
    node.id = 'view-'+tile.data;
    node.className = 'view';
    node.appendChild(document.createTextNode(tile.name));
    node.addEventListener('click', function() {
      // TODO move it somewhere else????
      if(tile.data == 'clean') {
        self.trim();
        return;
      }
      var style = self.renderer.canvases.getCanvas(tile.data).style;
      if(style.visibility == 'hidden') {
        style.visibility = 'visible';
        node.className = 'view';
      } else {
        style.visibility = 'hidden';
        node.className = 'view selected';
      }
    });
  });
}

module.exports = LayerToggler;
