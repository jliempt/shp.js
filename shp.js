// Shapefile parser, following the specification at
// http://www.esri.com/library/whitepapers/pdfs/shapefile.pdf


SHP = {
  NULL: 0,
  POINT: 1,
  POLYLINE: 3,
  POLYGON: 5
};

SHP.getShapeName = function(id) {
  for (name in this) {
    if (id === this[name]) {
      return name;
    }
  }
};

SHPParser = function() {
};

SHPParser.load = function(src, callback, onerror) {
  var xhr = new XMLHttpRequest();
  xhr.responseType = 'arraybuffer';
  xhr.onload = function() {
    console.log(xhr.response);
    var d = new SHPParser().parse(xhr.response);
    callback(d);
  };
  xhr.onerror = onerror;
  xhr.open('GET', src);
  xhr.send(null);
};

SHPParser.prototype.parse = function(arrayBuffer) {
  var o = {};
  var dv = new DataView(arrayBuffer);
  var idx = 0;
  o.fileCode = dv.getInt32(idx, false);
  if (o.fileCode != 0x0000270a) {
    throw (new Error("Unknown file code: " + o.fileCode));
  }
  idx += 6*4;
  o.wordLength = dv.getInt32(idx, false);
  o.byteLength = o.wordLength * 2;
  idx += 4;
  o.version = dv.getInt32(idx, true);
  idx += 4;
  o.shapeType = dv.getInt32(idx, true);
  idx += 4;
  o.minX = dv.getFloat64(idx, true);
  o.minY = dv.getFloat64(idx+8, true);
  o.maxX = dv.getFloat64(idx+16, true);
  o.maxY = dv.getFloat64(idx+24, true);
  o.minZ = dv.getFloat64(idx+32, true);
  o.maxZ = dv.getFloat64(idx+40, true);
  o.minM = dv.getFloat64(idx+48, true);
  o.maxM = dv.getFloat64(idx+56, true);
  idx += 8*8;
  o.records = [];
  while (idx < o.byteLength) {
    var record = {};
    record.number = dv.getInt32(idx, false);
    idx += 4;
    record.length = dv.getInt32(idx, false);
    idx += 4;
    try {
      record.shape = this.parseShape(dv, idx, record.length);
    } catch(e) {
      console.log(e, record);
    }
    idx += record.length * 2;
    o.records.push(record);
  }
  return o;
};

SHPParser.prototype.parseShape = function(dv, idx, length) {
  var i=0, c=null;
  var shape = {};
  shape.type = dv.getInt32(idx, true);
  idx += 4;
  var byteLen = length * 2;
  switch (shape.type) {
    case SHP.NULL: // Null
      break;

    case SHP.POINT: // Point (x,y)
      shape.content = {
        x: dv.getFloat64(idx, true),
        y: dv.getFloat64(idx+8, true)
      };
      break;
    case SHP.POLYLINE: // Polyline (MBR, partCount, pointCount, parts, points)
    case SHP.POLYGON: // Polygon (MBR, partCount, pointCount, parts, points)
      c = shape.content = {
        minX: dv.getFloat64(idx, true),
        minY: dv.getFloat64(idx+8, true),
        maxX: dv.getFloat64(idx+16, true),
        maxY: dv.getFloat64(idx+24, true),
        parts: new Int32Array(dv.getInt32(idx+32, true)),
        points: new Float64Array(dv.getInt32(idx+36, true)*2)
      };
      idx += 40;
      for (i=0; i<c.parts.length; i++) {
        c.parts[i] = dv.getInt32(idx, true);
        idx += 4;
      }
      for (i=0; i<c.points.length; i++) {
        c.points[i] = dv.getFloat64(idx, true);
        idx += 8;
      }
      break;

    case 8: // MultiPoint (MBR, pointCount, points)
    case 11: // PointZ (X, Y, Z, M)
    case 13: // PolylineZ
    case 15: // PolygonZ
    case 18: // MultiPointZ
    case 21: // PointM (X, Y, M)
    case 23: // PolylineM
    case 25: // PolygonM
    case 28: // MultiPointM
    case 31: // MultiPatch
      throw new Error("Shape type not supported: "
                      + shape.type + ':' +
                      + SHP.getShapeName(shape.type));
    default:
      throw new Error("Unknown shape type at " + (idx-4) + ': ' + shape.type);
  }
  return shape;
};

THREE.SHPLoader = function() {};

var p = THREE.SHPLoader.prototype;

p.createModel = function(shp, spherize) {
  var polys = [];
  var lines = [];
  for (var i=0; i<shp.records.length; i++) {
    var r = shp.records[i].shape;
    if (r.type === SHP.POLYLINE || r.type === SHP.POLYGON) {
      var points = r.content.points;
      var parts = r.content.parts;
      var poly = [];
      poly.push(new THREE.Vector2(x, y));
      for (var k=0; k<parts.length; k++) {
        poly = [];
        for (var j=parts[k], last=parts[k+1]||(points.length/2); j<last; j++) {
          var x = points[j*2];
          var y = points[j*2+1];
          if (spherize) {
            var a = -x/180*Math.PI;
            var t = y/180*Math.PI;
            y = Math.sin(t) * 90;
            x = Math.cos(a) * 90 * Math.cos(t);
            var z = Math.sin(a) * 90 * Math.cos(t);
            poly.push(new THREE.Vector3(x, y, z));
          } else {
            poly.push(new THREE.Vector2(x, y));
          }
        }
        if (false &&r.type == SHP.POLYGON) {
          console.log('new polygon', poly.length, points.length/2);
          polys.push(new THREE.ExtrudeGeometry(new THREE.Shape(poly), {amount: 0}));
        } else {
          console.log('new polyline', poly.length, points.length/2);
          var geo = new THREE.Geometry();
          geo.vertices = poly;
          lines.push(geo);
        }
      }
    }
  }
  var model = new THREE.Object3D();
  for (var i=0; i<lines.length; i++) {
    model.add(new THREE.Line(
      lines[i],
      new THREE.LineBasicMaterial({color: 'black', lineWidth: 2}),
      THREE.LineStrip
    ));
  }
  for (var i=0; i<polys.length; i++) {
    model.add(new THREE.Mesh(
      polys[i],
      new THREE.MeshBasicMaterial({color: 0x88ff44, wireframe: true})
    ));
  }
  return model;
};
