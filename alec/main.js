const VERT = `
attribute float scale;
attribute vec2 indices;
attribute vec3 customPosition;

uniform float count;
uniform float isElevatedPosition;

void main() {
  float dynamic_y = sin((indices.x + count) * 0.3) * 50.0 + sin((indices.y + count) * 0.5) * 50.0;
  float y = position.y > 100.0 ? position.y : dynamic_y;
  vec3 pos = vec3(position.x, y, position.z);
  vec3 tweenPos = pos + (customPosition - pos) * isElevatedPosition;
  vec4 mvPosition = modelViewMatrix * vec4( tweenPos, 1.0 );
  gl_PointSize = scale * ( 500.0 / - mvPosition.z );
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAG = `
uniform vec3 color;
void main() {
  if ( length( gl_PointCoord - vec2( 0.5, 0.5 ) ) > 0.475 ) discard;
  gl_FragColor = vec4( color, 1.0 );
}
`;

if (WEBGL.isWebGLAvailable() === false) {
  document.body.appendChild(WEBGL.getWebGLErrorMessage());
}

var SEPARATION = 100,
  AMOUNTX = 50,
  AMOUNTY = 50;
var intcpt = 2500;
var config = {
  scale_default: 32,
  scale_L1: 40,
  scale_L2: 30,
  scale_L3: 20,
  elevation: 400, // y offset
};

/**
 * DATA & TREE STRUCTURE
 */
var selectionArray = [
  "31,2",
  "35,10",
  "41,5",
  "45,14",
  "28,6",
  "36,1",
  "34,14",
  "32,12",
  "44,18",
  "48,12",
  "45,5",
  "40,7",
];

var selectionTree = d3
  .stratify()
  .parentId(d => d[0])
  .id(d => d[1])([
  ["", "root"],
  ["root", "31,2"],
  ["root", "35,10"],
  ["root", "41,5"],
  ["root", "45,14"],
  ["31,2", "28,6"],
  ["31,2", "36,1"],
  ["35,10", "34,14"],
  ["35,10", "32,12"],
  ["45,14", "44,18"],
  ["45,14", "48,12"],
  ["41,5", "45,5"],
  ["41,5", "40,7"],
]);

var tree = data =>
  d3
    .tree()
    .size([Math.PI, window.innerHeight / 3])
    .separation((a, b) => (a.parent == b.parent ? 1 : 2) / a.depth)(
    d3.hierarchy(data)
  );
var radialTree = new Map();

/**
 * INITIALIZATIONS
 */

var selection = new Set(selectionArray),
  fanJourney;
var container, stats;
var camera, scene, renderer, raycaster, controls;
var material, material2;

var field,
  nodes,
  lines = {},
  count = 0;

var mouse = new THREE.Vector2(),
  INTERSECTED;

var windowHalfX = window.innerWidth / 2;
var windowHalfY = window.innerHeight / 2;

var view = 0; //
var transitionStart = -5;
var keyPoints = [];

/**
 * PULL Fan Journey DATA
 */
d3.json("data.json")
  .then(data => {
    const stratefied = d3
      .stratify()
      .id(d => d["ref"])
      .parentId(d => d["Parent Node ID"])([
      { ["ref"]: "root", ["Parent Node ID"]: "" }, // append root node
      ...data["Fan Journey"].filter(
        d => d["Node Name"] && d["Node Hierarchy"] < 4
      ),
    ]);

    fanJourney = d3.hierarchy(stratefied);
  })
  .then(data => {
    console.log("fanJourney", fanJourney);
    init();
    animate();
  });

/**
 * INITIALIZATION
 */
function init() {
  container = document.createElement("div");
  document.body.appendChild(container);

  /**
   * CAMERA
   */
  camera = new THREE.PerspectiveCamera(
    75, // field of view
    window.innerWidth / window.innerHeight, // aspect ratio
    1, // near field
    10000 // far field
  );
  camera.position.x = 2500;
  camera.position.y = 500;
  camera.position.z = -2500;

  /**
   *  SCENE
   */
  scene = new THREE.Scene();

  /**
   * RAYCASTER
   */
  raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 20;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  /**
   * CONTROLS
   * note: controls needed for our 2D -> 3D to work, unclear why
   * */
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.update();

  /**
   * POINT GEOMETRY
   */
  // material - used for both field and nodes
  // notes: https://stackoverflow.com/a/45472747
  material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(0xffffff) },
      isElevatedPosition: { value: 0.0 }, // percent elevated, used in shader to TWEEN values
      count: { value: 0.0 }, // count that ticks up on each render
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });

  initField();
  initNodes();

  /**
   * CALC FINAL RADIAL TREE POSITIONS
   */
  tree(selectionTree)
    .descendants()
    .reverse()
    .forEach(d => {
      const theta = d.x;
      const x = windowHalfX + Math.cos(theta - Math.PI / 2) * d.y;
      const y = windowHalfY + Math.sin(theta - Math.PI / 2) * d.y;
      const worldVector = get3Dfrom2d(x, y, 1000, camera, raycaster);
      radialTree.set(d.data.id, worldVector);
    });

  /**
   * LINE GEOMETRY
   */
  var lineMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(0xffffff),
  });

  document.addEventListener("mousemove", onDocumentMouseMove, false);
  window.addEventListener("resize", onWindowResize, false);
  window.addEventListener("keydown", onKeyPress, false);
  window.addEventListener(
    "click",
    () => {
      if (view === 2 && INTERSECTED) console.log(INTERSECTED);
    },
    false
  );
}

function animate() {
  requestAnimationFrame(animate);

  render();
  controls.update();
  TWEEN.update();
  // stats.update();
}

function render() {
  // pass in count to shader - used for undulations
  count += 0.1;
  material.uniforms.count.value = count;

  var scales = field.geometry.attributes.scale.array;

  raycaster.setFromCamera(mouse, camera);
  raycaster.params.Points.threshold = view === 2 ? 40 : 20;
  field.geometry.boundingBox = null;
  const intersects = raycaster.intersectObject(field);
  if (intersects.length > 0) {
    if (view === 2) {
      const selectedIntersects = intersects.filter(({ index }) =>
        selection.has(Math.floor(index / AMOUNTX) + "," + (index % AMOUNTY))
      );
      INTERSECTED = selectedIntersects.length
        ? selectedIntersects[0].index
        : null;
      scales[INTERSECTED] = 250; // make dot bigger on mouse hover
    } else {
      INTERSECTED = intersects[0].index;
      scales[INTERSECTED] = 64;
    }
  } else if (INTERSECTED !== null) {
    INTERSECTED = null;
  }

  field.geometry.attributes.scale.needsUpdate = true;

  material.uniforms.count.needsUpdate = true;
  renderer.render(scene, camera);
}

/**
 * HELPERS AND HANDLERS
 */

function xpos(x) {
  return x * SEPARATION - (AMOUNTX * SEPARATION) / 2;
}

function zpos(y) {
  return y * SEPARATION - (AMOUNTY * SEPARATION) / 2;
}

function ypos(x, y, c) {
  // return 100;
  return Math.sin((x + c) * 0.3) * 50 + Math.sin((y + c) * 0.5) * 50;
}

function initNodes() {
  var descendants = fanJourney.descendants().filter(d => d["ref"] != "root");
  var numNodes = descendants.length;
  var positions = new Float32Array(numNodes * 3); // 3 positions for each vertex (x, y, z)
  var indices = new Float32Array(numNodes * 2); // 2 positions for each vertex (x, y, z)
  var scales = new Float32Array(numNodes); // 1 for each
  var elevatedPositions = new Float32Array(numNodes * 3); // 3 positions for each vertex (x, y, z)
  var elevatedScales = new Float32Array(numNodes); // 1 for each

  /**
   * go through all the fanJourney nodes and assign:
   * (1) initial `positions` (on the grid)
   * (2) `customPositions` - elevated up
   * (3) `scale` - L1 normal size, descendents are 0
   * (4) `customScale` - L1 are larger, descendents have relative size
   * */

  var i = 0,
    k = 0,
    j = 0;
  for (var i_nodes = 0; i_nodes < numNodes; i_nodes++) {
    // first four, pluck off of selection array
    var currentNode = descendants[i_nodes];
    if (currentNode.data.data["Node Hierarchy"] === 1) {
      var [ix, iy] = selectionArray[i_nodes].split(",");

      // x and z are the same, y is elevated
      positions[i] = elevatedPositions[i] = xpos(ix); // x
      positions[i + 2] = elevatedPositions[i + 2] = zpos(iy); // z

      positions[i + 1] = 100; // normal y
      elevatedPositions[i + 1] = config.elevation; // elevated y

      // used for calculating sine movements
      indices[k] = ix;
      indices[k + 1] = iy;

      scales[j] = config.scale_L1;
    } else {
      console.log("currentNode.data.data", currentNode.data.data);
      // TODO: calculate satellite node positions
      // scales[j] = 32;
    }

    i += 3;
    k += 2;
    j++;
  }

  //  geometry
  var geometry = new THREE.BufferGeometry();
  // positions
  geometry.addAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.addAttribute(
    "customPosition",
    new THREE.BufferAttribute(elevatedPositions, 3)
  );
  // indices
  geometry.addAttribute("indices", new THREE.BufferAttribute(indices, 2));
  // scales
  geometry.addAttribute("scale", new THREE.BufferAttribute(scales, 1));
  geometry.addAttribute(
    "customScale",
    new THREE.BufferAttribute(elevatedScales, 1)
  );

  nodes = new THREE.Points(geometry, material);
  nodes.name = "nodes";
  scene.add(nodes);
}

function initField() {
  var numParticles = AMOUNTX * AMOUNTY;
  var positions = new Float32Array(numParticles * 3); // 3 positions for each vertex (x, y, z)
  var indices = new Float32Array(numParticles * 2); // 2 positions for each vertex (x, y, z)
  var scales = new Float32Array(numParticles); // 1 for each, scale number
  var i = 0,
    k = 0,
    j = 0;

  // initial positions
  for (var ix = 0; ix < AMOUNTX; ix++) {
    for (var iy = 0; iy < AMOUNTY; iy++) {
      positions[i] = xpos(ix); // x
      positions[i + 1] = 100; // y
      positions[i + 2] = zpos(iy); // z

      indices[k] = ix;
      indices[k + 1] = iy;

      scales[j] = 32;

      i += 3;
      k += 2;
      j++;
    }
  }

  //  geometry
  var geometry = new THREE.BufferGeometry();
  geometry.addAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.addAttribute("indices", new THREE.BufferAttribute(indices, 2));
  geometry.addAttribute("scale", new THREE.BufferAttribute(scales, 1));

  field = new THREE.Points(geometry, material);
  field.name = "field";
  scene.add(field);
}

function onKeyPress(e) {
  if (e.keyCode === 32) {
    // space bar
    transitionStart = count;
    view = (view + 1) % 3;
    if (view === 1) {
      transition_view1();
      // setTimeout(() => drawHTMLEls(), 5000);
    }
    // else if (document.querySelector(".ui-nodes").children.length) {
    //   destroyHTML();
    // }
  }
}

/**
 * View O: all dots are in the same undulating field
 *  field: normal position, default scale
 *  nodes: field position, default scale
 *  camera: starting position
 */
function transition_view0() {}

/**
 * View 1: L1 dots rise `above field
 *  field: normal position, lightened scale
 *  nodes: elevated position, larger scale
 *  camera: more birds-eye-view vantage point
 */
function transition_view1() {
  // tween uniform.isElevatedPosition to 1
  const tween = new TWEEN.Tween(material.uniforms.isElevatedPosition)
    .to({ value: 1.0 }, 1000)
    .easing(TWEEN.Easing.Quadratic.Out)
    // .onUpdate(() => { // here we can move the camera accordingly }
    .start();
}

/**
 * View 2: title view, camera zooms in on selected node
 *  field: normal position, lightened scale
 *  nodes: elevated position, larger scale
 *  camera: zooms and rotates to frame selected node
 * note: this view should only be posible from view 1
 */
function transition_view2(node) {}

function destroyHTML() {
  document.querySelectorAll(".ui-nodes div").forEach(e => {
    document.querySelector(".ui-nodes").removeChild(e);
  });
}

function drawHTMLEls() {
  if (document.querySelector(".ui-nodes").children.length) {
    destroyHTML();
  }
  const { canvas } = renderer.context;
  const positions = field.geometry.attributes.position.array;

  selectionArray.forEach(e => {
    const i = +e.split(",")[0] * AMOUNTX + +e.split(",")[1];

    // returns NDCs from [-1,1]
    const screen = new THREE.Vector3(
      positions[i * 3],
      positions[i * 3 + 1],
      positions[i * 3 + 2]
    ).project(camera);

    // normalizes values for screen dimensions
    const x = Math.round(
      (0.5 + screen.x / 2) * (canvas.width / window.devicePixelRatio)
    );
    const y = Math.round(
      (0.5 - screen.y / 2) * (canvas.height / window.devicePixelRatio)
    );

    const child = document
      .querySelector(".ui-nodes")
      .appendChild(document.createElement("div"));
    child.style.left = x - 14 + "px";
    child.style.top = y - 14 + "px";
  });
  // selection.has(Math.floor(index / AMOUNTX) + "," + (index % AMOUNTY))
}

//https://stackoverflow.com/questions/27409074/converting-3d-position-to-2d-screen-position-r69

function interpolate(from, to, percentDone) {
  return from + (to - from) * percentDone;
}

function onWindowResize() {
  windowHalfX = window.innerWidth / 2;
  windowHalfY = window.innerHeight / 2;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  // drawHTMLEls();
}

function onDocumentMouseMove(event) {
  event.preventDefault();
  mouse.set(
    (event.layerX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
}

/**
 * Given X and Y in DOM screen space [0,width/height],
 *  returns [x, y, z] Vector3 of the intersection of a ray passing through
 *  those points on a plane determined by `at`.
 * @param {*} normX - in screen coordinates with range [0, innerWidth]
 * @param {*} normY - in screen coordinates with range  [0, innerHeight]
 * @param {*} at - the position z directrion from camera origin
 * this acts as a scalar to specify how close to the camera to render the points
 */
function get3Dfrom2d(screenX, screenY, at, camera, raycaster) {
  // Normalize coordinates from screen space to NDC space [-1,1]
  const normX = (screenX / window.innerWidth) * 2 - 1;
  const normY = -(screenY / window.innerHeight) * 2 + 1;

  const pos = new THREE.Vector2(normX, normY);

  // projects a ray out from the camera origin to pos
  raycaster.setFromCamera(pos, camera);

  // get position of ray in direction of pos scalled by t (1000)
  return raycaster.ray.at(at, new THREE.Vector3());
}

// previous render logic below:

// var i = 0,
//   j = 0;

// // t = percent of transition done
// const t = Math.min(1, Math.max(0, (count - transitionStart) / 10));

// for (var ix = 0; ix < AMOUNTX; ix++) {
//   for (var iy = 0; iy < AMOUNTY; iy++) {
//     const slug = ix + "," + iy;
//     const inGroup = selection.has(slug);
//     const x = xpos(ix);
//     const y = ypos(ix, iy, count);
//     const z = zpos(iy);

//     let v2x, v2y, v2z;

//     // starting position
//     if (inGroup) {
//       const worldVector = radialTree.get(slug);
//       v2x = worldVector.x;
//       v2y = worldVector.y;
//       v2z = worldVector.z;
//     }

//     // VIEW 0
//     // transitions between radial position and starting position
//     if (view === 0) {
//       // const tween = new TWEEN.Tween(positions[i]).to({});

//       positions[i] = inGroup ? interpolate(v2x, x, t) : x;
//       positions[i + 1] = inGroup ? interpolate(v2y, y, t) : y;
//       positions[i + 2] = inGroup ? interpolate(v2z, z, t) : z;

//       scales[j] = 32;
//       scales[j] =
//         (Math.sin((ix + count) * 0.3) + 1) * 8 +
//         (Math.sin((iy + count) * 0.5) + 1) * 8;

//       // VIEW 1
//       // raise points up out of the field
//     } else if (view === 1) {
//       positions[i] = x;
//       positions[i + 1] = inGroup
//         ? interpolate(ypos(ix, iy, transitionStart), 400, t)
//         : y;
//       positions[i + 2] = z;

//       scales[j] = inGroup
//         ? interpolate(16, 40, t)
//         : (Math.sin((ix + count) * 0.3) + 1) * 8 +
//           (Math.sin((iy + count) * 0.5) + 1) * 8;

//       // VIEW 2
//       // forms radial view
//     } else if (view === 2) {
//       positions[i] = inGroup ? interpolate(x, v2x, t) : x;
//       positions[i + 1] = inGroup ? interpolate(400, v2y, t) : y;
//       positions[i + 2] = inGroup ? interpolate(z, v2z, t) : z;

//       scales[j] = inGroup ? interpolate(40, 40, t) : interpolate(16, 8, t);
//     }

//     i += 3;
//     j++;
//   }
// }

// var curve = new THREE.CatmullRomCurve3(
//   selectionTree.children.map(({ id }) => {
//     const i = +id.split(",")[0] * AMOUNTX + +id.split(",")[1];
//     return new THREE.Vector3(
//       positions[i * 3],
//       positions[i * 3 + 1],
//       positions[i * 3 + 2]
//     );
//   })
// );

// var curvePoints = curve.getPoints(100);
// lines["root"].setFromPoints(curvePoints);
// lines["root"].verticesNeedUpdate = true;
